// Daily Rhythm — the habit tracker's rules. Pure functions, unit-tested; the UI only displays what these return.
//
// Rules (shown to the user in plain words too):
// - An activity has a day ("occurrence") when its schedule says so, inside [start_date, end_date] and before it was
//   archived. A record you saved on a day also makes it a day for that activity (your history always counts).
// - Status of a day: what you recorded (completed / missed / skipped). Nothing recorded → "pending" today,
//   "missed" on earlier days. Future days are never counted.
// - Completion rate = completed ÷ (completed + missed + pending). Skipped days are left out entirely.
// - Rates over a week or month add up the days' counts; they never average daily percentages.
// - Activity streak: consecutive scheduled days completed. Skipped days and days it isn't scheduled neither add to
//   nor break a streak; today's pending day doesn't break it either. Streaks run across month boundaries.
// - Day streak: consecutive days on which at least the daily goal (default 80%) of activities were done. Days with
//   nothing scheduled are passed over; today only adds once it qualifies.

import { addDays, addMonths, daysInMonth, diffDays, formatMonthLong, maxDate, minDate, monthKey, weekday } from "../dates";
import type { Habit, HabitLog, HabitSchedulePeriod, ISODate } from "../types";

export type OccStatus = "completed" | "missed" | "pending" | "skipped" | "future";

export interface Occurrence {
  habit: Habit;
  date: ISODate;
  status: OccStatus;
  log?: HabitLog;
}

export interface Tally {
  completed: number;
  missed: number;
  pending: number;
  skipped: number;
  /** Days still to come (never counted in rates). */
  upcoming: number;
  /** completed + missed + pending */
  eligible: number;
  /** completed ÷ eligible, or null when nothing was eligible (never shown as 0%). */
  rate: number | null;
}

export type LogIndex = Map<string, HabitLog>;

const key = (habitId: string, date: ISODate) => `${habitId}|${date}`;

export function indexLogs(logs: HabitLog[]): LogIndex {
  const m: LogIndex = new Map();
  for (const l of logs) m.set(key(l.habit_id, l.date), l);
  return m;
}

export function logFor(index: LogIndex, habitId: string, date: ISODate): HabitLog | undefined {
  return index.get(key(habitId, date));
}

export const DAY_GOAL_DEFAULT = 80;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

type Pattern = Pick<HabitSchedulePeriod, "frequency" | "days" | "interval_days" | "anchor">;

function patternMatches(p: Pattern, date: ISODate, fallbackAnchor: ISODate): boolean {
  switch (p.frequency) {
    case "off":
      return false;
    case "daily":
      return true;
    case "days":
      return (p.days ?? []).includes(weekday(date));
    case "interval": {
      const n = Math.max(1, Math.round(p.interval_days ?? 1));
      const d = diffDays(p.anchor ?? fallbackAnchor, date);
      return d >= 0 && d % n === 0;
    }
  }
}

/** The day after which the activity has no more days (inclusive last day), or null when open-ended. */
export function lastDay(h: Habit): ISODate | null {
  const ends = [h.end_date, h.archived_on ? addDays(h.archived_on, -1) : null].filter(Boolean) as ISODate[];
  return ends.length ? ends.reduce(minDate) : null;
}

/** The current schedule's "every N days" anchor: the day it took effect. */
function currentAnchor(h: Habit): ISODate {
  const changes = (h.schedule_history ?? []).filter((s) => s.frequency !== "off").map((s) => s.until);
  return changes.length ? maxDate(changes.reduce(maxDate), h.start_date) : h.start_date;
}

/** Is the activity scheduled on this date by its schedule (ignoring records)? */
export function isScheduled(h: Habit, date: ISODate): boolean {
  if (date < h.start_date) return false;
  const last = lastDay(h);
  if (last && date > last) return false;
  const hist = h.schedule_history ?? [];
  // "off" gaps (time spent archived) take precedence, then earlier schedules, then the current one.
  const ordered = [...hist.filter((s) => s.frequency === "off"), ...hist.filter((s) => s.frequency !== "off")];
  for (const s of ordered) if ((!s.from || date >= s.from) && date < s.until) return patternMatches(s, date, h.start_date);
  return patternMatches({ frequency: h.frequency, days: h.days, interval_days: h.interval_days, anchor: currentAnchor(h) }, date, h.start_date);
}

/** Does this activity have a day on `date` — scheduled, or something you recorded for it? */
export function hasDay(h: Habit, index: LogIndex, date: ISODate): boolean {
  if (isScheduled(h, date)) return true;
  const l = logFor(index, h.id, date);
  return !!l && l.status !== "pending" && date >= h.start_date;
}

function statusOf(log: HabitLog | undefined, date: ISODate, today: ISODate): OccStatus {
  if (log && log.status !== "pending") {
    if (date > today && log.status !== "skipped") return "future";
    return log.status;
  }
  if (date > today) return "future";
  return date === today ? "pending" : "missed";
}

const bySort = (a: Habit, b: Habit) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

/** Every activity's day on `date`, in checklist order. */
export function occurrencesOn(habits: Habit[], index: LogIndex, date: ISODate, today: ISODate): Occurrence[] {
  return habits
    .filter((h) => hasDay(h, index, date))
    .sort(bySort)
    .map((h) => {
      const log = logFor(index, h.id, date);
      return { habit: h, date, log, status: statusOf(log, date, today) };
    });
}

export function emptyTally(): Tally {
  return { completed: 0, missed: 0, pending: 0, skipped: 0, upcoming: 0, eligible: 0, rate: null };
}

export function addTo(t: Tally, s: OccStatus): void {
  if (s === "future") t.upcoming++;
  else t[s]++;
  t.eligible = t.completed + t.missed + t.pending;
  t.rate = t.eligible ? t.completed / t.eligible : null;
}

export function sumTallies(list: Tally[]): Tally {
  const t = emptyTally();
  for (const x of list) {
    t.completed += x.completed;
    t.missed += x.missed;
    t.pending += x.pending;
    t.skipped += x.skipped;
    t.upcoming += x.upcoming;
  }
  t.eligible = t.completed + t.missed + t.pending;
  t.rate = t.eligible ? t.completed / t.eligible : null;
  return t;
}

export function tallyOf(occ: Occurrence[]): Tally {
  const t = emptyTally();
  for (const o of occ) addTo(t, o.status);
  return t;
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

/**
 * How a day looks in the calendar.
 * none: nothing scheduled (or before tracking began) · future · all: everything done · some: part done ·
 * zero: nothing done · open: today, nothing done yet · skipped: everything that day was skipped.
 */
export type DayLook = "none" | "future" | "all" | "some" | "zero" | "open" | "skipped";

export interface DaySummary {
  date: ISODate;
  occ: Occurrence[];
  tally: Tally;
  look: DayLook;
}

export function daySummary(habits: Habit[], index: LogIndex, date: ISODate, today: ISODate): DaySummary {
  const occ = occurrencesOn(habits, index, date, today);
  const tally = tallyOf(occ);
  let look: DayLook;
  if (!occ.length) look = "none";
  else if (date > today) look = "future";
  else if (!tally.eligible) look = "skipped";
  else if (tally.completed === tally.eligible) look = "all";
  else if (tally.completed > 0) look = "some";
  else if (date === today && tally.pending > 0) look = "open";
  else look = "zero";
  return { date, occ, tally, look };
}

/** Calendar cells for a month: leading/trailing days from neighbouring months fill the weeks. */
export function monthCells(month: string, weekStart: 0 | 1): { date: ISODate; inMonth: boolean }[] {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lead = (weekday(first) - weekStart + 7) % 7;
  const n = daysInMonth(y, m - 1);
  const total = Math.ceil((lead + n) / 7) * 7;
  const out: { date: ISODate; inMonth: boolean }[] = [];
  for (let i = 0; i < total; i++) {
    const d = addDays(first, i - lead);
    out.push({ date: d, inMonth: monthKey(d) === month });
  }
  return out;
}

export function monthDates(month: string): ISODate[] {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: daysInMonth(y, m - 1) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

export interface Streaks {
  current: number;
  best: number;
  /** Last day of the best run (for "best: 8 days, ended 12 Oct"). */
  bestEnd?: ISODate | null;
}

/** Earliest day any activity could have a day. */
export function trackingStart(habits: Habit[]): ISODate | null {
  return habits.length ? habits.map((h) => h.start_date).reduce(minDate) : null;
}

/**
 * Streaks for one activity between `from` and `to` (inclusive; `to` is usually today).
 * `current` is the run that is still alive at `to`.
 */
export function habitStreaks(h: Habit, index: LogIndex, today: ISODate, from?: ISODate, to?: ISODate): Streaks {
  const start = maxDate(from ?? h.start_date, h.start_date);
  let end = minDate(to ?? today, today);
  const last = lastDay(h);
  if (last) end = minDate(end, last);
  let run = 0;
  let best = 0;
  let bestEnd: ISODate | null = null;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!hasDay(h, index, d)) continue;
    const s = statusOf(logFor(index, h.id, d), d, today);
    if (s === "completed") {
      run++;
      if (run > best) {
        best = run;
        bestEnd = d;
      }
    } else if (s === "missed") run = 0;
    // skipped, pending (today) and future neither add nor break
  }
  return { current: run, best, bestEnd };
}

/** Days on which at least `goal`% of the day's activities were done, in a row. */
export function dayStreaks(habits: Habit[], index: LogIndex, today: ISODate, goal = DAY_GOAL_DEFAULT, from?: ISODate, to?: ISODate): Streaks {
  const first = trackingStart(habits);
  if (!first) return { current: 0, best: 0, bestEnd: null };
  const start = maxDate(from ?? first, first);
  const end = minDate(to ?? today, today);
  let run = 0;
  let best = 0;
  let bestEnd: ISODate | null = null;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const { tally } = daySummary(habits, index, d, today);
    if (!tally.eligible) continue;
    const ok = tally.completed / tally.eligible >= goal / 100 - 1e-9;
    if (ok) {
      run++;
      if (run > best) {
        best = run;
        bestEnd = d;
      }
    } else if (d < today) run = 0;
    // today not yet at the goal: still time, the streak stays as it was
  }
  return { current: run, best, bestEnd };
}

// ---------------------------------------------------------------------------
// Month report
// ---------------------------------------------------------------------------

export interface HabitMonth {
  habit: Habit;
  tally: Tally;
  /** Best run inside this month. */
  bestStreak: number;
}

export interface WeekRow {
  label: string;
  from: ISODate;
  to: ISODate;
  tally: Tally;
}

export interface MonthReport {
  month: string;
  days: DaySummary[];
  tally: Tally;
  perHabit: HabitMonth[];
  weeks: WeekRow[];
  /** Activities that had at least one day this month. */
  activeCount: number;
  bestDay: DaySummary | null;
  mostConsistent: HabitMonth | null;
  leastConsistent: HabitMonth | null;
  /** Days on which everything eligible was done. */
  perfectDays: number;
  /** Best day streak inside the month. */
  bestDayStreak: number;
}

export function monthReport(habits: Habit[], index: LogIndex, month: string, today: ISODate, weekStart: 0 | 1 = 1, goal = DAY_GOAL_DEFAULT): MonthReport {
  const dates = monthDates(month);
  const days = dates.map((d) => daySummary(habits, index, d, today));
  const tally = sumTallies(days.map((d) => d.tally));

  const per = new Map<string, Tally>();
  for (const d of days)
    for (const o of d.occ) {
      if (!per.has(o.habit.id)) per.set(o.habit.id, emptyTally());
      addTo(per.get(o.habit.id)!, o.status);
    }
  const first = dates[0];
  const last = dates[dates.length - 1];
  const perHabit: HabitMonth[] = habits
    .filter((h) => per.has(h.id))
    .sort(bySort)
    .map((h) => ({ habit: h, tally: per.get(h.id)!, bestStreak: habitStreaks(h, index, today, first, last).best }));

  // Weeks clipped to the month; each week's rate comes from its own counts.
  const weeks: WeekRow[] = [];
  let cur: DaySummary[] = [];
  const flush = () => {
    if (!cur.length) return;
    weeks.push({ label: `Week ${weeks.length + 1}`, from: cur[0].date, to: cur[cur.length - 1].date, tally: sumTallies(cur.map((c) => c.tally)) });
    cur = [];
  };
  for (const d of days) {
    if (cur.length && weekday(d.date) === weekStart) flush();
    cur.push(d);
  }
  flush();

  const rated = days.filter((d) => d.tally.rate != null && d.date <= today);
  const bestDay = rated.length ? rated.reduce((a, b) => (b.tally.rate! > a.tally.rate! || (b.tally.rate === a.tally.rate && b.tally.completed > a.tally.completed) ? b : a)) : null;
  const withRate = perHabit.filter((p) => p.tally.rate != null);
  const mostConsistent = withRate.length ? withRate.reduce((a, b) => (b.tally.rate! > a.tally.rate! || (b.tally.rate === a.tally.rate && b.tally.eligible > a.tally.eligible) ? b : a)) : null;
  const leastConsistent = withRate.length > 1 ? withRate.reduce((a, b) => (b.tally.rate! < a.tally.rate! ? b : a)) : null;

  return {
    month,
    days,
    tally,
    perHabit,
    weeks,
    activeCount: perHabit.length,
    bestDay,
    mostConsistent,
    leastConsistent: leastConsistent && mostConsistent && leastConsistent.habit.id !== mostConsistent.habit.id ? leastConsistent : null,
    perfectDays: days.filter((d) => d.look === "all").length,
    bestDayStreak: dayStreaks(habits, index, today, goal, first, last).best,
  };
}

// ---------------------------------------------------------------------------
// Insights and history
// ---------------------------------------------------------------------------

export interface Insight {
  text: string;
  tone: "good" | "bad" | "neutral";
}

const pct = (r: number) => `${Math.round(r * 100)}%`;
/** Enough history to say something meaningful. */
export const MIN_ELIGIBLE_FOR_INSIGHTS = 7;

/** Short observations from the saved records. Empty when there isn't enough history yet. */
export function monthInsights(r: MonthReport, prev: MonthReport | null, today: ISODate): Insight[] {
  if (r.tally.eligible < MIN_ELIGIBLE_FOR_INSIGHTS || r.tally.rate == null) return [];
  const out: Insight[] = [];
  const thisMonth = monthKey(today) === r.month;
  out.push({
    text: `You completed ${pct(r.tally.rate)} of your scheduled activities ${thisMonth ? "this month so far" : `in ${formatMonthLong(r.month)}`} (${r.tally.completed} of ${r.tally.eligible}).`,
    tone: r.tally.rate >= 0.7 ? "good" : r.tally.rate < 0.4 ? "bad" : "neutral",
  });
  if (r.mostConsistent && r.mostConsistent.tally.eligible >= 3)
    out.push({ text: `${r.mostConsistent.habit.name} was your most consistent activity, at ${pct(r.mostConsistent.tally.rate!)}.`, tone: "good" });
  if (prev && prev.tally.rate != null && prev.tally.eligible >= MIN_ELIGIBLE_FOR_INSIGHTS) {
    const diff = Math.round((r.tally.rate - prev.tally.rate) * 100);
    const pm = formatMonthLong(prev.month).split(" ")[0];
    if (diff >= 1) out.push({ text: `That's ${diff} percentage point${diff === 1 ? "" : "s"} better than ${pm} (${pct(prev.tally.rate)}).`, tone: "good" });
    else if (diff <= -1) out.push({ text: `That's ${-diff} percentage point${diff === -1 ? "" : "s"} lower than ${pm} (${pct(prev.tally.rate)}).`, tone: "bad" });
    else out.push({ text: `About the same as ${pm} (${pct(prev.tally.rate)}).`, tone: "neutral" });
  }
  if (r.perfectDays > 0) out.push({ text: `You did everything you'd planned on ${r.perfectDays} day${r.perfectDays === 1 ? "" : "s"}.`, tone: "good" });

  // An activity whose latest week fell well below the rest of its month.
  const weeks = r.weeks.filter((w) => w.tally.eligible > 0);
  if (weeks.length >= 2) {
    const lastW = weeks[weeks.length - 1];
    const lastDates = new Set(r.days.filter((d) => d.date >= lastW.from && d.date <= lastW.to).map((d) => d.date));
    let worst: { name: string; drop: number } | null = null;
    let bestRise: { name: string; rise: number } | null = null;
    for (const p of r.perHabit) {
      const a = emptyTally();
      const b = emptyTally();
      for (const d of r.days) for (const o of d.occ) if (o.habit.id === p.habit.id) addTo(lastDates.has(d.date) ? b : a, o.status);
      if (a.eligible < 3 || b.eligible < 2 || a.rate == null || b.rate == null) continue;
      const delta = b.rate - a.rate;
      if (delta <= -0.25 && (!worst || -delta > worst.drop)) worst = { name: p.habit.name, drop: -delta };
      if (delta >= 0.25 && (!bestRise || delta > bestRise.rise)) bestRise = { name: p.habit.name, rise: delta };
    }
    const latest = thisMonth ? "this past week" : "the final week";
    if (worst) out.push({ text: `${worst.name} slipped in ${latest} (${Math.round(worst.drop * 100)} points below the rest of the month).`, tone: "bad" });
    if (bestRise) out.push({ text: `${bestRise.name} picked up in ${latest} (${Math.round(bestRise.rise * 100)} points above the rest of the month).`, tone: "good" });
  }
  if (r.leastConsistent && r.leastConsistent.tally.rate! < 0.5 && r.leastConsistent.tally.eligible >= 3)
    out.push({ text: `${r.leastConsistent.habit.name} needs attention: done ${r.leastConsistent.tally.completed} of ${r.leastConsistent.tally.eligible} times (${pct(r.leastConsistent.tally.rate!)}).`, tone: "bad" });
  return out;
}

/** Months from the first tracked month to the current one, newest first. */
export function trackedMonths(habits: Habit[], today: ISODate): string[] {
  const first = trackingStart(habits);
  if (!first) return [];
  const out: string[] = [];
  let m = monthKey(minDate(first, today));
  const end = monthKey(today);
  while (m <= end) {
    out.push(m);
    m = monthKey(addMonths(`${m}-01`, 1, 1));
  }
  return out.reverse();
}

export interface Comparison {
  improved: { habit: Habit; from: number; to: number }[];
  declined: { habit: Habit; from: number; to: number }[];
}

/** Activities that moved by at least 10 points between two months (both months need a few days of data). */
export function compareMonths(a: MonthReport, b: MonthReport): Comparison {
  const prev = new Map(a.perHabit.map((p) => [p.habit.id, p]));
  const out: Comparison = { improved: [], declined: [] };
  for (const p of b.perHabit) {
    const q = prev.get(p.habit.id);
    if (!q || q.tally.rate == null || p.tally.rate == null || q.tally.eligible < 3 || p.tally.eligible < 3) continue;
    const d = p.tally.rate - q.tally.rate;
    if (d >= 0.1) out.improved.push({ habit: p.habit, from: q.tally.rate, to: p.tally.rate });
    if (d <= -0.1) out.declined.push({ habit: p.habit, from: q.tally.rate, to: p.tally.rate });
  }
  out.improved.sort((x, y) => y.to - y.from - (x.to - x.from));
  out.declined.sort((x, y) => x.to - x.from - (y.to - y.from));
  return out;
}

// ---------------------------------------------------------------------------
// Editing helpers
// ---------------------------------------------------------------------------

/** Plain-words schedule, e.g. "Every day", "Mon, Wed, Fri", "Every 3 days". */
export function scheduleLabel(h: Pick<Habit, "frequency" | "days" | "interval_days">, weekStart: 0 | 1 = 1): string {
  if (h.frequency === "daily") return "Every day";
  if (h.frequency === "interval") {
    const n = h.interval_days ?? 1;
    return n === 1 ? "Every day" : n === 7 ? "Once a week" : `Every ${n} days`;
  }
  const days = [...(h.days ?? [])].sort((a, b) => ((a - weekStart + 7) % 7) - ((b - weekStart + 7) % 7));
  if (days.length === 7) return "Every day";
  if (!days.length) return "No days chosen";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return "Weekdays";
  if (days.length === 2 && days.includes(0) && days.includes(6)) return "Weekends";
  return days.map((d) => WEEKDAY_SHORT[d]).join(", ");
}

const sameSchedule = (a: Pattern, b: Pattern) =>
  a.frequency === b.frequency &&
  (a.frequency !== "days" || [...(a.days ?? [])].sort().join() === [...(b.days ?? [])].sort().join()) &&
  (a.frequency !== "interval" || (a.interval_days ?? 1) === (b.interval_days ?? 1));

/**
 * The fields to save when an activity is edited, keeping its past intact: a schedule change takes effect from
 * today, and the old schedule is remembered for the days before.
 */
export function editPatch(before: Habit, next: Partial<Habit>, today: ISODate): Partial<Habit> {
  const patch: Partial<Habit> = { ...next };
  const after = { ...before, ...next };
  if (before.start_date < today && after.start_date === before.start_date && !sameSchedule(before, after)) {
    patch.schedule_history = [
      ...(before.schedule_history ?? []),
      { until: today, frequency: before.frequency, days: before.days, interval_days: before.interval_days, anchor: currentAnchor(before) },
    ];
  }
  return patch;
}

/** Archive from today: no new days from today on; everything before stays. */
export function archivePatch(today: ISODate): Partial<Habit> {
  return { archived: true, archived_on: today };
}

/** Bring an archived activity back from today; the archived stretch stays empty rather than counting as missed. */
export function unarchivePatch(h: Habit, today: ISODate): Partial<Habit> {
  const hist = [...(h.schedule_history ?? [])];
  if (h.archived_on && h.archived_on < today) hist.push({ from: h.archived_on, until: today, frequency: "off" });
  return { archived: false, archived_on: null, schedule_history: hist };
}

/** Sample activities offered when you start (all optional). */
export const SUGGESTED_HABITS: { name: string; category: string; icon: string }[] = [
  { name: "Go to the gym", category: "Fitness", icon: "🏋️" },
  { name: "Read a book", category: "Learning", icon: "📖" },
  { name: "Learn something new", category: "Learning", icon: "🧠" },
  { name: "Drink enough water", category: "Health", icon: "💧" },
  { name: "Meditate", category: "Wellness", icon: "🧘" },
  { name: "Work on a personal project", category: "Productivity", icon: "🛠️" },
];

export const HABIT_CATEGORIES = ["Fitness", "Health", "Learning", "Wellness", "Productivity", "Home", "Social", "General"];
