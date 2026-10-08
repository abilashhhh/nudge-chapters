// Date-only helpers. Financial events are calendar dates ("YYYY-MM-DD") with no
// time zone, so all arithmetic is done in UTC to avoid daylight-saving drift.

import type { ISODate } from "./types";

const DAY_MS = 86_400_000;

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function parseISO(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** Today's calendar date in the given IANA time zone. */
export function todayISO(timeZone?: string): ISODate {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return parts; // en-CA formats as YYYY-MM-DD
  } catch {
    const d = new Date();
    return toISO(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())));
  }
}

export function ymd(y: number, m0: number, d: number): ISODate {
  return toISO(new Date(Date.UTC(y, m0, d)));
}

export function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}

/** A date in month (y, m0) on `day`, clamped to the month's last day (31 → 30 Apr, 28/29 Feb). */
export function clampDay(y: number, m0: number, day: number): ISODate {
  const yy = y + Math.floor(m0 / 12);
  const mm = ((m0 % 12) + 12) % 12;
  return ymd(yy, mm, Math.min(day, daysInMonth(yy, mm)));
}

export function addDays(s: ISODate, n: number): ISODate {
  return toISO(new Date(parseISO(s).getTime() + n * DAY_MS));
}

/** Add months keeping the day of month where possible (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(s: ISODate, n: number, anchorDay?: number): ISODate {
  const d = parseISO(s);
  const day = anchorDay ?? d.getUTCDate();
  return clampDay(d.getUTCFullYear(), d.getUTCMonth() + n, day);
}

export function addYears(s: ISODate, n: number): ISODate {
  return addMonths(s, n * 12);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / DAY_MS);
}

/** Whole calendar months from a to b (b's day must be >= a's day to count the last month). */
export function diffMonths(a: ISODate, b: ISODate): number {
  const da = parseISO(a);
  const db = parseISO(b);
  let months = (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
  if (db.getUTCDate() < da.getUTCDate()) months -= 1;
  return months;
}

export function startOfMonth(s: ISODate): ISODate {
  return s.slice(0, 8) + "01";
}

export function endOfMonth(s: ISODate): ISODate {
  const d = parseISO(s);
  return ymd(d.getUTCFullYear(), d.getUTCMonth(), daysInMonth(d.getUTCFullYear(), d.getUTCMonth()));
}

export function startOfYear(s: ISODate): ISODate {
  return s.slice(0, 4) + "-01-01";
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

export function dayOfMonth(s: ISODate): number {
  return Number(s.slice(8, 10));
}

export function weekday(s: ISODate): number {
  return parseISO(s).getUTCDay();
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function isBetween(s: ISODate, from: ISODate, to: ISODate): boolean {
  return s >= from && s <= to;
}

export function eachMonth(from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  let cur = startOfMonth(from);
  while (cur <= to) {
    out.push(monthKey(cur));
    cur = addMonths(cur, 1, 1);
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(s: ISODate | null | undefined, style: "short" | "medium" | "long" = "medium"): string {
  if (!s) return "—";
  const d = parseISO(s);
  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  const yr = d.getUTCFullYear();
  if (style === "short") return `${day} ${mon}`;
  if (style === "long") {
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
    return `${wd}, ${day} ${mon} ${yr}`;
  }
  return `${day} ${mon} ${yr}`;
}

export function formatMonth(key: string, withYear = true): string {
  const [y, m] = key.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : MONTHS[m - 1];
}

export function formatMonthLong(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`;
}

export function relativeDays(from: ISODate, to: ISODate): string {
  const n = diffDays(from, to);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 1 && n < 14) return `in ${n} days`;
  if (n < -1 && n > -14) return `${-n} days ago`;
  if (n >= 14 && n < 60) return `in ${Math.round(n / 7)} weeks`;
  if (n <= -14 && n > -60) return `${Math.round(-n / 7)} weeks ago`;
  if (n >= 60) return `in ${Math.round(n / 30)} months`;
  return `${Math.round(-n / 30)} months ago`;
}

export function yearsBetween(a: ISODate, b: ISODate): number {
  return diffDays(a, b) / 365.25;
}
