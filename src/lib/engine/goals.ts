// Goals, emergency fund, retirement and financial-independence planning (PRD §15, §39.3, §39.7–39.9).

import { addMonths, diffMonths } from "../dates";
import { round2 } from "../money";
import type { Dataset, Goal, ISODate } from "../types";
import { resolveAssumptions } from "./defaults";
import type { Positions } from "./ledger";
import type { MonthlyNorms } from "./metrics";

export function futureValue(present: number, monthly: number, annualRate: number, months: number): number {
  const r = annualRate / 1200;
  if (months <= 0) return present;
  if (r === 0) return present + monthly * months;
  const g = Math.pow(1 + r, months);
  return present * g + monthly * ((g - 1) / r);
}

/** Monthly contribution needed to grow `present` to `target` in `months`. */
export function requiredMonthly(target: number, present: number, annualRate: number, months: number): number {
  if (months <= 0) return Math.max(0, target - present);
  const r = annualRate / 1200;
  if (r === 0) return Math.max(0, (target - present) / months);
  const g = Math.pow(1 + r, months);
  return Math.max(0, ((target - present * g) * r) / (g - 1));
}

/** Months until `present` plus contributions reach `target`, or null if never (within 100 years). */
export function monthsToReach(target: number, present: number, monthly: number, annualRate: number): number | null {
  if (present >= target) return 0;
  const r = annualRate / 1200;
  let v = present;
  for (let m = 1; m <= 1200; m++) {
    v = v * (1 + r) + monthly;
    if (v >= target) return m;
  }
  return null;
}

export interface GoalProgress {
  goal: Goal;
  value: number;
  linkedValue: number;
  progress: number;
  gap: number;
  monthsLeft: number | null;
  requiredMonthly: number | null;
  projectedDate: ISODate | null;
  status: "done" | "on_track" | "off_track" | "no_date" | "not_funded";
  rate: number;
}

export function goalProgress(goal: Goal, positions: Positions, today: ISODate, defaultRate = 6): GoalProgress {
  let linked = 0;
  for (const id of goal.linked_account_ids ?? []) linked += positions.accounts.get(id)?.balanceBase ?? 0;
  for (const id of goal.linked_investment_ids ?? []) linked += positions.investments.get(id)?.valueBase ?? 0;
  const value = round2(goal.current_amount + linked);
  const rate = goal.expected_return ?? defaultRate;
  const gap = round2(Math.max(0, goal.target_amount - value));
  const monthsLeft = goal.target_date ? Math.max(0, diffMonths(today, goal.target_date)) : null;
  const req = monthsLeft != null ? round2(requiredMonthly(goal.target_amount, value, rate, Math.max(1, monthsLeft))) : null;
  const m = monthsToReach(goal.target_amount, value, goal.monthly_contribution, rate);
  const projectedDate = m == null ? null : addMonths(today, m);
  let status: GoalProgress["status"];
  if (value >= goal.target_amount) status = "done";
  else if (goal.monthly_contribution <= 0 && m == null) status = "not_funded";
  else if (!goal.target_date) status = "no_date";
  else status = projectedDate && projectedDate <= goal.target_date ? "on_track" : "off_track";
  return {
    goal,
    value,
    linkedValue: round2(linked),
    progress: goal.target_amount > 0 ? Math.min(1, value / goal.target_amount) : 0,
    gap,
    monthsLeft,
    requiredMonthly: req,
    projectedDate,
    status,
    rate,
  };
}

/** Goals that together need more each month than you currently have left over. */
export function goalConflicts(progress: GoalProgress[], monthlySurplus: number) {
  const required = progress
    .filter((p) => p.status !== "done" && p.requiredMonthly != null)
    .reduce((s, p) => s + (p.requiredMonthly ?? 0), 0);
  return { required: round2(required), surplus: round2(monthlySurplus), conflict: required > monthlySurplus && required > 0 };
}

export interface EmergencyFund {
  essentialMonthly: number;
  targetMonths: number;
  target: number;
  current: number;
  coverageMonths: number;
  progress: number;
  reachDate: ISODate | null;
  sources: { name: string; amount: number }[];
}

export function emergencyFund(ds: Dataset, positions: Positions, norms: MonthlyNorms, today: ISODate, targetMonths = 6): EmergencyFund {
  const essential = Math.max(norms.essentialOutflow, norms.essentialExpenses);
  const sources: { name: string; amount: number }[] = [];
  for (const p of positions.accounts.values()) {
    if (p.account.is_emergency_fund && !p.account.archived) sources.push({ name: p.account.name, amount: p.balanceBase });
  }
  const efGoal = ds.goals.find((g) => g.kind === "emergency" && !g.archived);
  let monthly = 0;
  if (efGoal) {
    const gp = goalProgress(efGoal, positions, today);
    const linkedAccountsCounted = efGoal.linked_account_ids.some((id) => positions.accounts.get(id)?.account.is_emergency_fund);
    const amount = linkedAccountsCounted ? efGoal.current_amount : gp.value;
    if (amount > 0) sources.push({ name: efGoal.name, amount });
    monthly = efGoal.monthly_contribution;
  }
  const current = round2(sources.reduce((s, x) => s + x.amount, 0));
  const target = round2(essential * targetMonths);
  const m = monthsToReach(target, current, monthly, 4);
  return {
    essentialMonthly: round2(essential),
    targetMonths,
    target,
    current,
    coverageMonths: essential > 0 ? current / essential : 0,
    progress: target > 0 ? Math.min(1, current / target) : 0,
    reachDate: m == null ? null : addMonths(today, m),
    sources,
  };
}

export interface RetirementPlan {
  currentAge: number | null;
  yearsToRetire: number;
  currentCorpus: number;
  monthlyContribution: number;
  expectedReturn: number;
  projectedCorpus: number;
  requiredCorpus: number;
  monthlySpendToday: number;
  monthlySpendAtRetirement: number;
  monthlyIncomeFromCorpus: number;
  gap: number;
  requiredExtraMonthly: number;
  readiness: number;
}

export function retirementPlan(
  ds: Dataset,
  positions: Positions,
  norms: MonthlyNorms,
  today: ISODate,
  overrides: Partial<{ monthlySpend: number; expectedReturn: number; postReturn: number; includeAllInvestments: boolean }> = {},
): RetirementPlan {
  const p = ds.profile;
  const a = resolveAssumptions(p);
  const year = Number(today.slice(0, 4));
  const currentAge = p.birth_year ? year - p.birth_year : null;
  const yearsToRetire = Math.max(0, p.retirement_age - (currentAge ?? 30));
  const yearsInRetirement = Math.max(1, p.life_expectancy - p.retirement_age);
  let corpus = 0;
  let contribution = 0;
  let weighted = 0;
  for (const ip of positions.investments.values()) {
    const inv = ip.investment;
    if (inv.archived) continue;
    const counts = ip.isRetirement || (overrides.includeAllInvestments && inv.type !== "real_estate" && inv.type !== "vehicle");
    if (!counts) continue;
    corpus += ip.valueBase;
    const rate = inv.type === "epf" ? a.scenarios.base.returns.epf : inv.expected_return ?? a.scenarios.base.returns[inv.asset_class as keyof typeof a.scenarios.base.returns] ?? 7;
    weighted += ip.valueBase * rate;
    contribution += inv.type === "epf" ? inv.employee_contribution + inv.employer_contribution : inv.sip_active ? inv.sip_amount : 0;
  }
  const rg = ds.goals.find((g) => g.kind === "retirement" && !g.archived);
  if (rg) contribution += rg.monthly_contribution;
  const expectedReturn = overrides.expectedReturn ?? (corpus > 0 ? weighted / corpus : 9);
  const months = yearsToRetire * 12;
  const projectedCorpus = futureValue(corpus, contribution, expectedReturn, months);
  const spendToday = overrides.monthlySpend ?? Math.round(Math.max(norms.fixedExpenses + norms.variableBudgets + norms.cardSpend, 0));
  const inflation = a.inflation / 100;
  const spendAtRetirement = spendToday * Math.pow(1 + inflation, yearsToRetire);
  const post = (overrides.postReturn ?? 7) / 100;
  const real = (1 + post) / (1 + inflation) - 1;
  const annual = spendAtRetirement * 12;
  const requiredCorpus = Math.abs(real) < 1e-6 ? annual * yearsInRetirement : (annual * (1 - Math.pow(1 + real, -yearsInRetirement))) / real * (1 + real);
  const gap = Math.max(0, requiredCorpus - projectedCorpus);
  const extra = months > 0 ? requiredMonthly(gap, 0, expectedReturn, months) : gap;
  const incomeFromCorpus = Math.abs(real) < 1e-6
    ? projectedCorpus / yearsInRetirement / 12
    : (projectedCorpus * real) / (1 - Math.pow(1 + real, -yearsInRetirement)) / 12;
  return {
    currentAge,
    yearsToRetire,
    currentCorpus: round2(corpus),
    monthlyContribution: round2(contribution),
    expectedReturn: round2(expectedReturn),
    projectedCorpus: round2(projectedCorpus),
    requiredCorpus: round2(requiredCorpus),
    monthlySpendToday: round2(spendToday),
    monthlySpendAtRetirement: round2(spendAtRetirement),
    monthlyIncomeFromCorpus: round2(incomeFromCorpus),
    gap: round2(gap),
    requiredExtraMonthly: round2(extra),
    readiness: requiredCorpus > 0 ? Math.min(100, (projectedCorpus / requiredCorpus) * 100) : 100,
  };
}

export interface FirePlan {
  annualSpend: number;
  withdrawalRate: number;
  fiNumber: number;
  investable: number;
  fiRatio: number;
  monthlySavings: number;
  savingsRate: number | null;
  yearsToFI: number | null;
  fiDate: ISODate | null;
  coastFiNumber: number;
  isCoastFI: boolean;
  requiredSavingsRate: number | null;
}

export function firePlan(
  ds: Dataset,
  positions: Positions,
  norms: MonthlyNorms,
  today: ISODate,
  overrides: Partial<{ annualSpend: number; withdrawalRate: number; expectedReturn: number; monthlySavings: number }> = {},
): FirePlan {
  const a = resolveAssumptions(ds.profile);
  const annualSpend = overrides.annualSpend ?? (norms.fixedExpenses + norms.variableBudgets + norms.cardSpend + norms.emis) * 12;
  const wr = overrides.withdrawalRate ?? 4;
  const fiNumber = annualSpend / (wr / 100);
  const t = positions.totals;
  const investable = t.cash + t.investments;
  const monthlySavings = overrides.monthlySavings ?? Math.max(0, norms.income - (norms.fixedExpenses + norms.variableBudgets + norms.cardSpend + norms.emis));
  const r = overrides.expectedReturn ?? 10;
  const inflation = a.inflation;
  let years: number | null = null;
  let v = investable;
  let target = fiNumber;
  for (let m = 1; m <= 1200; m++) {
    v = v * (1 + r / 1200) + monthlySavings;
    target = target * (1 + inflation / 1200);
    if (v >= target) {
      years = m / 12;
      break;
    }
  }
  if (investable >= fiNumber) years = 0;
  const year = Number(today.slice(0, 4));
  const age = ds.profile.birth_year ? year - ds.profile.birth_year : 30;
  const yrsToRetire = Math.max(1, ds.profile.retirement_age - age);
  const fiAtRetirement = fiNumber * Math.pow(1 + inflation / 100, yrsToRetire);
  const coast = fiAtRetirement / Math.pow(1 + r / 100, yrsToRetire);
  const reqMonthly = requiredMonthly(fiAtRetirement, investable, r, yrsToRetire * 12);
  return {
    annualSpend: round2(annualSpend),
    withdrawalRate: wr,
    fiNumber: round2(fiNumber),
    investable: round2(investable),
    fiRatio: fiNumber > 0 ? investable / fiNumber : 0,
    monthlySavings: round2(monthlySavings),
    savingsRate: norms.income > 0 ? (monthlySavings / norms.income) * 100 : null,
    yearsToFI: years,
    fiDate: years == null ? null : addMonths(today, Math.round(years * 12)),
    coastFiNumber: round2(coast),
    isCoastFI: investable >= coast,
    requiredSavingsRate: norms.income > 0 ? (reqMonthly / norms.income) * 100 : null,
  };
}
