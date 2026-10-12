import { describe, expect, it } from "vitest";
import type { Habit, HabitLog } from "../types";
import {
  archivePatch, byTimeThenSort, compareMonths, formatTime, dayStreaks, daySummary, editPatch, habitStreaks, indexLogs, isScheduled, monthCells, monthInsights,
  monthReport, occurrencesOn, scheduleLabel, trackedMonths, unarchivePatch,
} from "./index";

const TODAY = "2026-10-11"; // a Sunday

let n = 0;
const habit = (p: Partial<Habit> = {}): Habit => ({
  id: `h${++n}`, name: `Habit ${n}`, category: "General", frequency: "daily", days: [], schedule_history: [],
  start_date: "2026-10-01", sort_order: n, archived: false, ...p,
});
const log = (habit_id: string, date: string, status: HabitLog["status"], notes?: string): HabitLog => ({ id: `${habit_id}-${date}`, habit_id, date, status, notes });

describe("schedules", () => {
  it("daily, chosen weekdays and every N days", () => {
    const d = habit();
    const mwf = habit({ frequency: "days", days: [1, 3, 5] });
    const every3 = habit({ frequency: "interval", interval_days: 3 });
    expect(isScheduled(d, "2026-09-30")).toBe(false); // before start
    expect(isScheduled(d, "2026-10-01")).toBe(true);
    expect(isScheduled(mwf, "2026-10-05")).toBe(true); // Monday
    expect(isScheduled(mwf, "2026-10-06")).toBe(false); // Tuesday is not a miss
    expect(["2026-10-01", "2026-10-04", "2026-10-07"].every((x) => isScheduled(every3, x))).toBe(true);
    expect(isScheduled(every3, "2026-10-02")).toBe(false);
    expect(scheduleLabel(mwf)).toBe("Mon, Wed, Fri");
    expect(scheduleLabel({ frequency: "days", days: [1, 2, 3, 4, 5] })).toBe("Weekdays");
  });

  it("respects end date and archiving", () => {
    const h = habit({ end_date: "2026-10-05" });
    expect(isScheduled(h, "2026-10-05")).toBe(true);
    expect(isScheduled(h, "2026-10-06")).toBe(false);
    const a = habit({ ...archivePatch("2026-10-08") });
    expect(isScheduled(a, "2026-10-07")).toBe(true);
    expect(isScheduled(a, "2026-10-08")).toBe(false);
  });

  it("changing the schedule keeps the past as it was", () => {
    const h = habit(); // daily since 1 Oct
    const p = editPatch(h, { frequency: "days", days: [1, 3, 5] }, TODAY);
    const after = { ...h, ...p };
    expect(after.schedule_history).toHaveLength(1);
    expect(isScheduled(after, "2026-10-06")).toBe(true); // a Tuesday before the change: still a day
    expect(isScheduled(after, "2026-10-13")).toBe(false); // a Tuesday after it: not a day
    expect(isScheduled(after, "2026-10-12")).toBe(true); // Monday
    // A brand-new activity (starting today) has no past, so nothing is remembered.
    expect(editPatch(habit({ start_date: TODAY }), { frequency: "days", days: [1] }, TODAY).schedule_history).toBeUndefined();
  });

  it("an archived stretch doesn't turn into misses when brought back", () => {
    const h = habit({ archived: true, archived_on: "2026-10-03" });
    const back = { ...h, ...unarchivePatch(h, "2026-10-09") };
    expect(isScheduled(back, "2026-10-02")).toBe(true);
    expect(isScheduled(back, "2026-10-05")).toBe(false);
    expect(isScheduled(back, "2026-10-09")).toBe(true);
  });
});

describe("statuses and rates", () => {
  it("pending today, missed in the past, future not counted, skipped left out", () => {
    const h = habit();
    const idx = indexLogs([log(h.id, "2026-10-09", "completed"), log(h.id, "2026-10-08", "skipped")]);
    expect(occurrencesOn([h], idx, TODAY, TODAY)[0].status).toBe("pending");
    expect(occurrencesOn([h], idx, "2026-10-10", TODAY)[0].status).toBe("missed");
    expect(occurrencesOn([h], idx, "2026-10-12", TODAY)[0].status).toBe("future");
    expect(occurrencesOn([h], idx, "2026-10-08", TODAY)[0].status).toBe("skipped");
  });

  it("day completion = completed ÷ eligible (spec example: 3 of 5 = 60%)", () => {
    const hs = [habit(), habit(), habit(), habit(), habit()];
    const d = "2026-10-11";
    const idx = indexLogs([log(hs[0].id, d, "completed"), log(hs[1].id, d, "completed"), log(hs[2].id, d, "completed"), log(hs[3].id, d, "missed")]);
    const s = daySummary(hs, idx, d, TODAY);
    expect(s.tally).toMatchObject({ completed: 3, missed: 1, pending: 1, skipped: 0, eligible: 5 });
    expect(s.tally.rate).toBeCloseTo(0.6);
    expect(s.look).toBe("some");
  });

  it("skips are excluded from the denominator (spec example: 16 / (20 − 1) = 84.2%)", () => {
    const gym = habit({ start_date: "2026-09-01", frequency: "days", days: [1, 2, 3, 4, 5] }); // Sep 2026 has 22 weekdays
    const dates: string[] = [];
    for (let d = 1; d <= 30; d++) {
      const iso = `2026-09-${String(d).padStart(2, "0")}`;
      if (isScheduled(gym, iso)) dates.push(iso);
    }
    const twenty = dates.slice(0, 20);
    const logs = [
      ...twenty.slice(0, 16).map((d) => log(gym.id, d, "completed")),
      ...twenty.slice(16, 19).map((d) => log(gym.id, d, "missed")),
      log(gym.id, twenty[19], "skipped"),
      ...dates.slice(20).map((d) => log(gym.id, d, "skipped")),
    ];
    const r = monthReport([gym], indexLogs(logs), "2026-09", TODAY);
    expect(r.tally).toMatchObject({ completed: 16, missed: 3, skipped: 3, eligible: 19 });
    expect(Math.round(r.tally.rate! * 1000) / 10).toBe(84.2);
  });

  it("days with nothing scheduled are 'none', never 0%", () => {
    const h = habit({ frequency: "days", days: [1] });
    const s = daySummary([h], indexLogs([]), "2026-10-06", TODAY);
    expect(s.look).toBe("none");
    expect(s.tally.rate).toBeNull();
    expect(daySummary([h], indexLogs([]), "2026-10-05", TODAY).look).toBe("zero");
  });
});

describe("month report", () => {
  it("weekly rates come from counts, not averages of daily %", () => {
    const a = habit();
    const b = habit({ frequency: "days", days: [3] }); // Wednesdays only
    const logs = [log(a.id, "2026-10-01", "completed"), log(b.id, "2026-10-01", "missed"), log(a.id, "2026-10-02", "completed")];
    const r = monthReport([a, b], indexLogs(logs), "2026-10", TODAY, 1);
    // Week 1 (Thu 1 – Sun 4): a has 4 days (2 done), b has Wed 1 (missed) → 2 of 5
    expect(r.weeks[0]).toMatchObject({ from: "2026-10-01", to: "2026-10-04" });
    expect(r.weeks[0].tally.completed).toBe(2);
    expect(r.weeks[0].tally.eligible).toBe(5);
    expect(r.weeks.at(-1)!.to).toBe("2026-10-31");
    // Future days in October aren't counted
    expect(r.tally.upcoming).toBeGreaterThan(0);
    expect(r.tally.eligible).toBe(11 + 2);
  });

  it("calendar cells start on the chosen weekday", () => {
    const mon = monthCells("2026-10", 1);
    expect(mon[0].date).toBe("2026-09-28");
    expect(mon.length % 7).toBe(0);
    expect(monthCells("2026-10", 0)[0].date).toBe("2026-09-27");
  });

  it("insights need enough history and compare with the month before", () => {
    const h = habit({ start_date: "2026-09-01" });
    const logs: HabitLog[] = [];
    for (let d = 1; d <= 30; d++) logs.push(log(h.id, `2026-09-${String(d).padStart(2, "0")}`, d % 2 ? "completed" : "missed"));
    for (let d = 1; d <= 10; d++) logs.push(log(h.id, `2026-10-${String(d).padStart(2, "0")}`, "completed"));
    const idx = indexLogs(logs);
    const sep = monthReport([h], idx, "2026-09", TODAY);
    const oct = monthReport([h], idx, "2026-10", TODAY);
    const ins = monthInsights(oct, sep, TODAY).map((i) => i.text);
    expect(ins[0]).toContain("91%"); // 10 of 11 — today is still pending
    expect(ins.some((t) => t.includes("better than September"))).toBe(true);
    expect(monthInsights(monthReport([habit({ start_date: TODAY })], indexLogs([]), "2026-10", TODAY), null, TODAY)).toEqual([]);
    expect(compareMonths(sep, oct).improved[0].habit.id).toBe(h.id);
    expect(trackedMonths([h], TODAY)).toEqual(["2026-10", "2026-09"]);
  });
});

describe("time of day", () => {
  it("checklist lists timed activities first, earliest first, then the rest in their order", () => {
    const a = habit({ name: "Read", time: "22:00", sort_order: 0 });
    const b = habit({ name: "Water", sort_order: 1 });
    const c = habit({ name: "Gym", time: "06:30", sort_order: 2 });
    const d = habit({ name: "Learn", sort_order: 0 });
    expect(occurrencesOn([a, b, c, d], indexLogs([]), TODAY, TODAY).map((o) => o.habit.name)).toEqual(["Gym", "Read", "Learn", "Water"]);
    expect([b, a].sort(byTimeThenSort)[0].name).toBe("Read");
  });

  it("formats times for display", () => {
    expect(formatTime("06:30")).toMatch(/^6:30\s?AM$/);
    expect(formatTime("22:05")).toMatch(/^10:05\s?PM$/);
    expect(formatTime(null)).toBe("");
  });
});

describe("streaks", () => {
  it("runs across month boundaries; skips and rest days don't break; today pending doesn't break", () => {
    const h = habit({ start_date: "2026-09-25" });
    const logs = ["09-27", "09-28", "09-29", "09-30", "10-01"].map((d) => log(h.id, `2026-${d}`, "completed"));
    logs.push(log(h.id, "2026-10-02", "skipped"), log(h.id, "2026-10-03", "completed"));
    // 4 Oct onwards nothing → missed on 4th, so the run ends
    const idx = indexLogs(logs);
    const s = habitStreaks(h, idx, TODAY);
    expect(s.best).toBe(6);
    expect(s.current).toBe(0);

    const fresh = habit({ start_date: "2026-10-07" });
    const idx2 = indexLogs(["07", "08", "09", "10"].map((d) => log(fresh.id, `2026-10-${d}`, "completed")));
    expect(habitStreaks(fresh, idx2, TODAY).current).toBe(4); // today still open
  });

  it("weekday activities keep streaks over days off", () => {
    const h = habit({ frequency: "days", days: [1, 3, 5], start_date: "2026-10-01" });
    const idx = indexLogs(["02", "05", "07", "09"].map((d) => log(h.id, `2026-10-${d}`, "completed")));
    expect(habitStreaks(h, idx, TODAY).current).toBe(4);
  });

  it("day streak counts days at or above the goal", () => {
    const a = habit({ start_date: "2026-10-06" });
    const b = habit({ start_date: "2026-10-06" });
    const logs = [
      log(a.id, "2026-10-06", "completed"), log(b.id, "2026-10-06", "missed"), // 50% — breaks at 80% goal
      log(a.id, "2026-10-07", "completed"), log(b.id, "2026-10-07", "completed"),
      log(a.id, "2026-10-08", "completed"), log(b.id, "2026-10-08", "skipped"), // 1 of 1
      log(a.id, "2026-10-09", "completed"), log(b.id, "2026-10-09", "completed"),
      log(a.id, "2026-10-10", "completed"), log(b.id, "2026-10-10", "completed"),
    ];
    const idx = indexLogs(logs);
    expect(dayStreaks([a, b], idx, TODAY, 80)).toMatchObject({ current: 4, best: 4 });
    expect(dayStreaks([a, b], idx, TODAY, 50).best).toBe(5);
  });
});
