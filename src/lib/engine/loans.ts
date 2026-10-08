// EMI, amortization, prepayment and debt-payoff calculations.

import { addMonths, dayOfMonth } from "../dates";
import { round2 } from "../money";
import type { ISODate, Loan, Transaction } from "../types";

export function emiFor(principal: number, annualRate: number, months: number, type: "reducing" | "flat" = "reducing"): number {
  if (months <= 0 || principal <= 0) return 0;
  if (type === "flat") {
    const interest = (principal * annualRate * months) / 1200;
    return round2((principal + interest) / months);
  }
  const r = annualRate / 1200;
  if (r === 0) return round2(principal / months);
  const f = Math.pow(1 + r, months);
  return round2((principal * r * f) / (f - 1));
}

export interface Installment {
  index: number;
  date: ISODate;
  opening: number;
  emi: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface Prepayment {
  date: ISODate;
  amount: number;
}

export function loanEmi(loan: Pick<Loan, "emi_amount" | "principal" | "interest_rate" | "tenure_months" | "interest_type">): number {
  return loan.emi_amount && loan.emi_amount > 0
    ? loan.emi_amount
    : emiFor(loan.principal, loan.interest_rate, loan.tenure_months, loan.interest_type);
}

/**
 * Full repayment schedule. Prepayments reduce the outstanding principal and
 * shorten the tenure (EMI stays the same), which is how most Indian lenders
 * apply part-payments by default.
 */
export function amortize(
  loan: Pick<Loan, "principal" | "interest_rate" | "tenure_months" | "interest_type" | "emi_amount" | "first_emi_date">,
  prepayments: Prepayment[] = [],
): Installment[] {
  const emi = loanEmi(loan);
  const out: Installment[] = [];
  const pre = [...prepayments].sort((a, b) => (a.date < b.date ? -1 : 1));
  let pIdx = 0;
  let balance = loan.principal;
  const anchor = dayOfMonth(loan.first_emi_date);
  const flatInterest = loan.interest_type === "flat" ? (loan.principal * loan.interest_rate) / 1200 : 0;
  const flatPrincipal = loan.interest_type === "flat" ? loan.principal / loan.tenure_months : 0;
  const r = loan.interest_rate / 1200;
  const maxInstallments = Math.max(loan.tenure_months * 3, 600);

  for (let i = 0; i < maxInstallments && balance > 0.5; i++) {
    const date = addMonths(loan.first_emi_date, i, anchor);
    while (pIdx < pre.length && pre[pIdx].date <= date) {
      balance = Math.max(0, balance - pre[pIdx].amount);
      pIdx++;
    }
    if (balance <= 0.5) break;
    const opening = balance;
    let interest: number;
    let principal: number;
    if (loan.interest_type === "flat") {
      interest = balance > 0 ? flatInterest : 0;
      principal = Math.min(flatPrincipal || emi - interest, balance);
    } else {
      interest = balance * r;
      principal = Math.min(Math.max(emi - interest, 0), balance);
      if (principal <= 0 && i > loan.tenure_months) break; // EMI never covers interest — stop
    }
    if (balance - principal < 1) principal = balance; // absorb rounding residue in the final EMI
    balance = Math.max(0, balance - principal);
    out.push({
      index: i,
      date,
      opening: round2(opening),
      emi: round2(principal + interest),
      principal: round2(principal),
      interest: round2(interest),
      balance: round2(balance),
    });
  }
  return out;
}

export interface LoanState {
  emi: number;
  schedule: Installment[];
  paidCount: number;
  outstanding: number;
  next?: Installment;
  remainingInstallments: number;
  endDate?: ISODate;
  interestRemaining: number;
  principalPaid: number;
  interestPaid: number;
  progress: number;
}

export function loanState(loan: Loan, transactions: Transaction[]): LoanState {
  const own = transactions.filter((t) => t.loan_id === loan.id);
  const prepayments = own.filter((t) => t.type === "loan_prepayment").map((t) => ({ date: t.date, amount: t.amount }));
  const emiCount = own.filter((t) => t.type === "loan_emi" && !t.is_partial).length;
  const schedule = amortize(loan, prepayments);
  const paidCount = loan.status === "closed" ? schedule.length : Math.min(schedule.length, loan.emis_paid_offset + emiCount);
  const next = schedule[paidCount];
  const outstanding = loan.status === "closed" ? 0 : next ? next.opening : 0;
  const remaining = schedule.slice(paidCount);
  const paid = schedule.slice(0, paidCount);
  return {
    emi: loanEmi(loan),
    schedule,
    paidCount,
    outstanding: round2(outstanding),
    next,
    remainingInstallments: remaining.length,
    endDate: schedule[schedule.length - 1]?.date,
    interestRemaining: round2(remaining.reduce((s, x) => s + x.interest, 0)),
    principalPaid: round2(loan.principal - outstanding),
    interestPaid: round2(paid.reduce((s, x) => s + x.interest, 0)),
    progress: loan.principal > 0 ? Math.min(1, Math.max(0, (loan.principal - outstanding) / loan.principal)) : 1,
  };
}

/** Effect of a hypothetical part-payment on a loan. */
export function simulatePrepayment(loan: Loan, transactions: Transaction[], extra: Prepayment) {
  const existing = transactions
    .filter((t) => t.loan_id === loan.id && t.type === "loan_prepayment")
    .map((t) => ({ date: t.date, amount: t.amount }));
  const before = amortize(loan, existing);
  const after = amortize(loan, [...existing, extra]);
  const totalInterest = (s: Installment[]) => s.reduce((a, x) => a + x.interest, 0);
  return {
    interestSaved: round2(totalInterest(before) - totalInterest(after)),
    monthsSaved: before.length - after.length,
    newEndDate: after[after.length - 1]?.date,
    oldEndDate: before[before.length - 1]?.date,
  };
}

export interface DebtInput {
  id: string;
  name: string;
  balance: number;
  rate: number;
  minPayment: number;
}

export interface DebtPlanResult {
  months: number;
  totalInterest: number;
  totalPaid: number;
  payoff: { id: string; name: string; month: number }[];
  timeline: { month: number; balance: number }[];
  feasible: boolean;
}

/** Snowball (smallest balance first) or avalanche (highest rate first) payoff simulation. */
export function debtPlan(debts: DebtInput[], extraMonthly: number, strategy: "snowball" | "avalanche" | "minimum"): DebtPlanResult {
  const state = debts.filter((d) => d.balance > 0).map((d) => ({ ...d }));
  const payoff: DebtPlanResult["payoff"] = [];
  const timeline: DebtPlanResult["timeline"] = [{ month: 0, balance: round2(state.reduce((s, d) => s + d.balance, 0)) }];
  let totalInterest = 0;
  let totalPaid = 0;
  const budget = state.reduce((s, d) => s + d.minPayment, 0) + (strategy === "minimum" ? 0 : extraMonthly);
  let month = 0;
  for (; month < 600 && state.some((d) => d.balance > 0.5); ) {
    month++;
    for (const d of state) {
      if (d.balance <= 0) continue;
      const interest = (d.balance * d.rate) / 1200;
      d.balance += interest;
      totalInterest += interest;
    }
    let available = budget;
    for (const d of state) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.minPayment, d.balance, available);
      d.balance -= pay;
      available -= pay;
      totalPaid += pay;
    }
    if (strategy !== "minimum") {
      const order = state
        .filter((d) => d.balance > 0.5)
        .sort((a, b) => (strategy === "snowball" ? a.balance - b.balance : b.rate - a.rate));
      for (const d of order) {
        if (available <= 0) break;
        const pay = Math.min(available, d.balance);
        d.balance -= pay;
        available -= pay;
        totalPaid += pay;
      }
    }
    for (const d of state) {
      if (d.balance <= 0.5 && !payoff.find((p) => p.id === d.id)) {
        d.balance = 0;
        payoff.push({ id: d.id, name: d.name, month });
      }
    }
    timeline.push({ month, balance: round2(state.reduce((s, d) => s + Math.max(0, d.balance), 0)) });
  }
  return {
    months: month,
    totalInterest: round2(totalInterest),
    totalPaid: round2(totalPaid),
    payoff,
    timeline,
    feasible: !state.some((d) => d.balance > 0.5),
  };
}
