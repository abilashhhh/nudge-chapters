// Dashboard metrics (PRD §3.1, §22).

import { addDays, addMonths, endOfMonth, monthKey, startOfMonth } from "../dates";
import { round2 } from "../money";
import type { Dataset, ISODate } from "../types";
import { buildEvents, isPending, type FinEvent } from "./events";
import { classify, computePositions, isOpening, type Positions } from "./ledger";
import { project } from "./projection";
import { perMonth } from "./schedule";

export interface Line {
  label: string;
  amount: number;
  hint?: string;
}

export interface MonthMetrics {
  month: string;
  /** Whether the month is before, containing, or after today. */
  period: "past" | "current" | "future";
  /** Card bills and EMIs you pay for purchases made on someone else's behalf (they repay you). */
  reimbursableDue: number;
  /** Repayments expected this month from people you paid for. */
  reimbursementsExpected: number;
  from: ISODate;
  to: ISODate;
  events: FinEvent[];
  incomeReceived: number;
  incomeExpected: number;
  incomeTotal: number;
  committedPaid: number;
  committedPending: number;
  committedTotal: number;
  committedItems: FinEvent[];
  budgetLimit: number;
  budgetSpent: number;
  budgetRemaining: number;
  budgets: FinEvent[];
  unpaid: FinEvent[];
  unpaidAmount: number;
  overdue: FinEvent[];
  overdueAmount: number;
  availableCash: number;
  reserved: number;
  spendable: number;
  spendableLines: Line[];
  spentThisMonth: number;
  investedThisMonth: number;
  savingsRate: number | null;
}

/** Outflows that are commitments (not discretionary spending budgets). */
export function isCommitment(e: FinEvent): boolean {
  if (e.excluded) return false;
  if (e.budget) return false;
  if (e.kind === "card_spend" || e.kind === "card_statement") return false;
  if (e.kind === "emi" && e.flow === "none") return false; // card EMI shows up in the card bill
  return e.flow === "out";
}

/**
 * Figures for one calendar month. `monthOf` is any date in the month (default: today's month).
 * Each month uses only its own income, bills and commitments: the current month starts from today's actual
 * cash, a future month from the cash projected at the end of the previous month, and a past month shows actuals.
 */
export function monthMetrics(ds: Dataset, positions: Positions, today: ISODate, events?: FinEvent[], monthOf?: ISODate): MonthMetrics {
  const ref = monthOf ?? today;
  const from = startOfMonth(ref);
  const to = endOfMonth(ref);
  const period: MonthMetrics["period"] = to < today ? "past" : from > today ? "future" : "current";
  const evsAll = events ?? buildEvents(ds, { from: period === "current" ? startOfMonth(addMonths(today, -1)) : from, to, today, positions });
  // Overdue items from earlier months still need paying now, so they belong to the current month only.
  const evs = evsAll.filter(
    (e) =>
      (e.date >= from && e.date <= to) ||
      (e.budget && e.budget.periodEnd >= from && e.date <= to) ||
      (period === "current" && e.date < from && (e.status === "overdue" || e.status === "partial")),
  );
  const txUntil = period === "future" ? from : to < today ? to : today;

  const monthTx = ds.transactions.filter((t) => t.date >= from && t.date <= txUntil && !isOpening(t) && period !== "future");
  let incomeReceived = 0;
  let spent = 0;
  let invested = 0;
  const reimbLoans = new Set(ds.loans.filter((l) => l.reimbursable_person).map((l) => l.id));
  for (const t of monthTx) {
    if (t.loan_id && reimbLoans.has(t.loan_id)) continue;
    const c = classify(t);
    incomeReceived += c.income;
    spent += c.expense;
    invested += Math.max(0, c.invested);
  }

  const incomeExpected = evs.filter((e) => e.kind === "income" && isPending(e) && !e.excluded && e.certainty === "known").reduce((s, e) => s + e.remaining, 0);
  const incomeExpectedAll = evs.filter((e) => e.kind === "income" && isPending(e) && !e.excluded).reduce((s, e) => s + e.remaining, 0);

  const committedItems = evs.filter(isCommitment);
  const committedPaid = committedItems.reduce((s, e) => s + (e.date >= from ? e.paid : 0), 0);
  const committedPending = committedItems.filter(isPending).reduce((s, e) => s + e.remaining, 0);

  const budgets = evs.filter((e) => !!e.budget && e.date <= to && e.budget.periodEnd >= from);
  const budgetLimit = budgets.reduce((s, e) => s + (e.budget?.limit ?? 0), 0);
  const budgetSpent = budgets.reduce((s, e) => s + (e.budget?.spent ?? 0), 0);
  const budgetRemaining = budgets.filter(isPending).reduce((s, e) => s + e.remaining, 0);

  const unpaid = committedItems.filter(isPending);
  const overdue = unpaid.filter((e) => e.status === "overdue" || (e.status === "partial" && e.date < today));

  let availableCash = positions.totals.cash;
  if (period === "future") availableCash = project(ds, { today, to: addDays(from, -1), positions }).end.cash;
  else if (period === "past") availableCash = computePositions(ds, to).totals.cash;
  const reserved = positions.totals.reserved;
  const reimbursableDue = round2(
    committedItems.filter(isPending).reduce((s, e) => s + (e.kind === "card_bill" ? Math.min(e.remaining, e.reimbursablePart ?? 0) : e.reimbursable ? e.remaining : 0), 0),
  );
  const reimbPeople = new Set(ds.loans.filter((l) => l.reimbursable_person && l.status === "active").map((l) => l.reimbursable_person!.toLowerCase()));
  const reimbursementsExpected = round2(
    evs
      .filter((e) => e.kind === "lend_due" && isPending(e) && !e.excluded && [...reimbPeople].some((p) => e.title.toLowerCase().includes(p)))
      .reduce((s, e) => s + e.remaining, 0),
  );
  const spendable =
    period === "past" ? 0 : availableCash + incomeExpected + reimbursementsExpected - committedPending - budgetRemaining - reserved;

  const spendableLines: Line[] = [
    { label: "Cash in your accounts", amount: availableCash, hint: "Balances of accounts included in available cash" },
    { label: "Income still expected this month", amount: incomeExpected, hint: "Known income not yet received" },
    { label: "Bills and commitments still to pay", amount: -committedPending, hint: "EMIs, card bills, rent, SIPs, chits and other fixed outflows due by month end (including overdue). Card bills include purchases made for others — you still owe the bank." },
    ...(reimbursementsExpected > 0
      ? [{ label: "Repayments expected from people you paid for", amount: reimbursementsExpected, hint: "Expected this month for reimbursable purchases. Not income — it offsets the card payment you make for them." }]
      : []),
    { label: "Remaining spending budgets", amount: -budgetRemaining, hint: "What's left in your variable budgets for this month" },
    { label: "Set aside in reserves", amount: -reserved, hint: "Money earmarked for future needs" },
  ];

  const incomeTotal = incomeReceived + incomeExpectedAll;
  const expenseTotal = spent + evs.filter((e) => (e.kind === "expense" || e.kind === "card_spend") && isPending(e) && !e.excluded && !e.reimbursable).reduce((s, e) => s + e.remaining, 0);

  return {
    month: monthKey(ref),
    period,
    reimbursableDue,
    reimbursementsExpected,
    from,
    to,
    events: evs,
    incomeReceived: round2(incomeReceived),
    incomeExpected: round2(incomeExpectedAll),
    incomeTotal: round2(incomeTotal),
    committedPaid: round2(committedPaid),
    committedPending: round2(committedPending),
    committedTotal: round2(committedPaid + committedPending),
    committedItems,
    budgetLimit: round2(budgetLimit),
    budgetSpent: round2(budgetSpent),
    budgetRemaining: round2(budgetRemaining),
    budgets,
    unpaid,
    unpaidAmount: round2(unpaid.reduce((s, e) => s + e.remaining, 0)),
    overdue,
    overdueAmount: round2(overdue.reduce((s, e) => s + e.remaining, 0)),
    availableCash,
    reserved,
    spendable: round2(spendable),
    spendableLines: spendableLines.map((l) => ({ ...l, amount: round2(l.amount) })),
    spentThisMonth: round2(spent),
    investedThisMonth: round2(invested),
    savingsRate: incomeTotal > 0 ? ((incomeTotal - expenseTotal) / incomeTotal) * 100 : null,
  };
}

export interface MonthlyNorms {
  income: number;
  fixedExpenses: number;
  essentialExpenses: number;
  variableBudgets: number;
  emis: number;
  /** EMIs for purchases someone else repays — excluded from `emis` and from personal outflow. */
  reimbursableEmis: number;
  sips: number;
  chits: number;
  cardSpend: number;
  outflow: number;
  essentialOutflow: number;
  subscriptions: number;
  subscriptionsYearly: number;
}

/** Rules, loans and investments normalised to a per-month figure. */
export function monthlyNorms(ds: Dataset, positions: Positions): MonthlyNorms {
  let income = 0;
  let fixed = 0;
  let essential = 0;
  let budgets = 0;
  let subs = 0;
  for (const r of ds.recurring_rules) {
    if (!r.active || r.frequency === "once") continue;
    if (r.end_date && r.end_date < positions.asOf) continue;
    const m = r.amount * perMonth(r.frequency, r.interval_days);
    if (r.kind === "income") {
      if (r.certainty !== "uncertain") income += m;
    } else if (r.kind === "expense") {
      if (r.is_fixed) fixed += m;
      else budgets += m;
      if (r.is_essential) essential += m;
      if (r.is_subscription) subs += m;
    }
  }
  let emis = 0;
  let reimbursableEmis = 0;
  for (const { loan, state } of positions.loans.values()) {
    if (loan.status !== "active" || state.remainingInstallments <= 0) continue;
    if (loan.reimbursable_person) reimbursableEmis += state.emi;
    else emis += state.emi;
  }
  let sips = 0;
  for (const i of ds.investments) if (i.sip_active && !i.archived) sips += i.sip_amount;
  let chits = 0;
  // Chit amounts vary with each auction: use the next installment (confirmed, or estimated from past auctions).
  for (const c of positions.chits.values()) if (c.chit.status === "active" && c.remainingCount > 0) chits += c.summary.nextUnpaid?.planned ?? c.summary.estimatePerInstallment;
  let cardSpend = 0;
  for (const c of ds.credit_cards) if (!c.archived) cardSpend += c.expected_monthly_spend;
  const outflow = fixed + budgets + emis + sips + chits + cardSpend;
  return {
    income: round2(income),
    fixedExpenses: round2(fixed),
    essentialExpenses: round2(essential),
    variableBudgets: round2(budgets),
    emis: round2(emis),
    reimbursableEmis: round2(reimbursableEmis),
    sips: round2(sips),
    chits: round2(chits),
    cardSpend: round2(cardSpend),
    outflow: round2(outflow),
    essentialOutflow: round2(essential + emis + chits),
    subscriptions: round2(subs),
    subscriptionsYearly: round2(subs * 12),
  };
}

/** Average monthly consumption over the last `months` complete months (falls back to planned). */
export function monthlyBurn(ds: Dataset, today: ISODate, norms: MonthlyNorms, months = 3): number {
  const end = addDays(startOfMonth(today), -1);
  const start = startOfMonth(addMonths(startOfMonth(today), -months));
  let total = 0;
  let any = false;
  for (const t of ds.transactions) {
    if (t.date < start || t.date > end || isOpening(t)) continue;
    const c = classify(t);
    if (c.expense) {
      total += c.expense;
      any = true;
    }
  }
  const planned = norms.fixedExpenses + norms.variableBudgets + norms.cardSpend;
  return round2(any ? Math.max(total / months, 0) : planned);
}

export function runwayMonths(cash: number, essentialMonthly: number): number | null {
  if (essentialMonthly <= 0) return null;
  return Math.max(0, cash / essentialMonthly);
}

export function upcoming(events: FinEvent[], today: ISODate, days: number): FinEvent[] {
  const until = addDays(today, days);
  return events
    .filter((e) => isPending(e) && e.kind !== "card_statement" && e.date <= until && !(e.kind === "card_spend" && e.estimated) && !e.budget)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.remaining - a.remaining));
}
