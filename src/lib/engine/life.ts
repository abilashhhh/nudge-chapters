// Personal system: repeating tasks, the Today agenda, the nudge engine and the wishlist buy/wait check.
//
// Every nudge carries why it exists (reason), the data behind it, a suggested action, the expected
// impact and where its numbers came from — and says plainly when a number is an estimate.

import { addDays, addMonths, addYears, daysInMonth, formatDate, startOfMonth } from "../dates";
import { formatMoney, round2, type MoneyContext } from "../money";
import type { Dataset, ISODate, LifeItem, Repeat } from "../types";
import type { Alert } from "./alerts";
import type { EmergencyFund, GoalProgress } from "./goals";
import { classify } from "./ledger";
import type { MonthMetrics, MonthlyNorms } from "./metrics";

// ---------------------------------------------------------------------------
// Repeating items

export function nextDue(date: ISODate, repeat: Repeat): ISODate {
  switch (repeat) {
    case "daily":
      return addDays(date, 1);
    case "weekly":
      return addDays(date, 7);
    case "monthly":
      return addMonths(date, 1);
    case "yearly":
      return addYears(date, 1);
    default:
      return date;
  }
}

/**
 * What completing an item changes. A repeating item moves to its next date (and a repeating
 * checklist is un-ticked) instead of being closed, so it comes back when it's next due.
 */
export function completionPatch(item: LifeItem, today: ISODate): Partial<LifeItem> {
  if (item.repeat !== "none" && item.due_date) {
    let next = nextDue(item.due_date, item.repeat);
    while (next <= today && item.repeat !== "yearly") next = nextDue(next, item.repeat);
    const data = item.data?.items ? { ...item.data, items: item.data.items.map((e) => ({ ...e, done: false })) } : item.data;
    return { due_date: next, data, completed_at: new Date().toISOString(), status: "open" };
  }
  return { status: "done", completed_at: new Date().toISOString() };
}

export const isOpen = (i: LifeItem) => i.status === "open";

export function checklistProgress(item: LifeItem): { done: number; total: number } {
  const items = item.data?.items ?? [];
  return { done: items.filter((e) => e.done).length, total: items.length };
}

export interface Agenda {
  overdue: LifeItem[];
  today: LifeItem[];
  upcoming: LifeItem[];
}

/** Open tasks and reminders by when they're due (upcoming = next 7 days). */
export function agenda(items: LifeItem[], today: ISODate): Agenda {
  const dated = items.filter((i) => isOpen(i) && (i.kind === "task" || i.kind === "reminder" || i.kind === "checklist") && i.due_date);
  const by = (a: LifeItem, b: LifeItem) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : a.priority - b.priority);
  return {
    overdue: dated.filter((i) => i.due_date! < today).sort(by),
    today: dated.filter((i) => i.due_date === today).sort(by),
    upcoming: dated.filter((i) => i.due_date! > today && i.due_date! <= addDays(today, 7)).sort(by),
  };
}

// ---------------------------------------------------------------------------
// Spending pace by category

export interface CategoryPace {
  category: string;
  thisMonth: number;
  /** Average of the last three full months. */
  average: number;
  /** What the average would be by today, pro-rated. */
  expectedByNow: number;
  over: number;
}

export function spendingPace(ds: Dataset, today: ISODate): CategoryPace[] {
  const m0 = startOfMonth(today);
  const from = startOfMonth(addMonths(today, -3));
  const cur = new Map<string, number>();
  const past = new Map<string, number>();
  // Only day-to-day spending: fixed bills (rent, EMIs, subscriptions) land in a lump once a month,
  // so they'd always look "ahead of pace" early in the month.
  const fixedCats = new Set([
    ...ds.categories.filter((c) => c.kind === "expense" && c.is_fixed).map((c) => c.name),
    ...ds.recurring_rules.filter((r) => r.kind === "expense" && r.is_fixed && r.category).map((r) => r.category!),
  ]);
  for (const t of ds.transactions) {
    if (t.date < from || t.date > today || !t.category || t.rule_id || fixedCats.has(t.category)) continue;
    const exp = classify(t).expense;
    if (exp <= 0) continue;
    const map = t.date >= m0 ? cur : past;
    map.set(t.category, (map.get(t.category) ?? 0) + exp);
  }
  const d = new Date(`${today}T00:00:00Z`);
  const frac = d.getUTCDate() / daysInMonth(d.getUTCFullYear(), d.getUTCMonth());
  const out: CategoryPace[] = [];
  for (const [category, total] of past) {
    const average = round2(total / 3);
    const thisMonth = round2(cur.get(category) ?? 0);
    const expectedByNow = round2(average * frac);
    out.push({ category, thisMonth, average, expectedByNow, over: round2(thisMonth - expectedByNow) });
  }
  return out.sort((a, b) => b.over - a.over);
}

// ---------------------------------------------------------------------------
// Wishlist: buy or wait?

export type Verdict = "buy" | "wait" | "save_first" | "consider" | "unknown";

export interface BuyWait {
  verdict: Verdict;
  label: string;
  price: number | null;
  reasons: string[];
  /** Months of saving needed, when the verdict is save_first (estimate). */
  months?: number;
}

export function buyOrWait(
  item: LifeItem,
  f: { month: MonthMetrics; norms: MonthlyNorms; ef: EmergencyFund; ctx: MoneyContext },
): BuyWait {
  const m = (n: number) => formatMoney(n, f.ctx);
  const price = item.data?.current_price ?? item.data?.target_price ?? null;
  if (price == null || price <= 0) return { verdict: "unknown", label: "Add a price", price: null, reasons: ["Add the current price to get a buy-or-wait suggestion."] };
  const reasons: string[] = [];
  const spendable = Math.max(0, f.month.spendable);
  const surplus = round2(f.norms.income - f.norms.outflow);
  const history = item.data?.price_history ?? [];
  const lowest = history.length ? Math.min(...history.map((h) => h.price)) : null;
  const target = item.data?.target_price ?? null;

  if (price > spendable) {
    const short = price - spendable;
    const months = surplus > 0 ? Math.ceil(short / surplus) : undefined;
    reasons.push(`Costs ${m(price)}; you can safely spend ${m(spendable)} this month after bills and budgets.`);
    reasons.push(months ? `At your usual monthly surplus of about ${m(surplus)}, that's roughly ${months} month${months === 1 ? "" : "s"} of saving (estimate).` : "Your planned monthly outflow is at or above your income, so there's no regular surplus to save from yet.");
    return { verdict: "save_first", label: "Save first", price, reasons, months };
  }
  reasons.push(`Fits within the ${m(spendable)} you can safely spend this month.`);
  if (target != null && item.data?.current_price != null && item.data.current_price > target * 1.01) {
    reasons.push(`Current price is ${m(item.data.current_price - target)} above your target of ${m(target)}.`);
    if (lowest != null && lowest < item.data.current_price) reasons.push(`Lowest price you've recorded: ${m(lowest)}.`);
    return { verdict: "wait", label: "Wait for a better price", price, reasons };
  }
  if (f.ef.coverageMonths < 3) {
    reasons.push(`Your emergency fund covers about ${f.ef.coverageMonths.toFixed(1)} months of essentials (aim for 3–6). Consider topping it up first.`);
    return { verdict: "consider", label: "Affordable — but check your safety net", price, reasons };
  }
  if (target != null && item.data?.current_price != null) reasons.push(`At or below your target price of ${m(target)}.`);
  return { verdict: "buy", label: "Good time to buy", price, reasons };
}

// ---------------------------------------------------------------------------
// Nudges

export type NudgeKind = "payment" | "goal" | "spending" | "task" | "reminder" | "wishlist" | "safety" | "cash";

export interface Nudge {
  key: string;
  kind: NudgeKind;
  /** 0 = most important. */
  rank: number;
  title: string;
  /** Why this nudge exists. */
  reason: string;
  /** Suggested action, in words. */
  action?: string;
  /** What acting on it should change (estimates say so). */
  impact?: string;
  /** Where the numbers come from. */
  source: string;
  estimate: boolean;
  /** Button target. */
  cta?: { label: string; href?: string; eventKey?: string; itemId?: string };
  date?: ISODate;
  createdAt: string;
}

export function buildNudges(args: {
  ds: Dataset;
  today: ISODate;
  ctx: MoneyContext;
  alerts: Alert[];
  goals: GoalProgress[];
  ef: EmergencyFund;
  month: MonthMetrics;
  norms: MonthlyNorms;
}): Nudge[] {
  const { ds, today, ctx, alerts, goals, ef, month, norms } = args;
  const m = (n: number) => formatMoney(n, ctx);
  const now = new Date().toISOString();
  const out: Nudge[] = [];
  const items = ds.life_items ?? [];

  // Money obligations and warnings already worked out by the alert engine.
  for (const a of alerts.filter((x) => x.priority !== "info").slice(0, 4)) {
    out.push({
      key: `alert:${a.key}`,
      kind: a.module === "balance" ? "cash" : a.module === "spending" ? "spending" : "payment",
      rank: a.priority === "critical" ? 0 : a.priority === "high" ? 1 : 3,
      title: a.title,
      reason: a.body,
      source: "Your accounts, bills and plans",
      estimate: false,
      cta: a.eventKey ? { label: "Open", eventKey: a.eventKey } : a.href ? { label: "Open", href: a.href } : undefined,
      date: a.date,
      createdAt: now,
    });
  }

  // Chapters: a small, concrete step toward the most important goal that needs it.
  const needing = goals
    .filter((g) => g.status !== "done" && g.goal.kind !== "retirement" && g.gap > 0)
    .sort((a, b) => a.goal.priority - b.goal.priority || (a.goal.target_date ?? "9999") .localeCompare(b.goal.target_date ?? "9999"));
  for (const g of needing.slice(0, 2)) {
    const monthly = g.requiredMonthly && g.requiredMonthly > 0 ? g.requiredMonthly : g.goal.monthly_contribution;
    if (!monthly || monthly <= 0) continue;
    const weekly = Math.max(100, Math.round((monthly * 12) / 52 / 50) * 50);
    out.push({
      key: `goal:${g.goal.id}:${today.slice(0, 7)}`,
      kind: "goal",
      rank: g.status === "off_track" ? 2 : 4,
      title: `Set aside ${m(weekly)} this week for ${g.goal.name}`,
      reason: `${g.goal.name} is ${Math.round(g.progress * 100)}% funded — ${m(g.gap)} to go${g.goal.target_date ? ` by ${formatDate(g.goal.target_date)}` : ""}.`,
      action: `Move ${m(weekly)} into the money set aside for it.`,
      impact: g.requiredMonthly ? `About ${m(g.requiredMonthly)} a month keeps it on schedule (estimate, assuming ${g.rate}% a year growth).` : undefined,
      source: "Your chapter's target and current savings",
      estimate: true,
      cta: { label: "Open chapter", href: "/goals" },
      createdAt: now,
    });
  }

  // Spending running ahead of your usual pace.
  const pace = spendingPace(ds, today).filter((p) => p.over >= 500 && p.thisMonth > p.expectedByNow * 1.25);
  for (const p of pace.slice(0, 1)) {
    out.push({
      key: `spend:${p.category}:${today.slice(0, 7)}`,
      kind: "spending",
      rank: 3,
      title: `${p.category} is ${m(p.over)} above your usual pace`,
      reason: `${m(p.thisMonth)} so far this month; your 3-month average would be about ${m(p.expectedByNow)} by today.`,
      action: `Hold ${p.category.toLowerCase()} spending for the rest of the month.`,
      impact: p.thisMonth > p.average ? `If this became your usual month, it would cost about ${m((p.thisMonth - p.average) * 12)} more a year (estimate).` : undefined,
      source: "Your recorded transactions",
      estimate: true,
      cta: { label: "See spending", href: "/reports?tab=spending" },
      createdAt: now,
    });
  }

  // Tasks and reminders.
  const ag = agenda(items, today);
  const dueNow = [...ag.overdue, ...ag.today];
  if (dueNow.length) {
    const first = dueNow[0];
    out.push({
      key: `tasks:${today}`,
      kind: first.kind === "reminder" ? "reminder" : "task",
      rank: ag.overdue.length ? 2 : 3,
      title: dueNow.length === 1 ? first.title : `${dueNow.length} things to do today`,
      reason: ag.overdue.length ? `${ag.overdue.length} overdue${ag.today.length ? `, ${ag.today.length} due today` : ""}.` : "Due today.",
      source: "Your tasks and reminders",
      estimate: false,
      cta: { label: "Open", href: "/plan" },
      createdAt: now,
    });
  }

  // Wishlist at or under target price.
  for (const w of items.filter((i) => i.kind === "wishlist" && isOpen(i))) {
    const cur = w.data?.current_price;
    const target = w.data?.target_price;
    if (cur != null && target != null && cur <= target) {
      const bw = buyOrWait(w, { month, norms, ef, ctx });
      out.push({
        key: `wish:${w.id}:${cur}`,
        kind: "wishlist",
        rank: 4,
        title: `${w.title} is at your target price`,
        reason: `You recorded ${m(cur)}; your target is ${m(target)}. ${bw.reasons[0] ?? ""}`,
        action: bw.label,
        source: "Prices you recorded",
        estimate: false,
        cta: { label: "View", href: "/plan?tab=wishlist" },
        createdAt: now,
      });
    }
  }

  // Safety net.
  if (ef.essentialMonthly > 0 && ef.coverageMonths < 3) {
    out.push({
      key: `ef:${today.slice(0, 7)}`,
      kind: "safety",
      rank: 3,
      title: `Emergency fund covers ${ef.coverageMonths.toFixed(1)} months`,
      reason: `Essentials cost about ${m(ef.essentialMonthly)} a month; ${m(ef.current)} is set aside.`,
      action: "Aim for at least 3 months, then 6.",
      impact: `${m(Math.max(0, ef.essentialMonthly * 3 - ef.current))} more reaches 3 months.`,
      source: "Your accounts and essential bills",
      estimate: false,
      cta: { label: "Open", href: "/goals" },
      createdAt: now,
    });
  }

  // Don't repeat a chapter warning when there's already a concrete step for that chapter.
  const nudgedGoals = out.filter((n) => n.kind === "goal" && n.key.startsWith("goal:")).map((n) => n.title.split(" for ").pop() ?? "");
  for (let i = out.length - 1; i >= 0; i--) if (out[i].key.startsWith("alert:") && nudgedGoals.some((g) => g && out[i].title.startsWith(g))) out.splice(i, 1);

  const dismissed = ds.profile.preferences?.dismissedAlerts ?? {};
  const seen = new Set<string>();
  return out
    .filter((n) => !dismissed[n.key] && !seen.has(n.title) && seen.add(n.title))
    .sort((a, b) => a.rank - b.rank);
}

/** The single most useful suggestion for the Today screen. */
export function oneThing(nudges: Nudge[]): Nudge | null {
  return nudges.find((n) => n.kind === "goal") ?? nudges.find((n) => n.kind === "spending") ?? nudges[0] ?? null;
}

