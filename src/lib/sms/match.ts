// Turns a read SMS into a transaction for your data: which account or card, what kind of entry, and whether it
// pays something you'd already planned (a card bill, an EMI, your salary). Also spots messages already recorded.

import { addDays, diffDays } from "../dates";
import { isPending, settlementDraft, type FinEvent } from "../engine/events";
import type { Positions } from "../engine/ledger";
import type { Account, CreditCard, Dataset, ISODate, Transaction, TxType } from "../types";
import { guessCategory, niceName, type ParsedSms } from "./parse";

export interface SmsRow {
  id: string;
  sender: string | null;
  body: string;
  received_at: string;
  status: "new" | "added" | "ignored";
  transaction_id: string | null;
}

export interface SmsProposal {
  /** ready: safe to add as is · check: needs a look (unsure where, or no account) · duplicate: already recorded · ignore: not a payment */
  state: "ready" | "check" | "duplicate" | "ignore";
  reason?: string;
  tx: (Partial<Transaction> & { type: TxType; amount: number; date: ISODate }) | null;
  account?: Account;
  card?: CreditCard;
  /** The planned item this pays, if any (marks it paid when added). */
  event?: FinEvent;
  duplicateOf?: Transaction;
  /** When the SMS states a balance: what the bank says vs what the app will show after adding this. */
  balance?: { accountId: string; bank: number };
  /**
   * An entry already recorded from an earlier message that this one completes: e.g. "paid ₹5,000" from the CRED
   * wallet (saved as spending) followed by "₹5,000 received from you" in Slice → that entry becomes the transfer.
   */
  replaces?: Transaction;
  /** More entries to add with this one (e.g. loading a wallet with a card: the wallet's side and the card's fee). */
  also?: (Partial<Transaction> & { type: TxType; amount: number; date: ISODate })[];
  parsed: ParsedSms;
}

/** Your own names as banks write them ("ABILASH N"), to spot money you send to yourself. */
export function selfNames(ds: Dataset): string[] {
  const set = ds.profile.preferences?.sms?.selfNames ?? [];
  return [...set, ds.profile.name ?? ""].map((n) => n.trim()).filter((n) => n.length >= 4);
}
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Whether a message names you. Banks shorten names differently, so an initial matches the full word and the full
 * word matches its initial: "Abilash N" matches "ABILASH NARAYANAN", and "Abilash Narayanan" matches "ABILASH N".
 */
export const mentions = (body: string, names: string[]) =>
  names.some((n) => {
    const parts = n.trim().split(/[\s.]+/).filter(Boolean);
    if (!parts.length) return false;
    const words = parts.map((w, i) => (i === 0 ? esc(w) : w.length === 1 ? `${esc(w)}[A-Za-z]*` : `(?:${esc(w)}|${esc(w[0])})`));
    return new RegExp(`(^|[^A-Za-z])${words.join("[\\s.]+")}([^A-Za-z]|$)`, "i").test(body);
  });

const FIRST: Record<string, RegExp> = {
  "HDFC Bank": /hdfc/i,
  "ICICI Bank": /icici/i,
  "Axis Bank": /axis/i,
  "State Bank of India": /\bsbi\b|state bank/i,
  "Kotak Bank": /kotak/i,
  "IDFC First Bank": /idfc/i,
  "YES Bank": /\byes\b/i,
  "Bank of Baroda / OneCard": /\bbob\b|baroda|onecard/i,
  "Canara Bank": /canara/i,
  "Dhanalaxmi Bank": /dhan[a]?laxmi/i,
  "Punjab National Bank": /\bpnb\b|punjab/i,
  "Union Bank": /union/i,
  "Federal Bank": /federal/i,
  "IndusInd Bank": /indusind/i,
  Slice: /slice/i,
  "American Express": /amex|american express/i,
  "AU Bank": /\bau\b/i,
  CRED: /\bcred\b/i,
  Paytm: /paytm/i,
};

const ends = (a: string | null | undefined, b: string | null) => !!a && !!b && (a.endsWith(b) || b.endsWith(a));

function findCard(ds: Dataset, p: ParsedSms): { card?: CreditCard; sure: boolean } {
  const cards = ds.credit_cards.filter((c) => !c.archived);
  if (p.last4) {
    const hit = cards.filter((c) => ends(c.last4, p.last4));
    if (hit.length === 1) return { card: hit[0], sure: true };
  }
  const re = p.bank ? FIRST[p.bank] : null;
  if (re) {
    const hit = cards.filter((c) => re.test(`${c.issuer ?? ""} ${c.name}`) && (!p.last4 || !c.last4));
    if (hit.length === 1) return { card: hit[0], sure: false };
  }
  return { sure: false };
}

function findAccount(ds: Dataset, p: ParsedSms): { account?: Account; sure: boolean } {
  const list = ds.accounts.filter((a) => !a.archived);
  if (p.last4) {
    const hit = list.filter((a) => ends(a.last4, p.last4) || ends(a.card_last4, p.last4));
    if (hit.length === 1) return { account: hit[0], sure: true };
  }
  const re = p.bank ? FIRST[p.bank] : null;
  if (re) {
    const hit = list.filter((a) => re.test(`${a.institution ?? ""} ${a.name}`));
    if (hit.length === 1) return { account: hit[0], sure: !p.last4 || (!hit[0].last4 && !hit[0].card_last4) };
  }
  return { sure: false };
}

/** A planned payment this SMS most likely is: same direction, about the same amount, within a few days. */
function plannedMatch(events: FinEvent[], amount: number, date: ISODate, flow: "in" | "out", test: (e: FinEvent) => boolean): FinEvent | undefined {
  return events
    .filter((e) => isPending(e) && !e.budget && e.flow === flow && test(e))
    .filter((e) => Math.abs(e.remaining - amount) <= Math.max(1, e.remaining * 0.01) && Math.abs(diffDays(e.date, date)) <= 7)
    .sort((a, b) => Math.abs(diffDays(a.date, date)) - Math.abs(diffDays(b.date, date)))[0];
}

/** Recorded already: same amount, same account or card, within two days. */
function findDuplicate(ds: Dataset, amount: number, date: ISODate, where: { accountId?: string; cardId?: string }, ref: string | null): Transaction | undefined {
  return ds.transactions.find((t) => {
    // A balance correction isn't a payment, so it's never "the same payment".
    if (t.type === "adjustment") return false;
    if (ref && t.notes?.includes(ref)) return true;
    // Both carry a bank reference and they differ: two separate payments, even for the same amount.
    const otherRef = t.notes?.match(/Ref (\S+)/)?.[1];
    if (ref && otherRef && otherRef !== ref) return false;
    if (Math.abs(t.amount - amount) > 0.5) return false;
    if (Math.abs(diffDays(t.date, date)) > 2) return false;
    if (where.cardId) return t.card_id === where.cardId;
    if (where.accountId) return t.account_id === where.accountId || t.to_account_id === where.accountId;
    return false;
  });
}

export function proposeFromSms(row: SmsRow, p: ParsedSms, ds: Dataset, positions: Positions, events: FinEvent[], today: ISODate): SmsProposal {
  if (p.ignore) return { state: "ignore", reason: p.ignore, tx: null, parsed: p };
  if (!p.amount || !p.direction) return { state: "check", reason: "Couldn't read the amount", tx: null, parsed: p };
  const date = p.date && p.date <= addDays(today, 1) && p.date >= addDays(today, -400) ? p.date : row.received_at.slice(0, 10);
  const amount = p.amount;
  const name = niceName(p.merchant);
  const cats = ds.categories.filter((c) => !c.archived).map((c) => c.name);
  const category = guessCategory(p.merchant, ds.transactions, cats);
  const notes = [p.ref ? `Ref ${p.ref}` : null, "From bank SMS"].filter(Boolean).join(" · ");
  const base = { amount, date, notes, is_partial: false, reconciled: false, tags: [] as string[] };

  // ---- Credit card
  if (p.instrument === "card") {
    const { card, sure } = findCard(ds, p);
    if (!card) return { state: "check", reason: p.last4 ? `No card ending ${p.last4} — add the last 4 digits to the card` : "Which card?", tx: null, parsed: p };
    if (p.direction === "debit") {
      const tx = { ...base, type: "card_spend" as const, card_id: card.id, account_id: null, description: name ?? "Card spend", category: category ?? null };
      const dup = findDuplicate(ds, amount, date, { cardId: card.id }, p.ref);
      if (dup) return { state: "duplicate", tx, card, duplicateOf: dup, parsed: p };
      return { state: sure ? "ready" : "check", reason: sure ? undefined : "Check the card", tx, card, parsed: p };
    }
    // Money towards the card: a bill payment (pays the planned bill) or a refund.
    if (p.cardPayment) {
      const bill = plannedMatch(events, amount, date, "out", (e) => e.kind === "card_bill" && e.cardId === card.id) ?? events.filter((e) => e.kind === "card_bill" && e.cardId === card.id && isPending(e)).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      const accountId = card.payment_account_id ?? null;
      const tx = bill
        ? { ...base, ...settlementDraft(bill, { amount, date, accountId, partial: amount < bill.remaining - 0.5 }), notes, type: "card_payment" as const, card_id: card.id, account_id: accountId, description: `${card.name} bill` }
        : { ...base, type: "card_payment" as const, card_id: card.id, account_id: accountId, description: `${card.name} bill`, category: null };
      // The bank usually sends its own "debited" message for the same payment: whichever comes first is kept.
      const dup = ds.transactions.find((t) => t.type === "card_payment" && t.card_id === card.id && Math.abs(t.amount - amount) <= 0.5 && Math.abs(diffDays(t.date, date)) <= 3);
      if (dup) return { state: "duplicate", tx, card, duplicateOf: dup, parsed: p };
      return { state: accountId && sure ? "ready" : "check", reason: accountId ? (sure ? undefined : "Check the card") : "Which account paid it?", tx, card, event: bill, parsed: p };
    }
    const tx = { ...base, type: "card_payment" as const, card_id: card.id, account_id: null, description: `Refund${name ? ` · ${name}` : ""}`, category: null, tags: ["refund"] };
    const dup = findDuplicate(ds, amount, date, { cardId: card.id }, p.ref);
    if (dup) return { state: "duplicate", tx, card, duplicateOf: dup, parsed: p };
    return { state: "check", reason: "Refund to the card", tx, card, parsed: p };
  }

  // ---- Bank account or wallet
  const { account, sure } = findAccount(ds, p);
  if (!account) return { state: "check", reason: p.last4 ? `No account ending ${p.last4} — add the last 4 digits to the account` : "Which account?", tx: null, parsed: p };
  const balance = p.balance != null ? { accountId: account.id, bank: p.balance } : undefined;
  const dup = findDuplicate(ds, amount, date, { accountId: account.id }, p.ref);

  // Your own money moving between your accounts: the message names your other account, or you as the payee/payer.
  const counter = p.counterLast4 ? ds.accounts.find((a) => !a.archived && a.id !== account.id && (ends(a.last4, p.counterLast4) || ends(a.card_last4, p.counterLast4))) : undefined;
  if (counter || mentions(row.body, selfNames(ds))) {
    const from = p.direction === "debit" ? account : counter;
    const to = p.direction === "debit" ? counter : account;
    const tx = { ...base, type: "transfer" as const, account_id: from?.id ?? null, to_account_id: to?.id ?? null, card_id: null, description: "Self transfer", category: null };
    const known = !!from && !!to;
    const dupT = ds.transactions.find((t) => t.type === "transfer" && Math.abs(t.amount - amount) <= 0.5 && Math.abs(diffDays(t.date, date)) <= 2 && (t.account_id === account.id || t.to_account_id === account.id));
    if (dupT || dup) return { state: "duplicate", tx, account, duplicateOf: dupT ?? dup, balance, parsed: p };
    // Money in from yourself, source unknown: the other half may already be recorded as an outgoing payment
    // with no payee (wallets and some banks don't say where it went).
    if (p.direction === "credit" && !from) {
      const half = ds.transactions.find(
        (t) => t.type === "expense" && t.account_id && t.account_id !== account.id && Math.abs(t.amount - amount) <= 0.5 && Math.abs(diffDays(t.date, date)) <= 1 && t.tags?.some((g) => g.startsWith("sms:")) && t.description === "Payment",
      );
      if (half) return { state: "ready", tx: { ...tx, account_id: half.account_id }, account, balance, replaces: half, parsed: p };
    }
    return {
      state: known && sure ? "ready" : "check",
      reason: known ? (sure ? undefined : "Check the account") : p.direction === "debit" ? "Sent to yourself — which of your accounts got it?" : "From your own account — which one?",
      tx,
      account,
      balance,
      parsed: p,
    };
  }

  if (p.direction === "debit") {
    // Paying something planned from this account: a card bill, an EMI, rent, a chit or SIP.
    const ev = plannedMatch(events, amount, date, "out", (e) => !e.accountId || e.accountId === account.id || e.kind === "card_bill");
    if (ev) {
      const tx = { ...base, ...settlementDraft(ev, { amount, date, accountId: account.id }), notes, account_id: account.id } as SmsProposal["tx"] & object;
      if (ev.kind === "card_bill") Object.assign(tx, { card_id: ev.cardId });
      if (dup) return { state: "duplicate", tx, account, event: ev, duplicateOf: dup, balance, parsed: p };
      // A card bill paid from the bank may already be in from the card's own SMS.
      const cardDup = ev.kind === "card_bill" ? ds.transactions.find((t) => t.type === "card_payment" && t.card_id === ev.cardId && Math.abs(t.amount - amount) <= 0.5 && Math.abs(diffDays(t.date, date)) <= 3) : undefined;
      if (cardDup) return { state: "duplicate", tx, account, event: ev, duplicateOf: cardDup, balance, parsed: p };
      return { state: sure ? "ready" : "check", reason: sure ? undefined : "Check the account", tx, account, event: ev, balance, parsed: p };
    }
    const tx = { ...base, type: "expense" as const, account_id: account.id, card_id: null, description: name ?? "Payment", category: category ?? null };
    if (dup) return { state: "duplicate", tx, account, duplicateOf: dup, balance, parsed: p };
    return { state: sure ? "ready" : "check", reason: sure ? undefined : "Check the account", tx, account, balance, parsed: p };
  }

  // Money in: salary or other planned income, a repayment, or anything else.
  const ev = plannedMatch(events, amount, date, "in", (e) => !e.accountId || e.accountId === account.id);
  const tx = ev
    ? ({ ...base, ...settlementDraft(ev, { amount, date, accountId: account.id }), notes, account_id: account.id } as SmsProposal["tx"] & object)
    : { ...base, type: "income" as const, account_id: account.id, description: name ?? "Money received", category: category ?? (/salary|sal\b/i.test(row.body) ? "Salary" : null) };
  if (dup) return { state: "duplicate", tx, account, event: ev, duplicateOf: dup, balance, parsed: p };
  return { state: sure ? "ready" : "check", reason: sure ? undefined : "Check the account", tx, account, event: ev, balance, parsed: p };
}

/** What the app says the account holds now (in its own currency). */
export function appBalance(positions: Positions, accountId: string): number | null {
  return positions.accounts.get(accountId)?.balance ?? null;
}

type Item = { row: SmsRow; p: SmsProposal };
const open = (i: Item) => i.p.state === "ready" || i.p.state === "check";
const near = (a: Item, b: Item, days: number) => Math.abs(diffDays(a.p.tx!.date, b.p.tx!.date)) <= days;

/**
 * Looks across all waiting messages, because one payment often sends two or three:
 * - the same UPI reference twice (the bank's two messages for one credit) → one entry;
 * - "sent to yourself" from one account + "received from yourself" in another → one transfer between them;
 * - a card spend at CRED / Dreamplug + "credited to your CRED wallet" → loading the wallet with the card
 *   (not spending), with the small difference as the card's fee.
 */
export function pairSms(items: Item[], ds: Dataset): Item[] {
  const out = items.map((i) => ({ row: i.row, p: { ...i.p } }));
  const dupOf = (i: Item, reason: string) => {
    i.p = { ...i.p, state: "duplicate", reason };
  };
  // 1. Same reference number.
  const byRef = new Map<string, Item[]>();
  for (const i of out) if (open(i) && i.p.parsed.ref && i.p.tx) byRef.set(i.p.parsed.ref, [...(byRef.get(i.p.parsed.ref) ?? []), i]);
  for (const list of byRef.values()) {
    if (list.length < 2) continue;
    const score = (i: Item) => (i.p.tx?.type === "transfer" ? (i.p.tx.account_id ? 1 : 0) + (i.p.tx.to_account_id ? 1 : 0) : 0) + (i.p.balance ? 0.5 : 0);
    const best = [...list].sort((a, b) => score(b) - score(a))[0];
    // Keep the balance from whichever message had it.
    const bal = list.find((i) => i.p.balance)?.p.balance;
    if (bal && !best.p.balance) best.p.balance = bal;
    for (const i of list) if (i !== best) dupOf(i, "Same payment as another message");
  }
  // 2. Two halves of a transfer to yourself.
  const halves = out.filter((i) => open(i) && i.p.tx?.type === "transfer" && (!i.p.tx.account_id || !i.p.tx.to_account_id));
  for (const a of halves) {
    if (!open(a) || a.p.tx!.to_account_id) continue; // a: money out, destination unknown
    const b = halves.find((x) => x !== a && open(x) && !x.p.tx!.account_id && x.p.tx!.to_account_id && x.p.tx!.to_account_id !== a.p.tx!.account_id && Math.abs(x.p.tx!.amount - a.p.tx!.amount) <= 1 && near(a, x, 2));
    if (!b) continue;
    a.p = { ...a.p, state: "ready", reason: undefined, tx: { ...a.p.tx!, to_account_id: b.p.tx!.to_account_id } };
    dupOf(b, "The other half of a transfer between your accounts");
  }
  // 2b. Money out of a wallet with no payee + money in from yourself elsewhere.
  for (const a of out) {
    if (!open(a) || a.p.tx?.type !== "expense" || a.p.account?.type !== "wallet" || a.p.parsed.merchant) continue;
    const b = out.find((x) => x !== a && open(x) && x.p.tx?.type === "transfer" && !x.p.tx.account_id && x.p.tx.to_account_id && Math.abs(x.p.tx.amount - a.p.tx!.amount) <= 1 && near(a, x, 2));
    if (!b) continue;
    a.p = { ...a.p, state: "ready", reason: undefined, tx: { ...a.p.tx!, type: "transfer", to_account_id: b.p.tx!.to_account_id, description: "Self transfer", category: null } };
    dupOf(b, "The other half of a transfer between your accounts");
  }
  // 3. Loading the CRED wallet with a credit card.
  const fees = ds.categories.find((c) => c.kind === "expense" && /fee|charge/i.test(c.name))?.name ?? null;
  for (const c of out) {
    if (!open(c) || c.p.tx?.type !== "card_spend" || !/dreamplug|\bcred\b/i.test(`${c.p.parsed.merchant ?? ""} ${c.row.body}`)) continue;
    const w = out.find((x) => x !== c && open(x) && x.p.account?.type === "wallet" && x.p.parsed.direction === "credit" && x.p.tx && x.p.tx.amount <= c.p.tx!.amount + 0.5 && x.p.tx.amount >= c.p.tx!.amount / 1.035 && near(c, x, 1));
    if (!w) continue;
    const loaded = w.p.tx!.amount;
    const fee = Math.round((c.p.tx!.amount - loaded) * 100) / 100;
    const tag = ["self-transfer"];
    c.p = {
      ...c.p,
      state: "ready",
      reason: undefined,
      tx: { ...c.p.tx!, amount: loaded, description: `${w.p.account!.name} top-up`, category: null, tags: tag },
      also: [
        { ...w.p.tx!, type: "income", account_id: w.p.account!.id, description: `Top-up from ${c.p.card?.name ?? "card"}`, category: null, tags: tag },
        ...(fee >= 0.5 ? [{ ...c.p.tx!, amount: fee, description: "Wallet top-up fee", category: fees, tags: [] }] : []),
      ],
      balance: w.p.balance ?? c.p.balance,
    };
    dupOf(w, "Wallet top-up from your card");
  }
  return out;
}
