// The cash-flow engine (PRD §16, §41, §42).
//
// Every planned financial item becomes a dated FinEvent. Events are reconciled
// against actual transactions so a plan and its actual are never both counted:
// a transaction that settles an event carries (rule_id, occurrence_date) or the
// loan/chit/investment/statement it belongs to.

import { addDays, clampDay, diffDays, diffMonths, parseISO } from "../dates";
import { round2 } from "../money";
import type {
  Certainty, CreditCard, Dataset, EventOverride, ISODate, OverrideSource, RecurringRule, ScenarioAssumptions, Transaction, TxType,
} from "../types";
import { DEFAULT_ASSUMPTIONS } from "./defaults";
import { computePositions, isOpening, type Positions } from "./ledger";
import { nextOccurrenceAfter, occurrences } from "./schedule";

export type EventKind =
  | "income"
  | "expense"
  | "transfer"
  | "card_spend"
  | "card_bill"
  | "card_statement"
  | "emi"
  | "sip"
  | "chit"
  | "chit_payout"
  | "lend_due"
  | "borrow_due";

export type EventStatus = "planned" | "due" | "overdue" | "paid" | "received" | "partial" | "skipped" | "cancelled" | "adjusted";

export interface FinEvent {
  key: string;
  source: OverrideSource;
  sourceId: string;
  occurrence: ISODate;
  date: ISODate;
  kind: EventKind;
  title: string;
  amount: number;
  paid: number;
  remaining: number;
  status: EventStatus;
  /** Effect on cash in `accountId`: in, out, or none (card spends, info events). Transfers are "none" overall. */
  flow: "in" | "out" | "none";
  accountId?: string | null;
  toAccountId?: string | null;
  cardId?: string | null;
  loanId?: string;
  chitId?: string;
  investmentId?: string;
  lendingId?: string;
  statementId?: string;
  ruleId?: string;
  category?: string | null;
  isFixed: boolean;
  isEssential: boolean;
  isSubscription?: boolean;
  certainty: Certainty;
  /** Not counted in this scenario's totals (uncertain items in base/conservative). */
  excluded: boolean;
  /** An estimate rather than a known amount (card bills, expected card spend). */
  estimated: boolean;
  txIds: string[];
  principal?: number;
  interest?: number;
  installment?: number;
  installments?: number;
  budget?: { spent: number; periodEnd: ISODate; limit: number };
}

export const SETTLED: EventStatus[] = ["paid", "received", "adjusted", "skipped", "cancelled"];
export const PENDING: EventStatus[] = ["planned", "due", "overdue", "partial"];

export function isPending(e: FinEvent): boolean {
  return PENDING.includes(e.status) && e.remaining > 0.005;
}

export function isOutflow(e: FinEvent): boolean {
  return e.flow === "out";
}

export interface BuildOptions {
  from: ISODate;
  to: ISODate;
  today: ISODate;
  scenario?: ScenarioAssumptions;
  positions?: Positions;
}

function overrideMap(list: EventOverride[]): Map<string, EventOverride> {
  const m = new Map<string, EventOverride>();
  for (const o of list) m.set(`${o.source_type}:${o.source_id}:${o.occurrence_date}`, o);
  return m;
}

function pendingStatus(date: ISODate, today: ISODate): EventStatus {
  if (date < today) return "overdue";
  if (date === today) return "due";
  return "planned";
}

function growthFactor(rule: Pick<RecurringRule, "growth_pct" | "kind">, date: ISODate, today: ISODate, sc: ScenarioAssumptions): number {
  if (date <= today) return 1;
  const g = rule.growth_pct ?? (rule.kind === "income" ? sc.salaryGrowth : rule.kind === "expense" ? sc.expenseGrowth : 0);
  if (!g) return 1;
  const years = Math.floor(Math.max(0, diffMonths(today, date)) / 12);
  return Math.pow(1 + g / 100, years);
}

/** Apply override, then settle against transactions. Shared by every source. */
function resolve(
  base: Omit<FinEvent, "status" | "paid" | "remaining" | "txIds" | "date" | "excluded"> & { date?: ISODate },
  ov: EventOverride | undefined,
  txs: Transaction[],
  today: ISODate,
  futureAmount: (amt: number, date: ISODate) => number,
  includeUncertain: boolean,
): FinEvent {
  let date = base.date ?? base.occurrence;
  let amount = base.amount;
  if (ov?.action === "reschedule" && ov.new_date) date = ov.new_date;
  if (ov?.action === "adjust" && ov.new_amount != null) amount = ov.new_amount;
  const excluded = base.certainty === "uncertain" && !includeUncertain;
  const paid = round2(txs.reduce((s, t) => s + t.amount, 0));
  const ev: FinEvent = { ...base, date, amount, paid, remaining: 0, status: "planned", txIds: txs.map((t) => t.id), excluded };
  if (ov?.action === "skip") {
    ev.status = "skipped";
    return ev;
  }
  if (ov?.action === "cancel") {
    ev.status = "cancelled";
    return ev;
  }
  if (txs.length) {
    const partial = txs.some((t) => t.is_partial) && paid < amount - 0.5;
    if (partial) {
      ev.status = "partial";
      ev.remaining = round2(amount - paid);
    } else if (Math.abs(paid - amount) > 0.5) {
      ev.status = "adjusted";
    } else {
      ev.status = base.flow === "in" ? "received" : "paid";
    }
    return ev;
  }
  if (!(ov?.action === "adjust")) ev.amount = round2(futureAmount(amount, date));
  ev.remaining = ev.amount;
  ev.status = pendingStatus(date, today);
  return ev;
}

function keep(e: FinEvent, from: ISODate, to: ISODate): boolean {
  if (e.date > to) return false;
  if (e.date >= from) return true;
  return isPending(e); // unsettled items from before the window stay visible until handled
}

// ---------------------------------------------------------------------------

export function buildEvents(ds: Dataset, opts: BuildOptions): FinEvent[] {
  const { from, to, today } = opts;
  const sc = opts.scenario ?? DEFAULT_ASSUMPTIONS.scenarios.base;
  const positions = opts.positions ?? computePositions(ds, today);
  const ovs = overrideMap(ds.event_overrides);
  const txs = ds.transactions;
  const events: FinEvent[] = [];

  const byRuleOcc = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.rule_id && t.occurrence_date) {
      const k = `${t.rule_id}:${t.occurrence_date}`;
      byRuleOcc.set(k, [...(byRuleOcc.get(k) ?? []), t]);
    }
  }

  // --- Recurring rules (income, expenses, transfers, budgets) ---------------
  for (const rule of ds.recurring_rules) {
    if (!rule.active) continue;
    const genFrom = rule.track_from > rule.start_date ? rule.track_from : rule.start_date;
    const dates = occurrences(rule, genFrom, to);
    const isBudget = rule.kind === "expense" && !rule.is_fixed && !!rule.category;
    const onCard = rule.kind === "expense" && !!rule.card_id;
    const kind: EventKind = rule.kind === "income" ? "income" : rule.kind === "transfer" ? "transfer" : onCard ? "card_spend" : "expense";
    const flow: FinEvent["flow"] = rule.kind === "income" ? "in" : rule.kind === "expense" && !onCard ? "out" : "none";

    for (const o of dates) {
      const ov = ovs.get(`rule:${rule.id}:${o}`);
      const base = {
        key: `rule:${rule.id}:${o}`,
        source: "rule" as const,
        sourceId: rule.id,
        ruleId: rule.id,
        occurrence: o,
        kind,
        title: rule.name,
        amount: rule.amount,
        flow,
        accountId: rule.account_id,
        toAccountId: rule.to_account_id,
        cardId: rule.card_id,
        category: rule.category,
        isFixed: rule.is_fixed,
        isEssential: rule.is_essential,
        isSubscription: rule.is_subscription,
        certainty: rule.certainty,
        estimated: !rule.is_fixed,
      };
      const factor = (amt: number, d: ISODate) => {
        let a = amt * growthFactor(rule, d, today, sc);
        if (rule.kind === "income") a *= sc.incomeFactor;
        if (rule.kind === "expense" && !rule.is_fixed) a *= sc.variableExpenseFactor;
        return a;
      };

      if (isBudget) {
        // A spending budget: consumed by actual spending in its category during the period.
        const next = nextOccurrenceAfter(rule, o);
        const periodEnd = next ? addDays(next, -1) : addDays(o, 30);
        const spentTxs = txs.filter(
          (t) =>
            (t.type === "expense" || t.type === "card_spend") &&
            t.date >= o &&
            t.date <= periodEnd &&
            ((t.rule_id == null && t.category === rule.category) || (t.rule_id === rule.id)),
        );
        const spent = round2(spentTxs.reduce((s, t) => s + t.amount, 0));
        let limit = rule.amount;
        if (ov?.action === "adjust" && ov.new_amount != null) limit = ov.new_amount;
        const ev: FinEvent = {
          ...base,
          date: o,
          amount: limit,
          paid: spent,
          remaining: 0,
          status: "planned",
          txIds: spentTxs.map((t) => t.id),
          excluded: false,
          budget: { spent, periodEnd, limit },
        };
        if (ov?.action === "skip" || ov?.action === "cancel") {
          ev.status = ov.action === "skip" ? "skipped" : "cancelled";
        } else if (periodEnd < today) {
          ev.status = spent > limit + 0.5 ? "adjusted" : "paid";
        } else if (o <= today) {
          const scaled = round2(factor(limit, o));
          ev.amount = scaled;
          ev.remaining = round2(Math.max(0, scaled - spent));
          ev.status = spent > 0 ? (ev.remaining > 0 ? "partial" : "paid") : "due";
          ev.budget = { spent, periodEnd, limit: scaled };
        } else {
          ev.amount = round2(factor(limit, o));
          ev.remaining = ev.amount;
          ev.budget = { spent: 0, periodEnd, limit: ev.amount };
        }
        if (keep(ev, from, to)) events.push(ev);
        continue;
      }

      const ev = resolve(base, ov, byRuleOcc.get(`${rule.id}:${o}`) ?? [], today, factor, sc.includeUncertain);
      if (keep(ev, from, to)) events.push(ev);
    }
  }

  // --- SIPs -------------------------------------------------------------------
  for (const inv of ds.investments) {
    if (!inv.sip_active || !(inv.sip_amount > 0) || inv.archived) continue;
    const start = inv.start_date && inv.start_date > inv.track_from ? inv.start_date : inv.track_from;
    const spec = { frequency: "monthly" as const, start_date: start, end_date: inv.maturity_date, day_of_month: inv.sip_day };
    const own = txs.filter((t) => t.investment_id === inv.id && t.type === "invest_buy" && t.occurrence_date);
    for (const o of occurrences(spec, start, to)) {
      const ov = ovs.get(`sip:${inv.id}:${o}`);
      const ev = resolve(
        {
          key: `sip:${inv.id}:${o}`,
          source: "sip",
          sourceId: inv.id,
          investmentId: inv.id,
          occurrence: o,
          kind: "sip",
          title: `SIP · ${inv.name}`,
          amount: inv.sip_amount,
          flow: "out",
          accountId: inv.sip_account_id,
          category: "Investments",
          isFixed: true,
          isEssential: false,
          certainty: "known",
          estimated: false,
        },
        ov,
        own.filter((t) => t.occurrence_date === o),
        today,
        (a) => a,
        sc.includeUncertain,
      );
      if (keep(ev, from, to)) events.push(ev);
    }
  }

  // --- Loans / EMIs -----------------------------------------------------------
  for (const loan of ds.loans) {
    if (loan.status !== "active") continue;
    const lp = positions.loans.get(loan.id);
    if (!lp) continue;
    const { schedule, paidCount } = lp.state;
    const emiTxs = txs
      .filter((t) => t.loan_id === loan.id && t.type === "loan_emi" && !t.is_partial)
      .sort((a, b) => ((a.occurrence_date ?? a.date) < (b.occurrence_date ?? b.date) ? -1 : 1));
    for (let i = loan.emis_paid_offset; i < schedule.length; i++) {
      const inst = schedule[i];
      if (inst.date > to) break;
      const tx = i < paidCount ? emiTxs[i - loan.emis_paid_offset] : undefined;
      const onCard = !!loan.card_id;
      const ov = ovs.get(`loan:${loan.id}:${inst.date}`);
      const ev = resolve(
        {
          key: `loan:${loan.id}:${inst.date}`,
          source: "loan",
          sourceId: loan.id,
          loanId: loan.id,
          occurrence: inst.date,
          kind: "emi",
          title: `EMI · ${loan.name}`,
          amount: inst.emi,
          flow: onCard ? "none" : "out",
          accountId: loan.payment_account_id,
          cardId: loan.card_id,
          category: "EMI",
          isFixed: true,
          isEssential: true,
          certainty: "known",
          estimated: false,
          principal: inst.principal,
          interest: inst.interest,
          installment: i + 1,
          installments: schedule.length,
        },
        ov && ov.action !== "skip" ? ov : undefined,
        tx ? [tx] : [],
        today,
        (a) => a,
        true,
      );
      if (i < paidCount && !tx) {
        ev.status = "paid";
        ev.remaining = 0;
      }
      if (keep(ev, from, to)) events.push(ev);
    }
  }

  // --- Chits ------------------------------------------------------------------
  for (const chit of ds.chits) {
    if (chit.status !== "active") continue;
    const cp = positions.chits.get(chit.id);
    if (!cp) continue;
    const instTxs = txs
      .filter((t) => t.chit_id === chit.id && t.type === "chit_installment")
      .sort((a, b) => ((a.occurrence_date ?? a.date) < (b.occurrence_date ?? b.date) ? -1 : 1));
    const anchor = Number(chit.start_date.slice(8, 10));
    const sd = parseISO(chit.start_date);
    for (let i = chit.installments_paid_offset; i < chit.installments; i++) {
      const date = clampDay(sd.getUTCFullYear(), sd.getUTCMonth() + i, anchor);
      if (date > to) break;
      const tx = i < cp.paidCount ? instTxs[i - chit.installments_paid_offset] : undefined;
      const ov = ovs.get(`chit:${chit.id}:${date}`);
      const ev = resolve(
        {
          key: `chit:${chit.id}:${date}`,
          source: "chit",
          sourceId: chit.id,
          chitId: chit.id,
          occurrence: date,
          kind: "chit",
          title: `Chit · ${chit.name}`,
          amount: chit.monthly_contribution,
          flow: "out",
          accountId: chit.account_id,
          category: "Chit",
          isFixed: true,
          isEssential: false,
          certainty: "known",
          estimated: false,
          installment: i + 1,
          installments: chit.installments,
        },
        ov && ov.action !== "skip" ? ov : undefined,
        tx ? [tx] : [],
        today,
        (a) => a,
        true,
      );
      if (i < cp.paidCount && !tx) {
        ev.status = "paid";
        ev.remaining = 0;
      }
      if (keep(ev, from, to)) events.push(ev);
    }
    const payoutTx = txs.find((t) => t.chit_id === chit.id && t.type === "chit_payout");
    if (chit.payout_date || payoutTx) {
      const date = payoutTx?.occurrence_date ?? chit.payout_date ?? payoutTx!.date;
      const ev = resolve(
        {
          key: `chit:${chit.id}:payout:${date}`,
          source: "chit",
          sourceId: chit.id,
          chitId: chit.id,
          occurrence: date,
          kind: "chit_payout",
          title: `Chit payout · ${chit.name}`,
          amount: cp.expectedPayout,
          flow: "in",
          accountId: chit.account_id,
          category: "Chit",
          isFixed: false,
          isEssential: false,
          certainty: "expected",
          estimated: !payoutTx,
        },
        undefined,
        payoutTx ? [payoutTx] : [],
        today,
        (a) => a,
        true,
      );
      if (chit.payout_status === "received" && !payoutTx) {
        ev.status = "received";
        ev.remaining = 0;
      }
      if (keep(ev, from, to)) events.push(ev);
    }
  }

  // --- Lendings (expected repayments) ------------------------------------------
  for (const l of ds.lendings) {
    const lp = positions.lendings.get(l.id);
    if (!lp || !l.expected_date || lp.outstanding <= 0.5) continue;
    const lent = l.direction === "lent";
    const ov = ovs.get(`lending:${l.id}:${l.expected_date}`);
    const ev = resolve(
      {
        key: `lending:${l.id}:${l.expected_date}`,
        source: "lending",
        sourceId: l.id,
        lendingId: l.id,
        occurrence: l.expected_date,
        kind: lent ? "lend_due" : "borrow_due",
        title: lent ? `Repayment from ${l.person}` : `Repay ${l.person}`,
        amount: lp.outstanding,
        flow: lent ? "in" : "out",
        accountId: l.account_id,
        category: "Lending",
        isFixed: !lent,
        isEssential: !lent,
        certainty: lent ? (l.include_in_projection ? "expected" : "uncertain") : "known",
        estimated: false,
      },
      ov,
      [],
      today,
      (a) => a,
      sc.includeUncertain,
    );
    if (keep(ev, from, to)) events.push(ev);
  }

  // --- Credit cards: recorded statements, projected bills and expected spend ---
  for (const card of ds.credit_cards) {
    if (card.archived) continue;
    const cp = positions.cards.get(card.id);
    if (!cp) continue;
    for (const st of cp.statements) {
      const s = st.statement;
      if (s.statement_date >= from && s.statement_date <= to) {
        events.push({
          key: `card-statement:${s.id}`,
          source: "card",
          sourceId: card.id,
          cardId: card.id,
          statementId: s.id,
          occurrence: s.statement_date,
          date: s.statement_date,
          kind: "card_statement",
          title: `${card.name} statement`,
          amount: s.total_due,
          paid: 0,
          remaining: 0,
          status: "paid",
          flow: "none",
          isFixed: true,
          isEssential: true,
          certainty: "known",
          excluded: false,
          estimated: false,
          txIds: [],
        });
      }
      const ov = ovs.get(`card:${card.id}:${s.due_date}`);
      const pays = txs.filter((t) => st.paymentIds.includes(t.id));
      const base = {
        key: `card:${card.id}:${s.due_date}`,
        source: "card" as const,
        sourceId: card.id,
        cardId: card.id,
        statementId: s.id,
        occurrence: s.due_date,
        kind: "card_bill" as const,
        title: `${card.name} bill`,
        amount: s.total_due,
        flow: "out" as const,
        accountId: card.payment_account_id,
        category: "Credit card",
        isFixed: true,
        isEssential: true,
        certainty: "known" as const,
        estimated: false,
      };
      let ev: FinEvent;
      if (st.remaining <= 0.5) {
        ev = { ...base, date: s.due_date, paid: st.paid, remaining: 0, status: "paid", txIds: st.paymentIds, excluded: false };
      } else {
        ev = resolve(base, ov, [], today, (a) => a, true);
        ev.paid = st.paid;
        ev.txIds = pays.map((p) => p.id);
        ev.remaining =
          ov?.action === "skip" || ov?.action === "cancel"
            ? 0
            : ov?.action === "adjust" && ov.new_amount != null
              ? round2(Math.max(0, ov.new_amount - st.paid))
              : st.remaining;
        if (st.paid > 0 && ev.remaining > 0) ev.status = ev.date < today ? "overdue" : "partial";
      }
      if (keep(ev, from, to)) events.push(ev);
    }
  }

  // Projected card cycles need the card-spend events generated above.
  for (const card of ds.credit_cards) {
    if (card.archived) continue;
    const cp = positions.cards.get(card.id);
    if (!cp) continue;
    events.push(...projectCardCycles(card, cp.unbilled, cp.statements.map((s) => s.statement.statement_date), events, ds, ovs, today, from, to, sc));
  }

  return events.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date < b.date ? -1 : 1));
}

export function statementDateOnOrAfter(card: Pick<CreditCard, "statement_day">, d: ISODate): ISODate {
  const p = parseISO(d);
  const s = clampDay(p.getUTCFullYear(), p.getUTCMonth(), card.statement_day);
  return s >= d ? s : clampDay(p.getUTCFullYear(), p.getUTCMonth() + 1, card.statement_day);
}

export function dueDateFor(card: Pick<CreditCard, "statement_day" | "due_day">, statementDate: ISODate): ISODate {
  const p = parseISO(statementDate);
  const sameMonth = clampDay(p.getUTCFullYear(), p.getUTCMonth(), card.due_day);
  return card.due_day > card.statement_day && sameMonth > statementDate
    ? sameMonth
    : clampDay(p.getUTCFullYear(), p.getUTCMonth() + 1, card.due_day);
}

function projectCardCycles(
  card: CreditCard,
  unbilled: number,
  recordedStatementDates: ISODate[],
  events: FinEvent[],
  ds: Dataset,
  ovs: Map<string, EventOverride>,
  today: ISODate,
  from: ISODate,
  to: ISODate,
  sc: ScenarioAssumptions,
): FinEvent[] {
  const out: FinEvent[] = [];
  const lastRecorded = recordedStatementDates.sort().at(-1);
  let cursor = statementDateOnOrAfter(card, lastRecorded && lastRecorded >= today ? addDays(lastRecorded, 1) : today);
  // Spends not yet on a statement: pending items on this card, effective no earlier than today.
  const spends = events
    .filter((e) => e.cardId === card.id && (e.kind === "card_spend" || (e.kind === "emi" && e.flow === "none")) && isPending(e) && !e.excluded)
    .map((e) => ({ date: e.date < today ? today : e.date, amount: e.remaining }));
  const paymentsByDue = new Map<string, Transaction[]>();
  for (const t of ds.transactions) {
    if (t.card_id === card.id && t.type === "card_payment" && !t.statement_id && t.occurrence_date) {
      paymentsByDue.set(t.occurrence_date, [...(paymentsByDue.get(t.occurrence_date) ?? []), t]);
    }
  }
  let prev = addDays(today, -1);
  let carried = unbilled;
  let first = true;
  const cycleDays = 30.4375;
  for (let guard = 0; guard < 600; guard++) {
    const S = cursor;
    const due = dueDateFor(card, S);
    if (S > to) break;
    let expected = 0;
    if (card.expected_monthly_spend > 0) {
      const span = first ? Math.max(0, diffDays(today, S)) : diffDays(prev, S);
      const years = Math.floor(Math.max(0, diffMonths(today, S)) / 12);
      expected = round2(
        card.expected_monthly_spend * Math.min(1, span / cycleDays) * Math.pow(1 + sc.expenseGrowth / 100, years) * sc.variableExpenseFactor,
      );
      if (expected > 0.5) {
        out.push({
          key: `card-spend:${card.id}:${S}`,
          source: "card",
          sourceId: card.id,
          cardId: card.id,
          occurrence: S,
          date: S,
          kind: "card_spend",
          title: `Expected spend · ${card.name}`,
          amount: expected,
          paid: 0,
          remaining: expected,
          status: "planned",
          flow: "none",
          category: "Card spending",
          isFixed: false,
          isEssential: false,
          certainty: "expected",
          excluded: false,
          estimated: true,
          txIds: [],
        });
      }
    }
    const cycleSpend = spends.filter((s) => s.date > prev && s.date <= S).reduce((a, s) => a + s.amount, 0);
    const bill = round2(carried + cycleSpend + expected);
    carried = 0;
    if (bill > 0.5 && due <= to) {
      const ov = ovs.get(`card:${card.id}:${due}`);
      const pays = paymentsByDue.get(due) ?? [];
      const ev = resolve(
        {
          key: `card:${card.id}:${due}`,
          source: "card",
          sourceId: card.id,
          cardId: card.id,
          occurrence: due,
          kind: "card_bill",
          title: `${card.name} bill`,
          amount: bill,
          flow: "out",
          accountId: card.payment_account_id,
          category: "Credit card",
          isFixed: true,
          isEssential: true,
          certainty: "known",
          estimated: true,
        },
        ov,
        pays,
        today,
        (a) => a,
        true,
      );
      if (keep(ev, from, to)) out.push(ev);
    }
    if (S >= from && S <= to) {
      out.push({
        key: `card-statement:${card.id}:${S}`,
        source: "card",
        sourceId: card.id,
        cardId: card.id,
        occurrence: S,
        date: S,
        kind: "card_statement",
        title: `${card.name} statement (est.)`,
        amount: bill,
        paid: 0,
        remaining: 0,
        status: "planned",
        flow: "none",
        isFixed: true,
        isEssential: true,
        certainty: "known",
        excluded: false,
        estimated: true,
        txIds: [],
      });
    }
    prev = S;
    first = false;
    cursor = statementDateOnOrAfter(card, addDays(S, 1));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Turning an event into the transaction that settles it
// ---------------------------------------------------------------------------

export interface SettleInput {
  amount: number;
  date: ISODate;
  accountId?: string | null;
  partial?: boolean;
  notes?: string;
}

export function settlementDraft(e: FinEvent, input: SettleInput): Partial<Transaction> & { type: TxType } {
  const common = {
    amount: round2(input.amount),
    date: input.date,
    account_id: input.accountId ?? e.accountId ?? null,
    occurrence_date: e.occurrence,
    is_partial: !!input.partial,
    description: e.title,
    notes: input.notes ?? null,
    category: e.category ?? null,
    reconciled: false,
    tags: [] as string[],
  };
  switch (e.kind) {
    case "income":
      return { ...common, type: "income", rule_id: e.ruleId };
    case "expense":
      return { ...common, type: "expense", rule_id: e.ruleId };
    case "transfer":
      return { ...common, type: "transfer", rule_id: e.ruleId, to_account_id: e.toAccountId };
    case "card_spend":
      return { ...common, type: "card_spend", rule_id: e.ruleId, card_id: e.cardId, account_id: null };
    case "card_bill":
      return { ...common, type: "card_payment", card_id: e.cardId, statement_id: e.statementId ?? null, category: null };
    case "emi": {
      const ratio = e.amount > 0 ? input.amount / e.amount : 1;
      return {
        ...common,
        type: "loan_emi",
        loan_id: e.loanId,
        card_id: e.cardId ?? null,
        account_id: e.cardId ? null : common.account_id,
        principal_part: round2((e.principal ?? 0) * ratio),
        interest_part: round2((e.interest ?? 0) * ratio),
        category: "Interest",
      };
    }
    case "sip":
      return { ...common, type: "invest_buy", investment_id: e.investmentId, category: null };
    case "chit":
      return { ...common, type: "chit_installment", chit_id: e.chitId, category: null };
    case "chit_payout":
      return { ...common, type: "chit_payout", chit_id: e.chitId, category: null };
    case "lend_due":
      return { ...common, type: "lend_repayment", lending_id: e.lendingId, category: null, occurrence_date: null };
    case "borrow_due":
      return { ...common, type: "borrow_repayment", lending_id: e.lendingId, category: null, occurrence_date: null };
    default:
      return { ...common, type: "expense" };
  }
}

export function eventsForTransactions(txs: Transaction[]): Transaction[] {
  return txs.filter((t) => !isOpening(t));
}
