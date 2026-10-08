// Occurrence generation for recurring rules.

import { addDays, addMonths, clampDay, dayOfMonth, diffDays, parseISO } from "../dates";
import type { Frequency, ISODate } from "../types";

export interface RecurrenceSpec {
  frequency: Frequency;
  start_date: ISODate;
  end_date?: ISODate | null;
  day_of_month?: number | null;
  interval_days?: number | null;
}

const MONTH_STEP: Partial<Record<Frequency, number>> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

/**
 * All occurrence dates of a recurrence that fall within [from, to] (inclusive),
 * respecting the rule's own start/end dates.
 */
export function occurrences(spec: RecurrenceSpec, from: ISODate, to: ISODate, limit = 5000): ISODate[] {
  const GUARD = 20000;
  const out: ISODate[] = [];
  const end = spec.end_date && spec.end_date < to ? spec.end_date : to;
  if (end < from || spec.start_date > end) return out;

  if (spec.frequency === "once") {
    if (spec.start_date >= from && spec.start_date <= end) out.push(spec.start_date);
    return out;
  }

  const monthStep = MONTH_STEP[spec.frequency];
  if (monthStep) {
    const anchorDay = spec.day_of_month || dayOfMonth(spec.start_date);
    const start = parseISO(spec.start_date);
    // First occurrence: the anchor day in the start month, or the next period if that is before start.
    let i = 0;
    let first = clampDay(start.getUTCFullYear(), start.getUTCMonth(), anchorDay);
    if (first < spec.start_date) {
      first = clampDay(start.getUTCFullYear(), start.getUTCMonth() + monthStep, anchorDay);
    }
    // Jump close to `from` without iterating every period.
    if (first < from) {
      const fromD = parseISO(from);
      const firstD = parseISO(first);
      const monthsGap = (fromD.getUTCFullYear() - firstD.getUTCFullYear()) * 12 + (fromD.getUTCMonth() - firstD.getUTCMonth());
      i = Math.max(0, Math.floor(monthsGap / monthStep) - 1);
    }
    for (let guard = 0; guard < GUARD && out.length < limit; guard++, i++) {
      const d = addMonths(first, i * monthStep, anchorDay);
      if (d > end) break;
      if (d >= from) out.push(d);
    }
    return out;
  }

  const step = spec.frequency === "weekly" ? 7 : spec.frequency === "biweekly" ? 14 : Math.max(1, spec.interval_days || 30);
  let k = 0;
  if (spec.start_date < from) k = Math.floor(diffDays(spec.start_date, from) / step);
  for (let guard = 0; guard < GUARD && out.length < limit; guard++, k++) {
    const d = addDays(spec.start_date, k * step);
    if (d > end) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** The occurrence that follows `date` (used to find a budget period's end). */
export function nextOccurrenceAfter(spec: RecurrenceSpec, date: ISODate): ISODate | null {
  const horizon = addDays(date, 800);
  const list = occurrences({ ...spec, end_date: null }, addDays(date, 1), horizon, 1);
  return list[0] ?? null;
}

/** Approximate number of occurrences per month, used to normalise rules to a monthly figure. */
export function perMonth(frequency: Frequency, intervalDays?: number | null): number {
  switch (frequency) {
    case "weekly":
      return 52 / 12;
    case "biweekly":
      return 26 / 12;
    case "monthly":
      return 1;
    case "quarterly":
      return 1 / 3;
    case "half_yearly":
      return 1 / 6;
    case "yearly":
      return 1 / 12;
    case "custom":
      return 30.4375 / Math.max(1, intervalDays || 30);
    default:
      return 0;
  }
}
