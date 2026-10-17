"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export const TRAINING_PATH = "/trading-training";

export const TRAINING_TABS = ["home", "learn", "practice", "scores", "review"] as const;
export type TrainingTab = (typeof TRAINING_TABS)[number];

/** Where you are inside Trading Training, kept in the address so Back, refresh and links all work. */
export interface TrainingView {
  tab?: TrainingTab;
  /** An open lesson. */
  lesson?: string | null;
  /** A practice round: quiz, pattern, predict, analysis, revision, challenge or daily. */
  run?: string | null;
  topic?: string | null;
  /** A past round being reviewed. */
  session?: string | null;
}

export function trainingHref(v: TrainingView): string {
  const p = new URLSearchParams();
  if (v.tab && v.tab !== "home") p.set("tab", v.tab);
  for (const k of ["lesson", "run", "topic", "session"] as const) if (v[k]) p.set(k, v[k]!);
  const s = p.toString();
  return s ? `${TRAINING_PATH}?${s}` : TRAINING_PATH;
}

export function useTrainingView(): [TrainingView & { tab: TrainingTab }, (v: TrainingView) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("tab") as TrainingTab | null;
  const view = {
    tab: raw && TRAINING_TABS.includes(raw) ? raw : ("home" as TrainingTab),
    lesson: params.get("lesson"),
    run: params.get("run"),
    topic: params.get("topic"),
    session: params.get("session"),
  };
  const go = useCallback(
    (v: TrainingView) => {
      router.push(trainingHref(v), { scroll: false });
      if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    },
    [router],
  );
  return [view, go];
}
