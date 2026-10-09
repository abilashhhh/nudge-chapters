// Phase 2 planning tools, all built on the same engine (planMonth / monthMetrics / project):
//   • salaryDayPlan — the month's allocation checklist when salary arrives (§2.1)
//   • forecast      — every upcoming event with the balance left after it, and low-balance warnings (§2.2)
//   • purchaseCheck — can I buy X in month M, what it does to my goals, and a save-up schedule (§2.3)
//   • stressPresets — ready-made what-ifs for cash-flow stress tests (§2.5)

import { addMonths, diffMonths, endOfMonth, formatDate, monthKey, startOfMonth } from "../dates";
import { round2 } from "../money";
import type { Dataset, ISODate } from "../types";
import { isPending, type FinEvent } from "./events";
import type { Positions } from "./ledger";
import { isCommitment } from "./metrics";
import { planMonth, type MonthPlan } from "./planner";
import { project, type WhatIf } from "./projection";

// ---------------------------------------------------------------------------
// §2.1 Salary-day plan

export type PlanGroup = "bills" | "cards" | "emis" | "chits" | "repay" | "tasks" | "sips" | "goal" | "budgets" | "flexible";

export interface PlanLine {
  group: PlanGroup;
  label: string;
  amount: number;
  reason: string;
  goalId?: string;
  eventKey?: string;
}

export const GROUP_LABEL: Record<PlanGroup, string> = {
  bills: "Essentials & bills",
  cards: "Credit card payments",
  emis: "EMIs",
  chits: "Chit installments",
  repay: "Money you owe",
  tasks: "Planned tasks",
  sips: "Investments (SIPs)",
  goal: "Goals",
  budgets: "Spending budgets",
  flexible: "Flexible money",
};
const ORDER: PlanGroup[] = ["bills", "cards", "emis", "chits", "repay", "tasks", "sips", "goal", "budgets", "flexible"];

function groupOf(e: FinEvent): PlanGroup {
  if (e.source === "task") return "tasks";
  if (e.kind === "card_bill") return "cards";
  if (e.kind === "emi") return "emis";
  if (e.kind === "chit") return "chits";
  if (e.kind === "sip") return "sips";
  if (e.kind === "borrow_due") return "repay";
  return "bills";
}

export interface SalaryPlan {
  plan: MonthPlan;
  month: string;
  lines: PlanLine[];
  /** Commitments + budgets + goals + flexible: everything the month's money is assigned to. */
  assigned: number;
  flexible: number;
  status: "accepted" | "skipped" | null;
  salaryReceived: number;
}

export function salaryDayPlan(ds: Dataset, positions: Positions, today: ISODate, monthOf: ISODate = today, fmt: (n: number) => string = (n) => String(Math.round(n))): SalaryPlan {
  const plan = planMonth(ds, positions, today, monthOf, fmt);
  const m = plan.month;
  const lines: PlanLine[] = [];
  const due = m.events.filter((e) => isCommitment(e) && (m.period === "current" ? isPending(e) : true));
  for (const e of due) {
    const amt = m.period === "current" ? e.remaining : e.amount;
    if (amt < 0.5) continue;
    const g = groupOf(e);
    const when = `due ${formatDate(e.date, "short")}`;
    const reason =
      g === "cards"
        ? `${when}${(e.reimbursablePart ?? 0) > 0.5 ? ` · includes ${fmt(e.reimbursablePart!)} you'll get back` : ""} · pay in full to avoid interest`
        : g === "tasks"
          ? `${when} · planned task`
          : g === "emis" || g === "repay"
            ? `${when} · required payment`
            : g === "sips"
              ? `${when} · your investing plan`
              : `${when}${e.isEssential ? " · essential" : ""}`;
    lines.push({ group: g, label: e.title, amount: round2(amt), reason, eventKey: e.key });
  }
  for (const a of plan.allocations) {
    if (a.recommended < 0.5) continue;
    lines.push({
      group: "goal",
      label: a.goal.name,
      amount: a.recommended,
      goalId: a.goal.id,
      reason: `${["", "Critical", "High", "Medium", "Low"][a.priority]} priority${a.funded === "full" ? " · keeps it on schedule" : " · as much as fits after higher priorities"}`,
    });
  }
  const budgets = m.period === "current" ? m.budgetRemaining : m.budgetLimit;
  if (budgets > 0.5) lines.push({ group: "budgets", label: "Day-to-day spending", amount: round2(budgets), reason: `What's left in ${m.budgets.length} budget${m.budgets.length === 1 ? "" : "s"} this month` });
  if (plan.unallocated > 0.5) lines.push({ group: "flexible", label: "Free to use", amount: plan.unallocated, reason: "Everything above is covered — spend, save or invest this" });
  lines.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));

  const key = monthKey(monthOf);
  const from = startOfMonth(monthOf);
  const to = endOfMonth(monthOf);
  const salaryReceived = round2(
    ds.transactions
      .filter((t) => t.type === "income" && t.date >= from && t.date <= to && ((t.category ?? "").toLowerCase().includes("salary") || /salary/i.test(t.description ?? "")))
      .reduce((s, t) => s + t.amount, 0),
  );
  return {
    plan,
    month: key,
    lines,
    assigned: round2(lines.reduce((s, l) => s + l.amount, 0)),
    flexible: plan.unallocated,
    status: ds.profile.preferences?.salaryPlans?.[key]?.status ?? null,
    salaryReceived,
  };
}

// ---------------------------------------------------------------------------
// §2.2 Forecast with running balance

export interface ForecastRow {
  event: FinEvent;
  balance: number;
  low: boolean;
}

export interface Forecast {
  start: number;
  rows: ForecastRow[];
  threshold: number;
  /** First event that takes available cash below the threshold. */
  firstLow: ForecastRow | null;
  lowest: { date: ISODate; cash: number };
  end: number;
}

export function forecast(ds: Dataset, positions: Positions, today: ISODate, to: ISODate, threshold = ds.profile.preferences?.lowBalance ?? 0): Forecast {
  const res = project(ds, { today, to, positions });
  const rows = res.timeline
    .filter((t) => !(t.event.kind === "card_spend" && t.event.estimated))
    .map((t) => ({ event: t.event, balance: t.cashAfter, low: t.cashAfter < threshold }));
  return { start: res.start.cash, rows, threshold, firstLow: rows.find((r) => r.low) ?? null, lowest: res.lowest, end: res.end.cash };
}

// ---------------------------------------------------------------------------
// §2.3 Purchase decision

export interface PurchaseInput {
  name: string;
  price: number;
  /** Any date in the month you want to buy. */
  month: ISODate;
  priority: 1 | 2 | 3 | 4;
  financing: "cash" | "emi";
  downPayment?: number;
  emiMonths?: number;
  emiRate?: number;
  fees?: number;
}

export interface PurchaseResult {
  verdict: "fits" | "slows_goals" | "not_yet";
  upfront: number;
  /** Month-by-month saving towards the upfront amount (from free money first, then lower-priority goals). */
  schedule: { month: string; fromFree: number; fromGoals: number }[];
  /** How much each lower-priority goal would be slowed by, in total. */
  impacts: { goalId: string; name: string; amount: number }[];
  /** Earliest month the upfront amount fits using only free money (no goal slowed), within 24 months. */
  earliestFree: string | null;
  emi: null | { amount: number; months: number; total: number; interest: number; fits: boolean; freeAfter: number };
  cashTotal: number;
}

export function emiAmount(principal: number, annualRate: number, months: number): number {
  const n = Math.max(1, months);
  const r = annualRate / 1200;
  return round2(r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
}

export function purchaseCheck(ds: Dataset, positions: Positions, today: ISODate, p: PurchaseInput): PurchaseResult {
  const first = startOfMonth(today);
  const target = startOfMonth(p.month < today ? today : p.month);
  const span = Math.max(0, diffMonths(first, target));
  const fees = p.fees ?? 0;
  const down = p.financing === "emi" ? Math.min(p.downPayment ?? 0, p.price) : p.price;
  const upfront = round2(down + (p.financing === "emi" ? fees : 0));

  const plans = new Map<string, MonthPlan>();
  const planFor = (m: ISODate) => {
    const k = monthKey(m);
    if (!plans.has(k)) plans.set(k, planMonth(ds, positions, today, m));
    return plans.get(k)!;
  };

  // Save towards the upfront amount from now until the purchase month.
  let need = upfront;
  const schedule: PurchaseResult["schedule"] = [];
  const impacts = new Map<string, { name: string; amount: number }>();
  for (let i = 0; i <= span && need > 0.5; i++) {
    const m = addMonths(first, i);
    const pl = planFor(m);
    const fromFree = Math.min(need, pl.unallocated);
    need -= fromFree;
    let fromGoals = 0;
    // Only goals with a lower priority than the purchase can be slowed, lowest first.
    const slowable = pl.allocations.filter((a) => a.priority > p.priority && a.recommended > 0).sort((a, b) => b.priority - a.priority);
    for (const a of slowable) {
      if (need <= 0.5) break;
      const take = Math.min(need, a.recommended);
      need -= take;
      fromGoals += take;
      const cur = impacts.get(a.goal.id) ?? { name: a.goal.name, amount: 0 };
      cur.amount += take;
      impacts.set(a.goal.id, cur);
    }
    schedule.push({ month: monthKey(m), fromFree: round2(fromFree), fromGoals: round2(fromGoals) });
  }
  const verdict: PurchaseResult["verdict"] = need > 0.5 ? "not_yet" : impacts.size ? "slows_goals" : "fits";

  let earliestFree: string | null = null;
  let acc = 0;
  for (let i = 0; i < 24; i++) {
    const m = addMonths(first, i);
    acc += planFor(m).unallocated;
    if (acc + 0.5 >= upfront) {
      earliestFree = monthKey(m);
      break;
    }
  }

  let emi: PurchaseResult["emi"] = null;
  if (p.financing === "emi") {
    const months = Math.max(1, p.emiMonths ?? 12);
    const amount = emiAmount(p.price - down, p.emiRate ?? 0, months);
    const total = round2(amount * months + down + fees);
    const after = planFor(addMonths(target, 1));
    emi = { amount, months, total, interest: round2(total - p.price), fits: after.unallocated + 0.5 >= amount, freeAfter: after.unallocated };
  }

  return {
    verdict,
    upfront,
    schedule,
    impacts: [...impacts.entries()].map(([goalId, v]) => ({ goalId, name: v.name, amount: round2(v.amount) })),
    earliestFree,
    emi,
    cashTotal: p.price,
  };
}

// ---------------------------------------------------------------------------
// §2.5 Stress-test presets

export function stressPresets(today: ISODate, amounts: { surprise?: number; sipUp?: number; eatingOut?: number } = {}): { id: string; label: string; items: WhatIf[] }[] {
  const next = startOfMonth(addMonths(today, 1));
  return [
    { id: "jobloss3", label: "No income for 3 months", items: [{ id: "s-jobloss", type: "income_stop", from: next, months: 3, label: "No income for 3 months" }] },
    { id: "surprise", label: `Surprise expense`, items: [{ id: "s-surprise", type: "one_time", date: next, amount: amounts.surprise ?? 50_000, direction: "out", label: "Surprise expense" }] },
    { id: "raise", label: "Salary +15%", items: [{ id: "s-raise", type: "income_change", from: next, pct: 15, label: "Salary +15%" }] },
    { id: "sip", label: "SIP +₹2,000", items: [{ id: "s-sip", type: "recurring", from: next, amount: amounts.sipUp ?? 2_000, direction: "invest", assetClass: "equity", label: "Extra SIP" }] },
    { id: "eatout", label: "Cut eating out by ₹1,500", items: [{ id: "s-eat", type: "recurring", from: next, amount: amounts.eatingOut ?? 1_500, direction: "in", label: "Less eating out" }] },
  ];
}
