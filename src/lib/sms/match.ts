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
  parsed: ParsedSms;
}

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
    const hit = list.filter((a) => ends(a.last4, p.last4));
    if (hit.length === 1) return { account: hit[0], sure: true };
  }
  const re = p.bank ? FIRST[p.bank] : null;
  if (re) {
    const hit = list.filter((a) => re.test(`${a.institution ?? ""} ${a.name}`));
    if (hit.length === 1) return { account: hit[0], sure: !p.last4 || !hit[0].last4 };
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
    if (ref && t.notes?.includes(ref)) return true;
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
