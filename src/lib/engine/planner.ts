// Month-by-month goal planning (requirements §1, §2, §8).
//
// One function answers "how much can I put towards my goals in month M, and where should it go?" using the
// same month metrics as the dashboard: that month's income, that month's bills, card payments, EMIs, chit
// installments, budgets and planned task costs — never another month's. Goals are then funded in priority
// order (Critical → High → Medium → Low); when money is short the higher priorities are protected first.

import { addMonths, diffMonths, endOfMonth, formatDate, startOfMonth } from "../dates";
import { round2 } from "../money";
import type { Dataset, Goal, ISODate } from "../types";
import { isPending, type FinEvent } from "./events";
import { goalProgress, requiredMonthly, type GoalProgress } from "./goals";
import type { Positions } from "./ledger";
import { monthMetrics, type Line, type MonthMetrics } from "./metrics";

export const PRIORITY_LABEL: Record<number, string> = { 1: "Critical", 2: "High", 3: "Medium", 4: "Low" };
export const PRIORITY_EMOJI: Record<number, string> = { 1: "🛡️", 2: "🚀", 3: "🌱", 4: "🎈" };

export function priorityOf(g: Pick<Goal, "priority">): 1 | 2 | 3 | 4 {
  const p = Number(g.priority);
  return (p >= 1 && p <= 4 ? p : 3) as 1 | 2 | 3 | 4;
}

export interface GoalAllocation {
  goal: Goal;
  progress: GoalProgress;
  priority: 1 | 2 | 3 | 4;
  /** What this goal needs this month to stay on schedule (or its planned contribution when undated). */
  needed: number;
  recommended: number;
  funded: "full" | "partial" | "none";
  /** A realistic date at the recommended pace, when it differs from the target date. */
  suggestedDate: ISODate | null;
}

export interface Recommendation {
  id: string;
  emoji: string;
  title: string;
  detail: string;
  amount?: number;
}

export interface MonthPlan {
  month: MonthMetrics;
  /** Money that can go to goals this month, after every commitment due this month. */
  available: number;
  availableLines: Line[];
  tasks: FinEvent[];
  taskReserve: number;
  allocations: GoalAllocation[];
  allocated: number;
  unallocated: number;
  /** Extra each month that would fully fund every dated goal on schedule. */
  shortfall: number;
  recommendations: Recommendation[];
}

function neededFor(p: GoalProgress, monthsFromToday: number): number {
  if (p.status === "done") return 0;
  if (p.goal.target_date) {
    const left = Math.max(1, (p.monthsLeft ?? 1) - monthsFromToday);
    return round2(requiredMonthly(p.goal.target_amount, p.value, p.rate, left));
  }
  return round2(p.goal.monthly_contribution > 0 ? p.goal.monthly_contribution : p.gap);
}

export function planMonth(ds: Dataset, positions: Positions, today: ISODate, monthOf: ISODate = today, fmt: (n: number) => string = (n) => String(Math.round(n))): MonthPlan {
  const month = monthMetrics(ds, positions, today, undefined, monthOf);
  const buffer = Math.max(0, ds.profile.preferences?.cashBuffer ?? 0);
  const tasks = month.events.filter((e) => e.source === "task");
  const taskReserve = round2(tasks.filter(isPending).reduce((s, e) => s + e.remaining, 0));

  // Current month: real cash today plus income still due, minus everything still to pay this month.
  // Future month: that month's own income minus that month's own commitments (the cash you carry in is
  // already counted for the month it was earned, so it isn't allocated twice).
  let availableLines: Line[];
  if (month.period === "current") {
    availableLines = [...month.spendableLines];
  } else {
    const income = month.incomeTotal;
    availableLines = [
      { label: `Income planned for ${month.month}`, amount: income, hint: "Known and expected income in this month only" },
      ...(month.reimbursementsExpected > 0 ? [{ label: "Repayments expected from people you paid for", amount: month.reimbursementsExpected }] : []),
      { label: "Bills and commitments in this month", amount: -month.committedTotal, hint: "Rent, EMIs, card bills, SIPs, chits, repayments and planned task costs due this month" },
      { label: "Spending budgets for this month", amount: -month.budgetLimit },
    ];
  }
  if (buffer > 0) availableLines.push({ label: "Cash buffer you keep untouched", amount: -buffer });
  const available = round2(Math.max(0, availableLines.reduce((s, l) => s + l.amount, 0)));

  const monthsFromToday = Math.max(0, diffMonths(startOfMonth(today), startOfMonth(monthOf)));
  const goals = ds.goals.filter((g) => !g.archived);
  const progress = goals.map((g) => goalProgress(g, positions, today));
  const rows = progress
    .filter((p) => p.status !== "done")
    .map((p) => ({ p, priority: priorityOf(p.goal), needed: neededFor(p, monthsFromToday) }))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const ea = a.p.goal.kind === "emergency" ? 0 : 1;
      const eb = b.p.goal.kind === "emergency" ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const da = a.p.goal.target_date ?? "9999-12-31";
      const db = b.p.goal.target_date ?? "9999-12-31";
      return da < db ? -1 : da > db ? 1 : 0;
    });

  // Waterfall by priority tier; inside a tier, share in proportion to need.
  let left = available;
  const allocations: GoalAllocation[] = [];
  for (const tier of [1, 2, 3, 4] as const) {
    const inTier = rows.filter((r) => r.priority === tier);
    const need = inTier.reduce((s, r) => s + r.needed, 0);
    const give = Math.min(left, need);
    for (const r of inTier) {
      const share = need > 0 ? round2((r.needed / need) * give) : 0;
      let suggestedDate: ISODate | null = null;
      if (r.p.goal.target_date && share < r.needed - 0.5) {
        const m = share > 0 ? Math.ceil(r.p.gap / share) : null;
        suggestedDate = m != null && m <= 600 ? endOfMonth(addMonths(monthOf, m - 1)) : null;
      }
      allocations.push({
        goal: r.p.goal,
        progress: r.p,
        priority: tier,
        needed: r.needed,
        recommended: share,
        funded: share >= r.needed - 0.5 ? "full" : share > 0 ? "partial" : "none",
        suggestedDate,
      });
    }
    left = round2(left - give);
  }
  const allocated = round2(allocations.reduce((s, a) => s + a.recommended, 0));
  const datedNeed = allocations.filter((a) => a.goal.target_date).reduce((s, a) => s + a.needed, 0);
  const datedGiven = allocations.filter((a) => a.goal.target_date).reduce((s, a) => s + a.recommended, 0);
  const shortfall = round2(Math.max(0, datedNeed - datedGiven));

  // ---- Positive, actionable recommendations -------------------------------
  const recs: Recommendation[] = [];
  const ef = allocations.find((a) => a.goal.kind === "emergency");
  if (ef && ef.funded !== "full") {
    recs.push({ id: "ef", emoji: "🛡️", title: `Put your emergency fund first`, detail: `It gets the first ${fmt(ef.recommended)} this month so a surprise bill never derails the other goals.`, amount: ef.recommended });
  }
  const budgets = month.budgets.filter((b) => !b.isEssential && !b.reimbursable).sort((a, b) => (b.budget?.limit ?? 0) - (a.budget?.limit ?? 0));
  if (shortfall > 0 && budgets.length) {
    const top = budgets.slice(0, 2);
    const save = round2(top.reduce((s, b) => s + (b.budget?.limit ?? 0) * 0.1, 0));
    if (save >= 1) {
      recs.push({
        id: "trim",
        emoji: "✂️",
        title: `Trim ${top.map((b) => b.title).join(" and ")} by 10%`,
        detail: `That frees about ${fmt(save)} a month for your next goal without touching essentials.`,
        amount: save,
      });
    }
  }
  const subs = ds.recurring_rules.filter((r) => r.active && r.is_subscription && r.kind === "expense");
  if (shortfall > 0 && subs.length) {
    const total = round2(subs.reduce((s, r) => s + r.amount, 0));
    recs.push({ id: "subs", emoji: "🔄", title: `Review ${subs.length} subscription${subs.length > 1 ? "s" : ""}`, detail: `They cost ${fmt(total)} a month. Keeping only the ones you use adds straight to your goals.`, amount: total });
  }
  for (const a of allocations.filter((x) => x.suggestedDate && x.priority >= 3).slice(0, 2)) {
    recs.push({
      id: `date-${a.goal.id}`,
      emoji: "🗓️",
      title: `Give ${a.goal.name} a little more time`,
      detail: `At ${a.recommended > 0 ? `${fmt(a.recommended)} a month` : "the pace left after higher priorities"} it's realistic by ${formatDate(a.suggestedDate)}. Higher-priority goals stay on schedule.`,
    });
  }
  const unfunded = allocations.find((a) => a.funded !== "full");
  if (unfunded) {
    recs.push({ id: "extra", emoji: "✨", title: "Add windfalls to the next goal in line", detail: `When extra money arrives (a bonus, a repayment, a refund), send it to ${unfunded.goal.name} first.` });
  }
  if (left > 0.5 && allocations.length) {
    recs.push({ id: "left", emoji: "🎉", title: "Every goal is covered this month", detail: `You still have ${fmt(left)} left over. Keep it as a buffer, or invest it.`, amount: left });
  }

  return { month, available, availableLines, tasks, taskReserve, allocations, allocated, unallocated: round2(left), shortfall, recommendations: recs };
}
