"use client";

// Derived financial state, computed once per data change and shared app-wide.

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { addDays, addMonths, endOfMonth, startOfMonth, todayISO } from "./dates";
import { buildAlerts, type Alert } from "./engine/alerts";
import { resolveAssumptions } from "./engine/defaults";
import { buildEvents, type FinEvent } from "./engine/events";
import { emergencyFund, goalProgress, type EmergencyFund, type GoalProgress } from "./engine/goals";
import { computePositions, moneyCtx, type Positions } from "./engine/ledger";
import { monthlyBurn, monthlyNorms, monthMetrics, runwayMonths, type MonthMetrics, type MonthlyNorms } from "./engine/metrics";
import { project, type ProjectionResult } from "./engine/projection";
import { buildNudges, type Nudge } from "./engine/life";
import type { MoneyContext } from "./money";
import { useStore } from "./store";
import type { Assumptions, Dataset, ISODate } from "./types";

export interface Finance {
  ds: Dataset;
  today: ISODate;
  ctx: MoneyContext;
  assumptions: Assumptions;
  positions: Positions;
  /** Events from the start of last month to 120 days ahead (plus anything still pending). */
  events: FinEvent[];
  month: MonthMetrics;
  norms: MonthlyNorms;
  burn: number;
  runway: number | null;
  goals: GoalProgress[];
  ef: EmergencyFund;
  near: ProjectionResult;
  alerts: Alert[];
  /** Small, explained next steps across money, chapters, tasks and wishlist. */
  nudges: Nudge[];
  advanced: boolean;
}

const FinanceContext = createContext<Finance | null>(null);

export function computeFinance(ds: Dataset): Finance {
  const today = todayISO(ds.profile.timezone);
  const ctx = moneyCtx(ds);
  const assumptions = resolveAssumptions(ds.profile);
  const positions = computePositions(ds, today);
  const events = buildEvents(ds, {
    from: startOfMonth(addMonths(today, -1)),
    to: addDays(endOfMonth(today), 120),
    today,
    positions,
    scenario: assumptions.scenarios.base,
  });
  const monthEvents = events.filter((e) => e.date <= endOfMonth(today) && (e.date >= startOfMonth(today) || e.status === "overdue" || e.status === "partial" || (e.budget && e.budget.periodEnd >= startOfMonth(today))));
  const month = monthMetrics(ds, positions, today, monthEvents);
  const norms = monthlyNorms(ds, positions);
  const burn = monthlyBurn(ds, today, norms);
  const goals = ds.goals.filter((g) => !g.archived).map((g) => goalProgress(g, positions, today));
  const ef = emergencyFund(ds, positions, norms, today, ds.profile.preferences?.emergencyMonths ?? 6);
  const near = project(ds, { today, to: addDays(today, 60), positions, assumptions, scenario: "base" });
  const alerts = buildAlerts({ ds, positions, events, projection60: near, goals, today, ctx });
  const nudges = buildNudges({ ds, today, ctx, alerts, goals, ef, month, norms });
  return {
    ds,
    today,
    ctx,
    assumptions,
    positions,
    events,
    month,
    norms,
    burn,
    runway: runwayMonths(positions.totals.cash, Math.max(norms.essentialOutflow, 1)),
    goals,
    ef,
    near,
    alerts,
    nudges,
    advanced: ds.profile.mode === "advanced",
  };
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const ds = useStore((s) => s.ds);
  const value = useMemo(() => (ds ? computeFinance(ds) : null), [ds]);
  if (!value) return null;
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance(): Finance {
  const f = useContext(FinanceContext);
  if (!f) throw new Error("useFinance must be used inside FinanceProvider");
  return f;
}
