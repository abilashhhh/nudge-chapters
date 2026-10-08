// Alerts & notifications (PRD §20, §46). Alerts are derived from data on every
// load, so they are always current; dismissals are stored in preferences.

import { addDays, diffDays, formatDate, relativeDays } from "../dates";
import { formatMoney, type MoneyContext } from "../money";
import type { AlertModule, Dataset, ISODate } from "../types";
import { isPending, type FinEvent } from "./events";
import type { GoalProgress } from "./goals";
import { classify, isOpening, type Positions } from "./ledger";
import type { ProjectionResult } from "./projection";

export type AlertPriority = "critical" | "high" | "normal" | "info";

export interface Alert {
  key: string;
  priority: AlertPriority;
  module: AlertModule;
  title: string;
  body: string;
  date?: ISODate;
  eventKey?: string;
  href?: string;
}

const PRIORITY_ORDER: Record<AlertPriority, number> = { critical: 0, high: 1, normal: 2, info: 3 };

export function buildAlerts(args: {
  ds: Dataset;
  positions: Positions;
  events: FinEvent[];
  projection60?: ProjectionResult;
  goals: GoalProgress[];
  today: ISODate;
  ctx: MoneyContext;
}): Alert[] {
  const { ds, positions, events, projection60, goals, today, ctx } = args;
  const m = (n: number) => formatMoney(n, ctx);
  const out: Alert[] = [];

  // Projected balances
  if (projection60?.negativeOn) {
    out.push({
      key: `negative:${projection60.negativeOn}`,
      priority: "critical",
      module: "balance",
      title: "Cash is projected to go negative",
      body: `On ${formatDate(projection60.negativeOn)} your available cash is projected to drop below zero (lowest ${m(projection60.lowest.cash)} on ${formatDate(projection60.lowest.date)}).`,
      date: projection60.negativeOn,
      href: "/projection",
    });
  }
  for (const b of projection60?.belowMin ?? []) {
    out.push({
      key: `belowmin:${b.accountId}:${b.date}`,
      priority: "critical",
      module: "balance",
      title: `${b.name} may fall below its minimum balance`,
      body: `Projected ${m(b.balance)} on ${formatDate(b.date)}, under the ${m(b.min)} minimum.`,
      date: b.date,
      href: "/assets",
    });
  }

  // Event-driven alerts
  for (const e of events) {
    if (!isPending(e) || e.excluded || e.kind === "card_statement" || (e.kind === "card_spend" && e.estimated) || e.budget) continue;
    const days = diffDays(today, e.date);
    const when = relativeDays(today, e.date);
    const amt = m(e.remaining);
    if (e.status === "overdue" || (e.status === "partial" && e.date < today)) {
      if (e.flow === "in") {
        out.push({
          key: `late-in:${e.key}`,
          priority: e.kind === "income" ? "high" : "normal",
          module: e.kind === "income" ? "income" : e.kind === "lend_due" ? "lending" : "chits",
          title: `${e.title}: not received yet`,
          body: `${amt} was expected ${when}. Mark it received, reschedule or skip it.`,
          date: e.date,
          eventKey: e.key,
        });
      } else {
        const critical = e.kind === "card_bill" || e.kind === "emi";
        out.push({
          key: `overdue:${e.key}`,
          priority: critical ? "critical" : "high",
          module: e.kind === "card_bill" ? "cards" : e.kind === "emi" ? "loans" : e.kind === "chit" ? "chits" : e.kind === "sip" ? "sip" : "bills",
          title: `${e.title} is overdue`,
          body: `${amt} was due ${when}.${e.kind === "card_bill" ? " Late card payments attract fees and interest." : ""}`,
          date: e.date,
          eventKey: e.key,
        });
      }
      continue;
    }
    if (days < 0) continue;
    if (e.flow === "out" || e.kind === "card_spend" || e.kind === "emi") {
      const module: AlertModule =
        e.kind === "card_bill" ? "cards" : e.kind === "emi" ? "loans" : e.kind === "chit" ? "chits" : e.kind === "sip" ? "sip" : e.kind === "borrow_due" ? "lending" : "bills";
      if (days <= 1 && (e.kind !== "card_spend")) {
        out.push({
          key: `due:${e.key}`,
          priority: "high",
          module,
          title: `${e.title} due ${when}`,
          body: `${amt}${e.accountId ? ` from ${positions.accounts.get(e.accountId)?.account.name ?? "your account"}` : ""}.`,
          date: e.date,
          eventKey: e.key,
        });
      } else if (days <= 3 && (e.kind === "card_bill" || e.kind === "emi" || e.kind === "sip" || e.kind === "chit")) {
        out.push({
          key: `soon:${e.key}`,
          priority: e.kind === "card_bill" ? "high" : "normal",
          module,
          title: `${e.title} due ${when}`,
          body: `${amt} on ${formatDate(e.date)}.`,
          date: e.date,
          eventKey: e.key,
        });
      } else if (days <= 7 && e.isFixed && e.kind === "expense") {
        out.push({ key: `soon:${e.key}`, priority: "normal", module, title: `${e.title} due ${when}`, body: `${amt} on ${formatDate(e.date)}.`, date: e.date, eventKey: e.key });
      }
    } else if (e.flow === "in" && days <= 3) {
      out.push({
        key: `incoming:${e.key}`,
        priority: "info",
        module: e.kind === "income" ? "income" : e.kind === "lend_due" ? "lending" : "chits",
        title: e.kind === "income" ? `${e.title} expected ${when}` : `${e.title} ${when}`,
        body: `${amt} on ${formatDate(e.date)}.`,
        date: e.date,
        eventKey: e.key,
      });
    }
  }

  // Card statements generated in the last 5 days and still unpaid
  for (const cp of positions.cards.values()) {
    for (const st of cp.statements) {
      const age = diffDays(st.statement.statement_date, today);
      if (age >= 0 && age <= 5 && st.remaining > 0) {
        out.push({
          key: `stmt:${st.statement.id}`,
          priority: "high",
          module: "cards",
          title: `${cp.card.name} statement generated`,
          body: `${m(st.remaining)} due ${formatDate(st.statement.due_date)} (minimum ${m(st.statement.min_due)}).`,
          date: st.statement.statement_date,
          href: "/liabilities",
        });
      }
    }
    if (cp.utilization > 0.7 && cp.card.credit_limit > 0) {
      out.push({
        key: `util:${cp.card.id}:${today.slice(0, 7)}`,
        priority: "normal",
        module: "cards",
        title: `${cp.card.name} is ${Math.round(cp.utilization * 100)}% utilised`,
        body: "High utilisation can lower your credit score. Try to keep it under 30%.",
        href: "/liabilities",
      });
    }
  }

  // Goals
  for (const g of goals) {
    if (g.status === "off_track" && g.goal.target_date) {
      out.push({
        key: `goal:${g.goal.id}:${today.slice(0, 7)}`,
        priority: "normal",
        module: "goals",
        title: `${g.goal.name} is off track`,
        body: `You need about ${m(g.requiredMonthly ?? 0)}/month to reach ${m(g.goal.target_amount)} by ${formatDate(g.goal.target_date)}; you're putting in ${m(g.goal.monthly_contribution)}.`,
        href: "/goals",
      });
    }
  }

  // Large unusual expenses in the last 7 days (≥ 3× the category's typical size)
  const recent = ds.transactions.filter((t) => !isOpening(t) && t.date > addDays(today, -7) && t.date <= today && classify(t).expense > 0);
  for (const t of recent) {
    const peers = ds.transactions.filter(
      (x) => x.id !== t.id && x.category === t.category && classify(x).expense > 0 && x.date > addDays(today, -180),
    );
    if (peers.length < 3) continue;
    const avg = peers.reduce((s, x) => s + x.amount, 0) / peers.length;
    if (t.amount >= avg * 3 && t.amount >= 2000) {
      out.push({
        key: `unusual:${t.id}`,
        priority: "info",
        module: "spending",
        title: `Large ${t.category ?? "expense"}: ${m(t.amount)}`,
        body: `${t.description || "This expense"} on ${formatDate(t.date)} is about ${Math.round(t.amount / avg)}× your usual ${t.category ?? ""} spend.`,
        date: t.date,
      });
    }
  }

  const dismissed = ds.profile.preferences?.dismissedAlerts ?? {};
  const modules = ds.profile.preferences?.notifications?.modules ?? {};
  return out
    .filter((a) => !dismissed[a.key] && modules[a.module] !== false)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.date ?? "").localeCompare(b.date ?? ""));
}
