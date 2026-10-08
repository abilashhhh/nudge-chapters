// Aggregations for reports (PRD §21, §39.18–39.19, §39.23).

import { addMonths, eachMonth, endOfMonth, monthKey, startOfMonth } from "../dates";
import { round2 } from "../money";
import type { AssetClass, Dataset, ISODate } from "../types";
import { buildEvents, isPending } from "./events";
import { classify, isOpening, type Positions } from "./ledger";
import type { EmergencyFund, GoalProgress, RetirementPlan } from "./goals";
import type { MonthlyNorms } from "./metrics";

export interface MonthRow {
  month: string;
  income: number;
  expenses: number;
  invested: number;
  debtPaid: number;
  net: number;
  savingsRate: number | null;
  projected: boolean;
}

/** Actual months up to the current one, then planned months from the event engine. */
export function monthlySeries(ds: Dataset, positions: Positions, today: ISODate, back = 6, forward = 6): MonthRow[] {
  const from = startOfMonth(addMonths(today, -back));
  const to = endOfMonth(addMonths(today, forward));
  const rows = new Map<string, MonthRow>();
  for (const k of eachMonth(from, to)) {
    rows.set(k, { month: k, income: 0, expenses: 0, invested: 0, debtPaid: 0, net: 0, savingsRate: null, projected: k > monthKey(today) });
  }
  for (const t of ds.transactions) {
    if (t.date < from || t.date > today || isOpening(t)) continue;
    const r = rows.get(monthKey(t.date));
    if (!r) continue;
    const c = classify(t);
    r.income += c.income;
    r.expenses += c.expense;
    r.invested += c.invested;
    r.debtPaid += c.debtPaid;
  }
  if (forward > 0) {
    const evs = buildEvents(ds, { from: today, to, today, positions });
    for (const e of evs) {
      if (!isPending(e) || e.excluded || e.kind === "card_statement") continue;
      const k = monthKey(e.date < today ? today : e.date);
      const r = rows.get(k);
      if (!r) continue;
      if (e.kind === "income") r.income += e.remaining;
      else if (e.kind === "expense" || e.kind === "card_spend") r.expenses += e.remaining;
      else if (e.kind === "sip" || e.kind === "chit") r.invested += e.remaining;
      else if (e.kind === "emi") {
        r.expenses += e.interest ?? 0;
        r.debtPaid += e.remaining - (e.interest ?? 0);
      } else if (e.kind === "borrow_due") r.debtPaid += e.remaining;
    }
  }
  return [...rows.values()].map((r) => {
    const net = r.income - r.expenses;
    return {
      ...r,
      income: round2(r.income),
      expenses: round2(r.expenses),
      invested: round2(r.invested),
      debtPaid: round2(r.debtPaid),
      net: round2(net),
      savingsRate: r.income > 0 ? (net / r.income) * 100 : null,
    };
  });
}

export function categoryBreakdown(ds: Dataset, from: ISODate, to: ISODate) {
  const map = new Map<string, number>();
  for (const t of ds.transactions) {
    if (t.date < from || t.date > to || isOpening(t)) continue;
    const c = classify(t);
    if (!c.expense) continue;
    const key = t.type === "loan_emi" ? "Interest" : t.category || "Uncategorised";
    map.set(key, (map.get(key) ?? 0) + c.expense);
  }
  const total = [...map.values()].reduce((s, v) => s + v, 0);
  const colors = new Map(ds.categories.map((c) => [c.name, c.color]));
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount: round2(amount), share: total ? amount / total : 0, color: colors.get(name) ?? null }))
    .sort((a, b) => b.amount - a.amount);
}

export function fixedVsVariable(ds: Dataset, from: ISODate, to: ISODate) {
  const fixedCats = new Set(ds.categories.filter((c) => c.is_fixed).map((c) => c.name));
  const fixedRules = new Set(ds.recurring_rules.filter((r) => r.is_fixed).map((r) => r.id));
  let fixed = 0;
  let variable = 0;
  for (const t of ds.transactions) {
    if (t.date < from || t.date > to || isOpening(t)) continue;
    const c = classify(t);
    if (!c.expense) continue;
    if ((t.rule_id && fixedRules.has(t.rule_id)) || t.type === "loan_emi" || (t.category && fixedCats.has(t.category))) fixed += c.expense;
    else variable += c.expense;
  }
  return { fixed: round2(fixed), variable: round2(variable) };
}

export function allocation(positions: Positions) {
  const byClass = new Map<AssetClass | "cash", number>();
  byClass.set("cash", positions.totals.allAccounts);
  for (const p of positions.investments.values()) {
    if (p.investment.archived || p.investment.type === "vehicle") continue;
    const k = p.investment.asset_class;
    byClass.set(k, (byClass.get(k) ?? 0) + p.valueBase);
  }
  const total = [...byClass.values()].reduce((s, v) => s + Math.max(0, v), 0);
  return [...byClass.entries()]
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ key: k, amount: round2(v), share: total ? v / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export function domesticSplit(positions: Positions) {
  let domestic = 0;
  let international = 0;
  for (const p of positions.investments.values()) {
    if (p.investment.archived || p.investment.type === "real_estate" || p.investment.type === "vehicle") continue;
    if (p.investment.is_international) international += p.valueBase;
    else domestic += p.valueBase;
  }
  return { domestic: round2(domestic), international: round2(international) };
}

export function concentration(positions: Positions) {
  const items = [...positions.investments.values()].filter((p) => !p.investment.archived && p.valueBase > 0 && p.investment.type !== "vehicle");
  const total = items.reduce((s, p) => s + p.valueBase, 0);
  const sorted = items.sort((a, b) => b.valueBase - a.valueBase);
  return {
    top: sorted.slice(0, 5).map((p) => ({ name: p.investment.name, amount: p.valueBase, share: total ? p.valueBase / total : 0 })),
    hhi: total ? items.reduce((s, p) => s + Math.pow(p.valueBase / total, 2), 0) : 0,
  };
}

export function annualSummary(ds: Dataset, positions: Positions, year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  let income = 0;
  let expenses = 0;
  let invested = 0;
  let debtPaid = 0;
  const largest: { id: string; date: ISODate; description: string; category: string; amount: number }[] = [];
  for (const t of ds.transactions) {
    if (t.date < from || t.date > to || isOpening(t)) continue;
    const c = classify(t);
    income += c.income;
    expenses += c.expense;
    invested += c.invested;
    debtPaid += c.debtPaid;
    if (c.expense > 0) largest.push({ id: t.id, date: t.date, description: t.description || t.category || "Expense", category: t.category || "", amount: c.expense });
  }
  const snaps = ds.net_worth_snapshots.filter((s) => s.date >= from && s.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  const nwStart = snaps[0]?.net_worth ?? null;
  const nwEnd = snaps[snaps.length - 1]?.net_worth ?? positions.totals.netWorth;
  return {
    year,
    income: round2(income),
    expenses: round2(expenses),
    savings: round2(income - expenses),
    savingsRate: income > 0 ? ((income - expenses) / income) * 100 : null,
    invested: round2(invested),
    debtPaid: round2(debtPaid),
    netWorthStart: nwStart,
    netWorthEnd: nwEnd,
    netWorthChange: nwStart != null ? round2(nwEnd - nwStart) : null,
    largest: largest.sort((a, b) => b.amount - a.amount).slice(0, 10),
    categories: categoryBreakdown(ds, from, to),
  };
}

// ---------------------------------------------------------------------------
// Financial health score (PRD §39.19)
// ---------------------------------------------------------------------------

export interface HealthPart {
  key: string;
  label: string;
  score: number;
  detail: string;
  weight: number;
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function healthScore(args: {
  positions: Positions;
  norms: MonthlyNorms;
  ef: EmergencyFund;
  goals: GoalProgress[];
  retirement: RetirementPlan;
  savingsRate: number | null;
}): { overall: number; parts: HealthPart[] } {
  const { positions, norms, ef, goals, retirement, savingsRate } = args;
  const t = positions.totals;
  const parts: HealthPart[] = [];
  const outflow = norms.outflow || 1;
  const liq = t.cash / outflow;
  parts.push({ key: "liquidity", label: "Liquidity", weight: 1, score: clamp((liq / 2) * 100), detail: `Cash covers ${liq.toFixed(1)} months of planned outflows (2+ is healthy).` });
  parts.push({
    key: "emergency",
    label: "Emergency fund",
    weight: 1.2,
    score: clamp(ef.progress * 100),
    detail: `${ef.coverageMonths.toFixed(1)} of ${ef.targetMonths} months of essential expenses set aside.`,
  });
  const dti = norms.income > 0 ? (norms.emis / norms.income) * 100 : norms.emis > 0 ? 100 : 0;
  parts.push({ key: "debt", label: "Debt load", weight: 1.2, score: clamp(100 - Math.max(0, dti - 10) * 2.5), detail: `EMIs take ${dti.toFixed(0)}% of monthly income (under 30% is comfortable).` });
  const sr = savingsRate ?? 0;
  parts.push({ key: "savings", label: "Savings rate", weight: 1.2, score: clamp((sr / 30) * 100), detail: `You keep ${sr.toFixed(0)}% of this month's income (30%+ scores full marks).` });
  const conc = concentration(positions);
  const classes = allocation(positions).filter((a) => a.share > 0.05).length;
  parts.push({
    key: "diversification",
    label: "Diversification",
    weight: 0.8,
    score: t.investments > 0 ? clamp((1 - conc.hhi) * 70 + Math.min(classes, 4) * 7.5) : 0,
    detail: t.investments > 0 ? `${classes} asset classes; largest holding is ${Math.round((conc.top[0]?.share ?? 0) * 100)}% of investments.` : "No investments tracked yet.",
  });
  const active = goals.filter((g) => g.status !== "done");
  const onTrack = active.filter((g) => g.status === "on_track").length;
  parts.push({
    key: "goals",
    label: "Goal progress",
    weight: 0.8,
    score: goals.length ? clamp((goals.reduce((s, g) => s + g.progress, 0) / goals.length) * 60 + (active.length ? (onTrack / active.length) * 40 : 40)) : 50,
    detail: goals.length ? `${onTrack} of ${active.length} active goals on track.` : "No goals set yet.",
  });
  const util = t.creditLimit > 0 ? (t.cardDebt / t.creditLimit) * 100 : 0;
  parts.push({ key: "credit", label: "Credit utilisation", weight: 0.8, score: t.creditLimit > 0 ? clamp(100 - Math.max(0, util - 10) * (100 / 60)) : 100, detail: t.creditLimit > 0 ? `${util.toFixed(0)}% of your total card limit is in use.` : "No credit cards tracked." });
  parts.push({ key: "retirement", label: "Retirement readiness", weight: 1, score: clamp(retirement.readiness), detail: `Projected corpus covers ${Math.round(retirement.readiness)}% of what retirement needs.` });
  const totalW = parts.reduce((s, p) => s + p.weight, 0);
  const overall = clamp(parts.reduce((s, p) => s + p.score * p.weight, 0) / totalW);
  return { overall, parts };
}
