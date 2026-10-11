"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { celebrate } from "@/lib/celebrate";
import { useFinance } from "@/lib/finance";
import { archivePatch, daySummary, editPatch, indexLogs, unarchivePatch, DAY_GOAL_DEFAULT } from "@/lib/rhythm";
import { useStore } from "@/lib/store";
import type { Habit, HabitLog, HabitLogStatus, ISODate } from "@/lib/types";

/** One change at a time per activity-day, so a quick double tap can't race its own save. */
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return next;
}

const current = (habitId: string, date: ISODate): HabitLog | undefined =>
  useStore.getState().ds?.habit_logs.find((l) => l.habit_id === habitId && l.date === date);

/** Settings and data for Daily Rhythm, read once per render. */
export function useRhythm() {
  const { ds, today } = useFinance();
  const index = useMemo(() => indexLogs(ds.habit_logs), [ds.habit_logs]);
  const prefs = ds.profile.preferences ?? {};
  const weekStart: 0 | 1 = prefs.rhythmWeekStart === 0 ? 0 : 1;
  const goal = prefs.rhythmDayGoal ?? DAY_GOAL_DEFAULT;
  return { ds, today, habits: ds.habits, logs: ds.habit_logs, index, weekStart, goal };
}

export function useRhythmActions() {
  const { today } = useFinance();
  const store = useStore.getState;

  /** Record a status for one activity on one day. null clears it (back to pending / missed). */
  async function setStatus(h: Habit, date: ISODate, status: HabitLogStatus | null) {
    if (date > today && status && status !== "skipped") {
      toast.error("You can only skip a future day — tick it off on the day.");
      return;
    }
    await serial(`${h.id}|${date}`, async () => {
      const ex = current(h.id, date);
      const completed_at = status === "completed" ? new Date().toISOString() : null;
      if (!status || status === "pending") {
        if (!ex) return;
        if (ex.notes || ex.actual_value != null) await store().patch("habit_logs", ex.id, { status: "pending", completed_at: null });
        else await store().remove("habit_logs", ex.id);
        return;
      }
      if (ex) await store().patch("habit_logs", ex.id, { status, completed_at });
      else await store().add("habit_logs", { habit_id: h.id, date, status, completed_at });
    });
    if (status === "completed" && date === today) {
      const s = store().ds;
      if (!s) return;
      const day = daySummary(s.habits, indexLogs(s.habit_logs), today, today);
      if (day.tally.eligible > 1 && day.tally.completed === day.tally.eligible) {
        toast.success("Everything done for today. Nice rhythm!");
        celebrate(["🎉", "✨", "🔥", "⭐", "💪"]);
      }
    }
  }

  async function toggle(h: Habit, date: ISODate, done: boolean) {
    await setStatus(h, date, done ? null : "completed");
  }

  async function setNote(h: Habit, date: ISODate, notes: string) {
    const text = notes.trim() || null;
    await serial(`${h.id}|${date}`, async () => {
      const ex = current(h.id, date);
      if (ex) {
        if (!text && ex.status === "pending" && ex.actual_value == null) await store().remove("habit_logs", ex.id);
        else await store().patch("habit_logs", ex.id, { notes: text });
      } else if (text) await store().add("habit_logs", { habit_id: h.id, date, status: "pending", notes: text });
    });
  }

  async function create(row: Partial<Habit>) {
    const habits = store().ds?.habits ?? [];
    const sort_order = habits.reduce((m, h) => Math.max(m, h.sort_order), -1) + 1;
    return store().add("habits", {
      category: "General", frequency: "daily", days: [], schedule_history: [], start_date: today, archived: false, ...row, sort_order,
    });
  }

  async function createMany(rows: Partial<Habit>[]) {
    const habits = store().ds?.habits ?? [];
    let next = habits.reduce((m, h) => Math.max(m, h.sort_order), -1) + 1;
    return store().addMany(
      "habits",
      rows.map((r) => ({ category: "General", frequency: "daily" as const, days: [], schedule_history: [], start_date: today, archived: false, ...r, sort_order: next++ })),
    );
  }

  async function update(h: Habit, next: Partial<Habit>) {
    await store().patch("habits", h.id, editPatch(h, next, today));
  }

  async function archive(h: Habit) {
    await store().patch("habits", h.id, archivePatch(today));
    toast.success(`${h.name} archived — its history stays in your reports.`);
  }

  async function restore(h: Habit) {
    await store().patch("habits", h.id, unarchivePatch(h, today));
    toast.success(`${h.name} is back from today.`);
  }

  async function remove(h: Habit) {
    await store().remove("habits", h.id);
    toast.success(`${h.name} deleted.`);
  }

  /**
   * Save a new order for the activities on screen (after a drag). Activities that aren't shown (archived, or
   * another category) keep their places; the shown ones fill their slots in the new order.
   */
  async function reorder(visibleIds: string[]) {
    const all = [...(store().ds?.habits ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const shown = new Set(visibleIds);
    const queue = visibleIds.map((id) => all.find((h) => h.id === id)).filter((h): h is Habit => !!h);
    const order = all.map((h) => (shown.has(h.id) ? queue.shift()! : h));
    // Renumber everything so ties from older data can't keep two rows in place.
    await Promise.all(order.map((x, k) => (x.sort_order !== k ? store().patch("habits", x.id, { sort_order: k }) : null)));
  }

  return { setStatus, toggle, setNote, create, createMany, update, archive, restore, remove, reorder };
}
