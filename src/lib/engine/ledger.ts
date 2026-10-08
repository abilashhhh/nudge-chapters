// Current positions computed from actual transactions.
//
// Business rules enforced here (PRD §31):
//  1. Transfers between own accounts move cash but are never income or expense.
//  2. A credit-card purchase is the expense; paying the card bill only settles
//     the liability (cash down, card outstanding down) — never a second expense.
//  3. Lending moves cash into a receivable; repayments move it back.
//  4. Investment purchases move cash into assets; they are not consumption.
//  5. Only balance adjustments may change a balance without a counterpart.

import { diffMonths, yearsBetween } from "../dates";
import { round2, toBase, type MoneyContext } from "../money";
import type {
  Account, CardStatement, Chit, CreditCard, Dataset, Investment, ISODate, Lending, Loan, Transaction,
} from "../types";
import { chitSummary, type ChitSummary } from "./chits";
import { RETIREMENT_TYPES } from "./defaults";
import { loanState, type LoanState } from "./loans";
import { xirr } from "./xirr";

/** Cash movements a transaction causes, as [accountId, delta] pairs. */
export function cashDeltas(t: Transaction): [string, number][] {
  const a = t.account_id;
  const amt = t.amount;
  switch (t.type) {
    case "income":
    case "lend_repayment":
    case "borrow":
    case "invest_sell":
    case "chit_payout":
    case "adjustment":
      return a ? [[a, amt]] : [];
    case "expense":
    case "card_payment":
    case "lend":
    case "borrow_repayment":
    case "invest_buy":
    case "loan_prepayment":
    case "chit_installment":
      return a ? [[a, -amt]] : [];
    case "loan_emi":
      return a && !t.card_id ? [[a, -amt]] : [];
    case "transfer": {
      const out: [string, number][] = [];
      if (a) out.push([a, -amt]);
      if (t.to_account_id) out.push([t.to_account_id, amt]);
      return out;
    }
    case "card_spend":
    default:
      return [];
  }
}

/** Change in a credit card's outstanding caused by a transaction (+ means you owe more). */
export function cardDelta(t: Transaction): number {
  if (!t.card_id) return 0;
  if (t.type === "card_spend") return t.amount;
  if (t.type === "loan_emi") return t.amount; // card EMI billed on the card
  if (t.type === "card_payment") return -t.amount;
  return 0;
}

/** How a transaction counts in income/expense reports. Transfers, settlements and investments count as neither. */
export function classify(t: Transaction): { income: number; expense: number; invested: number; debtPaid: number } {
  switch (t.type) {
    case "income":
      return { income: t.amount, expense: 0, invested: 0, debtPaid: 0 };
    case "expense":
    case "card_spend":
      return { income: 0, expense: t.amount, invested: 0, debtPaid: 0 };
    case "loan_emi": {
      const interest = t.interest_part ?? 0;
      return { income: 0, expense: interest, invested: 0, debtPaid: t.amount - interest };
    }
    case "loan_prepayment":
    case "borrow_repayment":
      return { income: 0, expense: 0, invested: 0, debtPaid: t.amount };
    case "invest_buy":
    case "chit_installment":
      return { income: 0, expense: 0, invested: t.amount, debtPaid: 0 };
    case "invest_sell":
      return { income: 0, expense: 0, invested: -t.amount, debtPaid: 0 };
    default:
      return { income: 0, expense: 0, invested: 0, debtPaid: 0 };
  }
}

export function isOpening(t: Transaction): boolean {
  return Array.isArray(t.tags) && t.tags.includes("opening");
}

// ---------------------------------------------------------------------------

export interface AccountPosition {
  account: Account;
  balance: number;
  balanceBase: number;
}

export interface StatementState {
  statement: CardStatement;
  paid: number;
  remaining: number;
  status: "paid" | "partially_paid" | "generated" | "overdue";
  paymentIds: string[];
}

export interface CardPosition {
  card: CreditCard;
  outstanding: number;
  available: number;
  utilization: number;
  statements: StatementState[];
  unbilled: number;
  billedUnpaid: number;
}

export interface ChitPosition {
  chit: Chit;
  /** Installment-by-installment view: actual, confirmed and projected amounts kept apart. */
  summary: ChitSummary;
  paidCount: number;
  paidAmount: number;
  remainingCount: number;
  asset: number;
  liability: number;
  expectedPayout: number;
  endDate: ISODate;
}

export interface InvestmentPosition {
  investment: Investment;
  units: number | null;
  price: number | null;
  value: number;
  valueBase: number;
  invested: number;
  gain: number;
  gainPct: number;
  xirr: number | null;
  estimatedValue: number;
  isRetirement: boolean;
}

export interface LendingPosition {
  lending: Lending;
  repaid: number;
  outstanding: number;
  status: "outstanding" | "partially_repaid" | "settled" | "written_off";
}

export interface Positions {
  asOf: ISODate;
  accounts: Map<string, AccountPosition>;
  cards: Map<string, CardPosition>;
  loans: Map<string, { loan: Loan; state: LoanState }>;
  chits: Map<string, ChitPosition>;
  investments: Map<string, InvestmentPosition>;
  lendings: Map<string, LendingPosition>;
  totals: {
    cash: number;
    allAccounts: number;
    reserved: number;
    investments: number;
    marketInvestments: number;
    retirement: number;
    physical: number;
    receivables: number;
    chitAssets: number;
    cardDebt: number;
    loanDebt: number;
    borrowed: number;
    chitLiability: number;
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    creditLimit: number;
  };
}

export function moneyCtx(ds: Pick<Dataset, "profile">): MoneyContext {
  return { currency: ds.profile.currency || "INR", locale: ds.profile.locale || "en-IN", fx: ds.profile.fx_rates || {} };
}

export function accountBalance(account: Account, txs: Transaction[], asOf: ISODate): number {
  let bal = account.opening_balance;
  for (const t of txs) {
    if (t.date < account.opening_date || t.date > asOf) continue;
    for (const [id, d] of cashDeltas(t)) if (id === account.id) bal += d;
  }
  return round2(bal);
}

export function cardOutstanding(card: CreditCard, txs: Transaction[], asOf: ISODate): number {
  let bal = card.opening_outstanding;
  for (const t of txs) {
    if (t.card_id !== card.id || t.date < card.opening_date || t.date > asOf) continue;
    bal += cardDelta(t);
  }
  return round2(bal);
}

/** Allocate card payments to statements: linked payments first, then unlinked ones FIFO by date. */
export function statementStates(card: CreditCard, statements: CardStatement[], txs: Transaction[], today: ISODate): StatementState[] {
  const own = statements.filter((s) => s.card_id === card.id).sort((a, b) => (a.statement_date < b.statement_date ? -1 : 1));
  const payments = txs.filter((t) => t.card_id === card.id && t.type === "card_payment").sort((a, b) => (a.date < b.date ? -1 : 1));
  const paid = new Map<string, number>();
  const ids = new Map<string, string[]>();
  const add = (sid: string, amt: number, tid: string) => {
    paid.set(sid, (paid.get(sid) ?? 0) + amt);
    ids.set(sid, [...(ids.get(sid) ?? []), tid]);
  };
  const unlinked: { amount: number; date: ISODate; id: string }[] = [];
  for (const p of payments) {
    const byStatement = p.statement_id && own.find((s) => s.id === p.statement_id);
    const byOccurrence = !byStatement && p.occurrence_date && own.find((s) => s.due_date === p.occurrence_date);
    const target = byStatement || byOccurrence;
    if (target) add(target.id, p.amount, p.id);
    else unlinked.push({ amount: p.amount, date: p.date, id: p.id });
  }
  for (const u of unlinked) {
    let left = u.amount;
    for (const s of own) {
      if (left <= 0) break;
      if (u.date < s.statement_date) continue;
      const rem = s.total_due - (paid.get(s.id) ?? 0);
      if (rem <= 0) continue;
      const use = Math.min(rem, left);
      add(s.id, use, u.id);
      left -= use;
    }
  }
  return own.map((s) => {
    const p = round2(paid.get(s.id) ?? 0);
    const remaining = round2(Math.max(0, s.total_due - p));
    let status: StatementState["status"];
    if (remaining <= 0.5) status = "paid";
    else if (s.due_date < today) status = "overdue";
    else if (p > 0) status = "partially_paid";
    else status = "generated";
    return { statement: s, paid: p, remaining, status, paymentIds: ids.get(s.id) ?? [] };
  });
}

export function chitPosition(chit: Chit, txs: Transaction[], asOf: ISODate): ChitPosition {
  const summary = chitSummary(chit, txs, asOf);
  const received = summary.payoutReceived != null || chit.payout_status === "received";
  const closed = chit.status !== "active";
  // Paid in so far: actual payments, plus older installments with no amount entered valued at the base.
  const paidAmount = round2(summary.actualPaid + summary.unrecordedEstimate);
  return {
    chit,
    summary,
    paidCount: summary.paidCount,
    paidAmount,
    remainingCount: summary.remainingCount,
    // Before you take the payout, what you've paid in is money owed back to you.
    asset: closed || received ? 0 : paidAmount,
    // After taking the payout, the remaining installments are a debt: confirmed amounts plus estimates for auctions still to come.
    liability: closed || !received ? 0 : summary.projectedRemainingEstimate,
    expectedPayout: summary.payoutExpected,
    endDate: chit.start_date ? addMonthsSafe(chit.start_date, chit.installments - 1) : chit.start_date,
  };
}

function addMonthsSafe(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  const dim = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(day, dim));
  return dt.toISOString().slice(0, 10);
}

export function investmentPosition(inv: Investment, txs: Transaction[], today: ISODate, ctx: MoneyContext): InvestmentPosition {
  const own = txs.filter((t) => t.investment_id === inv.id && !isOpening(t) && t.date <= today);
  const buys = own.filter((t) => t.type === "invest_buy");
  const sells = own.filter((t) => t.type === "invest_sell");
  const unitBased = inv.units != null && inv.current_price != null;
  const isRetirement = RETIREMENT_TYPES.has(inv.type);
  let units: number | null = null;
  let value: number;
  let invested: number;

  if (unitBased) {
    const after = (t: Transaction) => t.date >= inv.track_from;
    const buyUnits = buys.filter(after).reduce((s, t) => s + (t.units ?? (t.price ? t.amount / t.price : 0)), 0);
    const sellUnits = sells.filter(after).reduce((s, t) => s + (t.units ?? (t.price ? t.amount / t.price : 0)), 0);
    const baseUnits = inv.units ?? 0;
    const grossUnits = baseUnits + buyUnits;
    const grossInvested = inv.invested_amount + buys.filter(after).reduce((s, t) => s + t.amount, 0);
    const avg = grossUnits > 0 ? grossInvested / grossUnits : 0;
    units = Math.max(0, grossUnits - sellUnits);
    invested = Math.max(0, grossInvested - sellUnits * avg);
    value = units * (inv.current_price ?? 0);
  } else {
    const asOf = inv.value_as_of ?? inv.track_from;
    const base = inv.current_value ?? inv.invested_amount;
    value =
      base +
      buys.filter((t) => t.date > asOf).reduce((s, t) => s + t.amount, 0) -
      sells.filter((t) => t.date > asOf).reduce((s, t) => s + t.amount, 0);
    invested =
      inv.invested_amount +
      buys.filter((t) => t.date >= inv.track_from).reduce((s, t) => s + t.amount, 0) -
      sells.filter((t) => t.date >= inv.track_from).reduce((s, t) => s + t.amount, 0);
    // Deposits accrue at a known contractual rate; everything else stays at its last known value.
    if ((inv.type === "fd" || inv.type === "rd") && inv.interest_rate && asOf < today) {
      const end = inv.maturity_date && inv.maturity_date < today ? inv.maturity_date : today;
      const yrs = Math.max(0, yearsBetween(asOf, end));
      value = value * Math.pow(1 + inv.interest_rate / 400, yrs * 4); // quarterly compounding
    }
  }

  let estimatedValue = value;
  if (inv.type === "epf") {
    const asOf = inv.value_as_of ?? inv.track_from;
    const months = Math.max(0, diffMonths(asOf, today));
    estimatedValue = value + months * (inv.employee_contribution + inv.employer_contribution);
  }

  const flows: { date: ISODate; amount: number }[] = [];
  if (inv.invested_amount > 0) flows.push({ date: inv.start_date || inv.track_from, amount: -inv.invested_amount });
  for (const t of buys) if (t.date >= inv.track_from) flows.push({ date: t.date, amount: -t.amount });
  for (const t of sells) if (t.date >= inv.track_from) flows.push({ date: t.date, amount: t.amount });
  flows.push({ date: today, amount: value });
  const x = flows.length >= 2 && value > 0 ? xirr(flows) : null;

  value = round2(value);
  invested = round2(invested);
  return {
    investment: inv,
    units: units == null ? null : Math.round(units * 1e6) / 1e6,
    price: inv.current_price ?? null,
    value,
    valueBase: round2(toBase(value, inv.currency, ctx)),
    invested,
    gain: round2(value - invested),
    gainPct: invested > 0 ? ((value - invested) / invested) * 100 : 0,
    xirr: x,
    estimatedValue: round2(estimatedValue),
    isRetirement,
  };
}

export function lendingPosition(l: Lending, txs: Transaction[]): LendingPosition {
  const type = l.direction === "lent" ? "lend_repayment" : "borrow_repayment";
  const repaid = round2(txs.filter((t) => t.lending_id === l.id && t.type === type).reduce((s, t) => s + t.amount, 0));
  const outstanding = l.written_off ? 0 : round2(Math.max(0, l.amount - repaid));
  let status: LendingPosition["status"];
  if (l.written_off) status = "written_off";
  else if (outstanding <= 0.5) status = "settled";
  else if (repaid > 0) status = "partially_repaid";
  else status = "outstanding";
  return { lending: l, repaid, outstanding, status };
}

export function computePositions(ds: Dataset, asOf: ISODate): Positions {
  const ctx = moneyCtx(ds);
  const txs = ds.transactions;

  const accounts = new Map<string, AccountPosition>();
  let cash = 0;
  let allAccounts = 0;
  for (const a of ds.accounts) {
    const balance = accountBalance(a, txs, asOf);
    const balanceBase = round2(toBase(balance, a.currency, ctx));
    accounts.set(a.id, { account: a, balance, balanceBase });
    if (a.archived) continue;
    allAccounts += balanceBase;
    if (a.include_in_cash) cash += balanceBase;
  }

  const cards = new Map<string, CardPosition>();
  let cardDebt = 0;
  let creditLimit = 0;
  for (const c of ds.credit_cards) {
    const outstanding = cardOutstanding(c, txs, asOf);
    const statements = statementStates(c, ds.card_statements, txs, asOf);
    const billedUnpaid = round2(statements.reduce((s, x) => s + x.remaining, 0));
    cards.set(c.id, {
      card: c,
      outstanding,
      available: round2(Math.max(0, c.credit_limit - outstanding)),
      utilization: c.credit_limit > 0 ? Math.max(0, outstanding) / c.credit_limit : 0,
      statements,
      billedUnpaid,
      unbilled: round2(Math.max(0, outstanding - billedUnpaid)),
    });
    if (!c.archived) {
      cardDebt += Math.max(0, outstanding);
      creditLimit += c.credit_limit;
    }
  }

  const loans = new Map<string, { loan: Loan; state: LoanState }>();
  let loanDebt = 0;
  for (const l of ds.loans) {
    const state = loanState(l, txs);
    loans.set(l.id, { loan: l, state });
    if (l.status === "active") loanDebt += state.outstanding;
  }

  const chits = new Map<string, ChitPosition>();
  let chitAssets = 0;
  let chitLiability = 0;
  for (const c of ds.chits) {
    const p = chitPosition(c, txs, asOf);
    chits.set(c.id, p);
    chitAssets += p.asset;
    chitLiability += p.liability;
  }

  const investments = new Map<string, InvestmentPosition>();
  let invTotal = 0;
  let market = 0;
  let retirement = 0;
  let physical = 0;
  for (const inv of ds.investments) {
    const p = investmentPosition(inv, txs, asOf, ctx);
    investments.set(inv.id, p);
    if (inv.archived) continue;
    if (inv.type === "real_estate" || inv.type === "vehicle") physical += p.valueBase;
    else {
      invTotal += p.valueBase;
      if (p.isRetirement) retirement += p.valueBase;
      else market += p.valueBase;
    }
  }

  const lendings = new Map<string, LendingPosition>();
  let receivables = 0;
  let borrowed = 0;
  for (const l of ds.lendings) {
    const p = lendingPosition(l, txs);
    lendings.set(l.id, p);
    if (l.direction === "lent") receivables += p.outstanding;
    else borrowed += p.outstanding;
  }

  const reserved = round2(ds.reserves.reduce((s, r) => s + r.current_amount, 0));
  const totalAssets = round2(allAccounts + invTotal + physical + receivables + chitAssets);
  const totalLiabilities = round2(cardDebt + loanDebt + borrowed + chitLiability);

  return {
    asOf,
    accounts,
    cards,
    loans,
    chits,
    investments,
    lendings,
    totals: {
      cash: round2(cash),
      allAccounts: round2(allAccounts),
      reserved,
      investments: round2(invTotal),
      marketInvestments: round2(market),
      retirement: round2(retirement),
      physical: round2(physical),
      receivables: round2(receivables),
      chitAssets: round2(chitAssets),
      cardDebt: round2(cardDebt),
      loanDebt: round2(loanDebt),
      borrowed: round2(borrowed),
      chitLiability: round2(chitLiability),
      totalAssets,
      totalLiabilities,
      netWorth: round2(totalAssets - totalLiabilities),
      creditLimit: round2(creditLimit),
    },
  };
}
