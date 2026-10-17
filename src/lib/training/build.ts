// Small helpers for writing lessons and questions compactly.

import type { ChartSpec, Difficulty, Lesson, Option, Question } from "./types";

/** A lesson as written: its knowledge-check questions sit inside it. */
export type LessonDef = Omit<Lesson, "quiz"> & { questions: Question[] };

type Opts = [id: string, label: string, why?: string][];
const options = (o: Opts): Option[] => o.map(([id, label, why]) => ({ id, label, why }));

interface Common {
  hint?: string;
  chart?: ChartSpec;
}

export function single(id: string, topic: string, difficulty: Difficulty, prompt: string, opts: Opts, answer: string, explanation: string, extra: Common & { type?: "single" | "pattern" | "chart" | "level" } = {}): Question {
  const { type = extra.chart ? "chart" : "single", ...rest } = extra;
  return { id, topic, difficulty, prompt, type, options: options(opts), answer, explanation, ...rest };
}

export function multi(id: string, topic: string, difficulty: Difficulty, prompt: string, opts: Opts, answer: string[], explanation: string, extra: Common & { type?: "multi" | "errors" } = {}): Question {
  const { type = "multi", ...rest } = extra;
  return { id, topic, difficulty, prompt, type, options: options(opts), answer, explanation, ...rest };
}

export function tf(id: string, topic: string, difficulty: Difficulty, prompt: string, answer: boolean, explanation: string, extra: Common = {}): Question {
  return { id, topic, difficulty, prompt, type: "truefalse", answer, explanation, ...extra };
}

export function calc(id: string, topic: string, difficulty: Difficulty, prompt: string, answer: number, tolerance: number, explanation: string, extra: Common & { unit?: string } = {}): Question {
  return { id, topic, difficulty, prompt, type: "calc", answer, tolerance, explanation, ...extra };
}

export function match(id: string, topic: string, difficulty: Difficulty, prompt: string, pairs: [string, string][], explanation: string, extra: Common = {}): Question {
  return { id, topic, difficulty, prompt, type: "match", pairs: pairs.map(([left, right]) => ({ left, right })), explanation, ...extra };
}
