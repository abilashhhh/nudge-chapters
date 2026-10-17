"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { useFinance } from "@/lib/finance";
import { newId } from "@/lib/data/repo";
import { useStore } from "@/lib/store";
import { LESSON_BY_ID } from "@/lib/training/content";
import {
  activeDays, dayStats, nextAttemptNo, recommendedDifficulty, streak, topicStats, trainingLevel, totalXp, xpForAnswer, XP,
  type AnswerValue, type Grade, type TrainingData,
} from "@/lib/training/engine";
import type { Question } from "@/lib/training/types";
import type { TrainingAttempt, TrainingMode, TrainingSession } from "@/lib/types";

/** Set when the server doesn't have the Trading Training tables yet (its migration hasn't been run). */
export const useTrainingStatus = create<{ needsUpdate: boolean; set(v: boolean): void }>((set) => ({ needsUpdate: false, set: (v) => set({ needsUpdate: v }) }));

function missingTable(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e).toLowerCase();
  return m.includes("training_") && (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find"));
}

/** One save at a time per key, so a double tap or a retry can't race itself. */
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
  queues.set(key, next);
  void next.finally(() => queues.get(key) === next && queues.delete(key));
  return next;
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (missingTable(e)) useTrainingStatus.getState().set(true);
    throw e;
  }
}

/** Everything the screens show, computed once per change of the records. */
export function useTraining() {
  const { ds, today } = useFinance();
  const data: TrainingData = useMemo(
    () => ({ sessions: ds.training_sessions ?? [], attempts: ds.training_attempts ?? [], lessons: ds.training_lessons ?? [] }),
    [ds.training_sessions, ds.training_attempts, ds.training_lessons],
  );
  return useMemo(() => {
    const stats = topicStats(data.attempts);
    const level = trainingLevel(data.lessons, stats);
    return {
      data,
      today,
      stats,
      level,
      streak: streak(activeDays(data), today),
      todayStats: dayStats(data, today),
      xp: totalXp(data),
      difficulty: recommendedDifficulty(data.attempts),
      completed: new Set(data.lessons.filter((l) => l.status === "completed").map((l) => l.lesson_id)),
    };
  }, [data, today]);
}

/** A sitting in progress. Saved on its first answer, so opening and leaving a quiz leaves no trace. */
export interface LiveSession {
  id: string;
  mode: TrainingMode;
  lessonId?: string | null;
  saved: boolean;
  startedAt: string;
}

export function newSession(mode: TrainingMode, lessonId?: string | null): LiveSession {
  return { id: newId(), mode, lessonId: lessonId ?? null, saved: false, startedAt: new Date().toISOString() };
}

export function useTrainingActions() {
  const { today } = useFinance();
  const store = useStore.getState;

  async function ensureSession(s: LiveSession): Promise<void> {
    if (s.saved || store().ds?.training_sessions.some((x) => x.id === s.id)) {
      s.saved = true;
      return;
    }
    await guarded(() => store().add("training_sessions", { id: s.id, mode: s.mode, lesson_id: s.lessonId ?? null, day: today, started_at: s.startedAt, bonus_xp: 0 } as Partial<TrainingSession>));
    s.saved = true;
  }

  /**
   * Save one answer. The first answer to a question in a sitting is final: answering again (double tap, retry)
   * returns the saved one instead of adding XP twice.
   */
  async function recordAnswer(s: LiveSession, q: Question, answer: AnswerValue, g: Grade, timeMs: number): Promise<TrainingAttempt> {
    return serial(`${s.id}|${q.id}`, async () => {
      await serial(`session|${s.id}`, () => ensureSession(s));
      const existing = store().ds?.training_attempts.find((a) => a.session_id === s.id && a.question_id === q.id);
      if (existing) return existing;
      const attempts = store().ds?.training_attempts ?? [];
      const attempt_no = nextAttemptNo(attempts, q.id);
      const xp = xpForAnswer(q.difficulty, g.score, attempt_no, s.mode);
      return guarded(() =>
        store().add("training_attempts", {
          session_id: s.id,
          question_id: q.id,
          mode: s.mode,
          topic: q.topic,
          difficulty: q.difficulty,
          answer,
          correct: g.correct,
          score: g.score,
          reasoning_score: g.reasoningScore ?? null,
          attempt_no,
          time_ms: Math.max(0, Math.min(86_400_000, Math.round(timeMs))),
          xp,
          day: today,
        } as Partial<TrainingAttempt>),
      );
    });
  }

  /** Close a sitting; daily challenges and revision rounds earn their bonus here (once). */
  async function finishSession(s: LiveSession): Promise<number> {
    if (!s.saved) return 0;
    return serial(`session|${s.id}`, async () => {
      const row = store().ds?.training_sessions.find((x) => x.id === s.id);
      if (!row || row.finished_at) return 0;
      const bonus = s.mode === "daily" ? XP.dailyChallenge : s.mode === "revision" ? XP.revisionRound : 0;
      await guarded(() => store().patch("training_sessions", s.id, { finished_at: new Date().toISOString(), bonus_xp: bonus }));
      return bonus;
    });
  }

  async function openLesson(lessonId: string) {
    if (!LESSON_BY_ID[lessonId]) return;
    await serial(`lesson|${lessonId}`, async () => {
      const ex = store().ds?.training_lessons.find((l) => l.lesson_id === lessonId);
      const now = new Date().toISOString();
      if (ex) await guarded(() => store().patch("training_lessons", ex.id, { last_opened_at: now }));
      else await guarded(() => store().add("training_lessons", { lesson_id: lessonId, status: "started", last_opened_at: now, time_spent_s: 0 }));
    }).catch(() => undefined);
  }

  /** Mark a lesson finished. Finishing it again only adds reading time — the 25 XP counts once. */
  async function completeLesson(lessonId: string, seconds: number): Promise<boolean> {
    return serial(`lesson|${lessonId}`, async () => {
      const ex = store().ds?.training_lessons.find((l) => l.lesson_id === lessonId);
      const now = new Date().toISOString();
      const secs = Math.max(0, Math.min(7200, Math.round(seconds)));
      if (ex?.status === "completed") {
        await guarded(() => store().patch("training_lessons", ex.id, { last_opened_at: now, time_spent_s: ex.time_spent_s + secs }));
        return false;
      }
      if (ex) await guarded(() => store().patch("training_lessons", ex.id, { status: "completed", completed_on: today, last_opened_at: now, time_spent_s: ex.time_spent_s + secs }));
      else await guarded(() => store().add("training_lessons", { lesson_id: lessonId, status: "completed", completed_on: today, last_opened_at: now, time_spent_s: secs }));
      return true;
    });
  }

  /** Start fresh: removes every Trading Training record (sessions take their answers with them). */
  async function resetAll() {
    const ds = store().ds;
    if (!ds) return;
    for (const s of ds.training_sessions) await store().remove("training_sessions", s.id);
    for (const l of ds.training_lessons) await store().remove("training_lessons", l.id);
    await store().load();
  }

  return { recordAnswer, finishSession, openLesson, completeLesson, resetAll };
}
