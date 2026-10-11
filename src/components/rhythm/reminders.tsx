"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useFinance } from "@/lib/finance";
import { indexLogs, isScheduled, logFor } from "@/lib/rhythm";
import { useStore } from "@/lib/store";
import { withBase } from "@/lib/config";

const KEY = "nudge:rhythm:reminded";

function readSent(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSent(v: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage blocked: reminders may repeat this session, nothing worse */
  }
}

/**
 * Daily Rhythm reminders, on this device: at an activity's reminder time, if it's scheduled today and not done,
 * show a note (and a system notification when the app is in the background and notifications are allowed).
 * Each activity reminds at most once a day.
 */
export function RhythmReminders() {
  const { ds, today } = useFinance();
  const habitsRef = useRef(ds.habits);
  habitsRef.current = ds.habits;
  const logsRef = useRef(ds.habit_logs);
  logsRef.current = ds.habit_logs;

  useEffect(() => {
    const check = () => {
      const habits = (habitsRef.current ?? []).filter((h) => h.reminder_time && !h.archived && isScheduled(h, today));
      if (!habits.length) return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const index = indexLogs(logsRef.current ?? []);
      const sent = readSent();
      let changed = false;
      for (const h of habits) {
        if (h.reminder_time! > hhmm || sent[h.id] === today) continue;
        const log = logFor(index, h.id, today);
        sent[h.id] = today;
        changed = true;
        if (log && log.status !== "pending") continue;
        // Long past its time (e.g. the app was closed all day, or the activity was just created): don't nag.
        const [rh, rm] = h.reminder_time!.split(":").map(Number);
        if (now.getHours() * 60 + now.getMinutes() - (rh * 60 + rm) > 180) continue;
        const title = `${h.icon ? `${h.icon} ` : ""}${h.name}`;
        toast(title, {
          description: "Time for this one — it's on today's Daily Rhythm list.",
          duration: 20_000,
          action: {
            label: "Mark done",
            onClick: () => {
              const ex = useStore.getState().ds?.habit_logs.find((l) => l.habit_id === h.id && l.date === today);
              const done = { status: "completed" as const, completed_at: new Date().toISOString() };
              void (ex ? useStore.getState().patch("habit_logs", ex.id, done) : useStore.getState().add("habit_logs", { habit_id: h.id, date: today, ...done })).catch(() => undefined);
            },
          },
        });
        if (document.visibilityState !== "visible" && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const body = "Not ticked yet today. Open Daily Rhythm to mark it done.";
          navigator.serviceWorker?.ready
            .then((reg) => reg.showNotification(title, { body, tag: `rhythm-${h.id}-${today}`, data: { url: withBase("/daily/?tab=rhythm") } } as NotificationOptions))
            .catch(() => new Notification(title, { body }));
        }
      }
      if (changed) {
        for (const k of Object.keys(sent)) if (sent[k] < today) delete sent[k];
        writeSent(sent);
      }
    };
    check();
    const t = window.setInterval(check, 30_000);
    return () => window.clearInterval(t);
  }, [today]);
  return null;
}
