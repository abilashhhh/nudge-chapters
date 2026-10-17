// Trading Training engine: grading, XP, streaks, mastery, adaptive picks, achievements and analytics.
// Everything is worked out from the stored sessions, answers and lesson rows; nothing here is stored itself.

import { addDays, diffDays } from "../dates";
import type { ISODate, TrainingAttempt, TrainingLesson, TrainingMode, TrainingSession } from "../types";
import { classifyMove, hashSeed, shuffle, type MoveResult } from "./candles";
import { LESSONS, LESSON_BY_ID, PATTERN_TOPICS, POOLS, QUESTION_BY_ID, QUESTIONS, TOPIC_BY_ID } from "./content";
import type { Difficulty, PredictChoice, PredictScenario, Question } from "./types";

// ---------------------------------------------------------------------------
// Answers and grading
// ---------------------------------------------------------------------------

export interface PredictAnswer {
  choice: PredictChoice;
  signals: string[];
  note?: string;
}

/** What each question type takes as an answer. match: for each left item, the index of the chosen right item. */
export type AnswerValue = string | string[] | boolean | number | number[] | PredictAnswer;

export interface Grade {
  correct: boolean;
  /** 0–1. */
  score: number;
  /** Predictions: how good the given reasons were (0–1), kept apart from direction. */
  reasoningScore?: number;
  prediction?: PredictionGrade;
}

export interface PredictionGrade {
  move: MoveResult;
  accepted: PredictChoice[];
  directionCorrect: boolean;
  reasoningScore: number;
  validPicked: string[];
  invalidPicked: string[];
  missed: string[];
}

/** Direction is worth 70% of a prediction's score; the reasons you give, 30%. A bare guess tops out at 70%. */
export const PREDICTION_WEIGHTS = { direction: 0.7, reasoning: 0.3 };

export function acceptedOutcomes(s: PredictScenario): { move: MoveResult; accepted: PredictChoice[] } {
  const move = classifyMove(s.candles, s.visible, s.horizon, s.threshold);
  return { move, accepted: s.ambiguous ? [move.direction, "uncertain"] : [move.direction] };
}

export function gradePrediction(s: PredictScenario, a: PredictAnswer): PredictionGrade {
  const { move, accepted } = acceptedOutcomes(s);
  const valid = s.signals.filter((x) => x.valid).map((x) => x.id);
  const picked = new Set(a.signals);
  const validPicked = valid.filter((id) => picked.has(id));
  const invalidPicked = s.signals.filter((x) => !x.valid && picked.has(x.id)).map((x) => x.id);
  const reasoningScore = valid.length ? Math.max(0, Math.min(1, (validPicked.length - invalidPicked.length) / valid.length)) : invalidPicked.length ? 0 : 1;
  return { move, accepted, directionCorrect: accepted.includes(a.choice), reasoningScore: round2(reasoningScore), validPicked, invalidPicked, missed: valid.filter((id) => !picked.has(id)) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function grade(q: Question, answer: AnswerValue): Grade {
  switch (q.type) {
    case "single":
    case "pattern":
    case "chart":
    case "level": {
      const ok = answer === q.answer;
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case "multi":
    case "errors": {
      const picked = Array.isArray(answer) ? (answer as string[]) : [];
      const hits = picked.filter((x) => q.answer.includes(x)).length;
      const wrong = picked.length - hits;
      const ok = sameSet(picked, q.answer);
      return { correct: ok, score: ok ? 1 : round2(Math.max(0, (hits - wrong) / q.answer.length)) };
    }
    case "truefalse": {
      const ok = answer === q.answer;
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case "match": {
      const picks = Array.isArray(answer) ? (answer as number[]) : [];
      const right = q.pairs.filter((_, i) => picks[i] === i).length;
      return { correct: right === q.pairs.length, score: round2(right / q.pairs.length) };
    }
    case "order": {
      const order = Array.isArray(answer) ? (answer as string[]) : [];
      const right = q.answer.filter((id, i) => order[i] === id).length;
      return { correct: right === q.answer.length, score: round2(right / q.answer.length) };
    }
    case "calc": {
      const n = typeof answer === "number" ? answer : Number(answer);
      const ok = Number.isFinite(n) && Math.abs(n - q.answer) <= q.tolerance + 1e-9;
      return { correct: ok, score: ok ? 1 : 0 };
    }
    case "predict": {
      const p = gradePrediction(q.scenario, answer as PredictAnswer);
      const score = round2(PREDICTION_WEIGHTS.direction * (p.directionCorrect ? 1 : 0) + PREDICTION_WEIGHTS.reasoning * p.reasoningScore);
      return { correct: p.directionCorrect, score, reasoningScore: p.reasoningScore, prediction: p };
    }
  }
}

// ---------------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------------

export const XP = {
  /** A fully correct answer, by difficulty. */
  question: { 1: 10, 2: 20, 3: 30 } as Record<Difficulty, number>,
  lesson: 25,
  dailyChallenge: 20,
  revisionRound: 15,
  /** Share of XP for the 1st, 2nd and later tries at the same question. */
  repeat: [1, 0.5, 0],
  /** Challenge mode pays half as much again for its harder, timed questions. */
  challenge: 1.5,
};

export function repeatFactor(attemptNo: number): number {
  return XP.repeat[Math.min(attemptNo, XP.repeat.length) - 1];
}

/** XP for one answer: base for its difficulty × the score × the repeat factor (× the challenge bonus). */
export function xpForAnswer(difficulty: Difficulty, score: number, attemptNo: number, mode: TrainingMode): number {
  const raw = XP.question[difficulty] * score * repeatFactor(attemptNo) * (mode === "challenge" ? XP.challenge : 1);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/** The how-manyth time this question is being answered. */
export function nextAttemptNo(attempts: TrainingAttempt[], questionId: string): number {
  return attempts.filter((a) => a.question_id === questionId).length + 1;
}

// ---------------------------------------------------------------------------
// Days, streaks
// ---------------------------------------------------------------------------

export interface TrainingData {
  sessions: TrainingSession[];
  attempts: TrainingAttempt[];
  lessons: TrainingLesson[];
}

export function activeDays(d: TrainingData): Set<ISODate> {
  const s = new Set<ISODate>();
  for (const a of d.attempts) s.add(a.day);
  for (const l of d.lessons) if (l.status === "completed" && l.completed_on) s.add(l.completed_on);
  return s;
}

export interface Streak {
  current: number;
  best: number;
  totalDays: number;
  /** Missed days you can skip without losing the streak (earn one per 7 active days, keep up to 2). */
  freezes: number;
  /** Days a freeze covered. */
  frozen: ISODate[];
  activeToday: boolean;
  /** Active days in the last 7 (including today). */
  lastWeek: number;
}

export const MAX_FREEZES = 2;

/**
 * A forgiving streak: a missed day uses a freeze instead of resetting (you start with one and earn another every
 * 7 active days, up to 2). Today not being done yet never breaks it. Total learning days never go down.
 */
export function streak(days: Set<ISODate>, today: ISODate): Streak {
  const sorted = [...days].filter((d) => d <= today).sort();
  const lastWeek = sorted.filter((d) => diffDays(d, today) < 7).length;
  if (!sorted.length) return { current: 0, best: 0, totalDays: 0, freezes: 1, frozen: [], activeToday: false, lastWeek };
  let cur = 0;
  let best = 0;
  let freezes = 1;
  let run = 0;
  const frozen: ISODate[] = [];
  for (let d = sorted[0]; d <= today; d = addDays(d, 1)) {
    if (days.has(d)) {
      cur++;
      run++;
      if (run === 7) {
        freezes = Math.min(MAX_FREEZES, freezes + 1);
        run = 0;
      }
    } else if (d !== today) {
      if (freezes > 0 && cur > 0) {
        freezes--;
        frozen.push(d);
      } else {
        cur = 0;
        run = 0;
      }
    }
    best = Math.max(best, cur);
  }
  return { current: cur, best, totalDays: sorted.length, freezes, frozen, activeToday: days.has(today), lastWeek };
}

// ---------------------------------------------------------------------------
// Topics and mastery
// ---------------------------------------------------------------------------

/** A topic is mastered after at least this many answers with at least this accuracy over the most recent 10. */
export const MASTERY = { minAttempts: 5, recentWindow: 10, accuracy: 0.8, weakBelow: 0.6, weakMinAttempts: 3 };

export interface TopicStat {
  topic: string;
  attempts: number;
  correct: number;
  accuracy: number;
  firstAttempts: number;
  firstCorrect: number;
  firstAccuracy: number | null;
  recentAccuracy: number;
  mastered: boolean;
  weak: boolean;
  lastDay: ISODate;
}

const byTime = (a: TrainingAttempt, b: TrainingAttempt) => (a.created_at ?? a.day).localeCompare(b.created_at ?? b.day) || a.day.localeCompare(b.day);

export function topicStats(attempts: TrainingAttempt[]): Map<string, TopicStat> {
  const groups = new Map<string, TrainingAttempt[]>();
  for (const a of [...attempts].sort(byTime)) groups.set(a.topic, [...(groups.get(a.topic) ?? []), a]);
  const out = new Map<string, TopicStat>();
  for (const [topic, list] of groups) {
    const correct = list.filter((a) => a.correct).length;
    const first = list.filter((a) => a.attempt_no === 1);
    const recent = list.slice(-MASTERY.recentWindow);
    const recentAccuracy = recent.filter((a) => a.correct).length / recent.length;
    out.set(topic, {
      topic,
      attempts: list.length,
      correct,
      accuracy: correct / list.length,
      firstAttempts: first.length,
      firstCorrect: first.filter((a) => a.correct).length,
      firstAccuracy: first.length ? first.filter((a) => a.correct).length / first.length : null,
      recentAccuracy,
      mastered: list.length >= MASTERY.minAttempts && recentAccuracy >= MASTERY.accuracy,
      weak: list.length >= MASTERY.weakMinAttempts && recentAccuracy < MASTERY.weakBelow,
      lastDay: list[list.length - 1].day,
    });
  }
  return out;
}

export function patternsMastered(stats: Map<string, TopicStat>): number {
  return PATTERN_TOPICS.filter((t) => stats.get(t.id)?.mastered).length;
}

// ---------------------------------------------------------------------------
// Level and difficulty (adaptive)
// ---------------------------------------------------------------------------

export const LEVEL_TITLES = ["", "Market basics", "Candle reader", "Pattern spotter", "Chart analyst", "Technical trader"];

/**
 * Your level: the next level unlocks only when you've finished most of the current one's lessons AND shown you
 * understand it (recent accuracy on its topics). Finishing lessons alone never moves you up.
 */
export function trainingLevel(lessons: TrainingLesson[], stats: Map<string, TopicStat>): { level: number; progress: number; blocker: string | null } {
  const done = new Set(lessons.filter((l) => l.status === "completed").map((l) => l.lesson_id));
  let level = 1;
  for (let L = 1; L <= 4; L++) {
    const ls = LESSONS.filter((l) => l.level === L);
    const share = ls.filter((l) => done.has(l.id)).length / ls.length;
    const topics = ls.map((l) => stats.get(l.topic)).filter((s): s is TopicStat => !!s);
    const tried = topics.length / ls.length;
    const acc = topics.length ? topics.reduce((s, t) => s + t.recentAccuracy, 0) / topics.length : 0;
    if (share >= 0.7 && tried >= 0.5 && acc >= 0.7) level = L + 1;
    else {
      const progress = Math.min(1, (Math.min(share / 0.7, 1) + Math.min(tried / 0.5, 1) + Math.min(acc / 0.7, 1)) / 3);
      const blocker = share < 0.7 ? `Finish ${Math.ceil(0.7 * ls.length) - ls.filter((l) => done.has(l.id)).length} more Level ${L} lessons` : tried < 0.5 ? `Practise more Level ${L} topics` : `Reach 70% accuracy on Level ${L} topics (now ${Math.round(acc * 100)}%)`;
      return { level, progress, blocker };
    }
  }
  return { level, progress: 1, blocker: null };
}

/** Step up after 10+ recent answers at ≥80% on the current difficulty; step down below 50%. */
export function recommendedDifficulty(attempts: TrainingAttempt[]): Difficulty {
  const sorted = [...attempts].sort(byTime);
  const recent = (d: Difficulty) => sorted.filter((a) => a.difficulty === d).slice(-20);
  const acc = (xs: TrainingAttempt[]) => (xs.length ? xs.filter((a) => a.correct).length / xs.length : 0);
  let d: Difficulty = 1;
  if (recent(1).length >= 10 && acc(recent(1)) >= 0.8) d = 2;
  if (d === 2 && recent(2).length >= 10 && acc(recent(2)) >= 0.8) d = 3;
  const last = recent(d).slice(-10);
  if (d > 1 && last.length >= 6 && acc(last) < 0.5) d = (d - 1) as Difficulty;
  return d;
}

// ---------------------------------------------------------------------------
// Revision, mistakes, confusions
// ---------------------------------------------------------------------------

/**
 * Questions to revisit: anything whose latest answer was wrong (due now), and anything you got right only once
 * since missing it, three or more days ago (so it gets a second check before it counts as learned).
 */
export function revisionQueue(attempts: TrainingAttempt[], today: ISODate): string[] {
  const byQ = new Map<string, TrainingAttempt[]>();
  for (const a of [...attempts].sort(byTime)) byQ.set(a.question_id, [...(byQ.get(a.question_id) ?? []), a]);
  const due: { id: string; at: string }[] = [];
  for (const [id, list] of byQ) {
    if (!QUESTION_BY_ID[id]) continue;
    const last = list[list.length - 1];
    const lastMiss = list.map((a) => a.correct).lastIndexOf(false);
    if (!last.correct) due.push({ id, at: last.created_at ?? last.day });
    else if (lastMiss >= 0 && list.length - 1 - lastMiss === 1 && diffDays(last.day, today) >= 3) due.push({ id, at: last.created_at ?? last.day });
  }
  return due.sort((a, b) => b.at.localeCompare(a.at)).map((d) => d.id);
}

/** Your wrong answers, newest first (one per question: the latest). */
export function mistakes(attempts: TrainingAttempt[]): TrainingAttempt[] {
  const seen = new Set<string>();
  return [...attempts]
    .sort(byTime)
    .reverse()
    .filter((a) => {
      if (a.correct || seen.has(a.question_id)) return false;
      seen.add(a.question_id);
      return true;
    });
}

/** Pattern pairs you mix up: "you called a hanging man a hammer 3 times". */
export function confusions(attempts: TrainingAttempt[]): { actual: string; said: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of attempts) {
    const q = QUESTION_BY_ID[a.question_id];
    if (!q || q.type !== "pattern" || a.correct || typeof a.answer !== "string") continue;
    const key = `${q.answer}|${a.answer}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([k, count]) => {
      const [actual, said] = k.split("|");
      return { actual, said, count };
    })
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Picking questions
// ---------------------------------------------------------------------------

export type PracticeMode = "quiz" | "pattern" | "predict" | "analysis" | "revision" | "challenge";

export const SESSION_SIZE: Record<PracticeMode, number> = { quiz: 8, pattern: 8, predict: 5, analysis: 6, revision: 8, challenge: 8 };
/** Seconds per question in Challenge mode. */
export const CHALLENGE_SECONDS = 45;

/**
 * A set of questions for a practice round. Prefers questions you haven't seen and the difficulty you're ready for;
 * quick quizzes mix in up to a quarter from your revision queue (new material balanced with review).
 * `seed` makes the pick reproducible for the session.
 */
export function pickQuestions(mode: PracticeMode, opts: { seed: string; attempts: TrainingAttempt[]; today: ISODate; difficulty: Difficulty; topic?: string | null; level?: number; count?: number }): Question[] {
  const count = opts.count ?? SESSION_SIZE[mode];
  const seen = new Map<string, number>();
  for (const a of opts.attempts) seen.set(a.question_id, (seen.get(a.question_id) ?? 0) + 1);
  const revision = revisionQueue(opts.attempts, opts.today);
  if (mode === "revision") return revision.slice(0, count).map((id) => QUESTION_BY_ID[id]);
  let pool: Question[] = mode === "quiz" ? POOLS.quiz : POOLS[mode];
  if (opts.topic) pool = QUESTIONS.filter((q) => q.topic === opts.topic);
  if (mode === "quiz" && !opts.topic && opts.level) pool = pool.filter((q) => (TOPIC_BY_ID[q.topic]?.level ?? 1) <= opts.level!);
  const seed = hashSeed(opts.seed);
  const target = mode === "challenge" ? Math.max(2, opts.difficulty) : opts.difficulty;
  // Unseen first, then right difficulty, then least-seen; ties broken by the seeded shuffle.
  const ranked = shuffle(pool, seed)
    .map((q, i) => ({ q, i, rank: (seen.has(q.id) ? 100 : 0) + Math.abs(q.difficulty - target) * 10 + Math.min(9, seen.get(q.id) ?? 0) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.q);
  if (mode !== "quiz" || opts.topic) return ranked.slice(0, count);
  const review = revision.slice(0, Math.floor(count / 4)).map((id) => QUESTION_BY_ID[id]);
  const fresh = ranked.filter((q) => !review.includes(q)).slice(0, count - review.length);
  return shuffle([...fresh, ...review], seed + 1);
}

/** Today's challenge: the same chart question for everyone on that date, beginner or intermediate. */
export function dailyChallenge(day: ISODate): Question {
  const pool = [...POOLS.predict.filter((q) => q.difficulty <= 2), ...POOLS.pattern.filter((q) => q.type === "pattern" && q.difficulty <= 2)];
  return pool[hashSeed(`daily:${day}`) % pool.length];
}

// ---------------------------------------------------------------------------
// Daily scoreboard
// ---------------------------------------------------------------------------

export interface DayStats {
  day: ISODate;
  attempted: number;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  firstAttempted: number;
  firstCorrect: number;
  predictions: number;
  predictionsRight: number;
  lessons: number;
  xp: number;
  /** Minutes spent: answering plus reading lessons finished that day. */
  minutes: number;
  challengeDone: boolean;
  best: string | null;
  weakest: string | null;
}

const isPrediction = (a: TrainingAttempt) => QUESTION_BY_ID[a.question_id]?.type === "predict";

export function dayStats(d: TrainingData, day: ISODate): DayStats {
  const at = d.attempts.filter((a) => a.day === day);
  const ls = d.lessons.filter((l) => l.status === "completed" && l.completed_on === day);
  const bonus = d.sessions.filter((s) => s.day === day).reduce((t, s) => t + (s.bonus_xp ?? 0), 0);
  const correct = at.filter((a) => a.correct).length;
  const first = at.filter((a) => a.attempt_no === 1);
  const preds = at.filter(isPrediction);
  const topics = topicStats(at);
  const ranked = [...topics.values()].filter((t) => t.attempts >= 2).sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts);
  const best = ranked[0] && ranked[0].accuracy > 0 ? ranked[0].topic : null;
  const worst = ranked.at(-1);
  return {
    day,
    attempted: at.length,
    correct,
    incorrect: at.length - correct,
    accuracy: at.length ? correct / at.length : null,
    firstAttempted: first.length,
    firstCorrect: first.filter((a) => a.correct).length,
    predictions: preds.length,
    predictionsRight: preds.filter((a) => a.correct).length,
    lessons: ls.length,
    xp: at.reduce((t, a) => t + a.xp, 0) + bonus + ls.length * XP.lesson,
    minutes: Math.round((at.reduce((t, a) => t + a.time_ms, 0) / 1000 + ls.reduce((t, l) => t + l.time_spent_s, 0)) / 60),
    challengeDone: d.sessions.some((s) => s.day === day && s.mode === "daily" && !!s.finished_at),
    best,
    weakest: worst && worst.topic !== best && worst.accuracy < 1 ? worst.topic : null,
  };
}

/** Today's training is complete with the daily challenge plus a lesson or 10 answers. */
export const DAILY_GOAL = { questions: 10, lessons: 1 };
export function dailyGoal(s: DayStats): { done: boolean; steps: { label: string; done: boolean }[] } {
  const steps = [
    { label: "Daily challenge", done: s.challengeDone },
    { label: `Finish a lesson or answer ${DAILY_GOAL.questions} questions`, done: s.lessons >= DAILY_GOAL.lessons || s.attempted >= DAILY_GOAL.questions },
  ];
  return { done: steps.every((x) => x.done), steps };
}

export function totalXp(d: TrainingData): number {
  return d.attempts.reduce((t, a) => t + a.xp, 0) + d.sessions.reduce((t, s) => t + (s.bonus_xp ?? 0), 0) + d.lessons.filter((l) => l.status === "completed").length * XP.lesson;
}

/** The lesson to continue: the one you opened most recently and didn't finish, else the first unfinished one at your level. */
export function nextLesson(lessons: TrainingLesson[], level: number): string | null {
  const done = new Set(lessons.filter((l) => l.status === "completed").map((l) => l.lesson_id));
  const open = lessons.filter((l) => l.status === "started" && LESSON_BY_ID[l.lesson_id]).sort((a, b) => b.last_opened_at.localeCompare(a.last_opened_at))[0];
  if (open) return open.lesson_id;
  return LESSONS.find((l) => l.level <= level && !done.has(l.id))?.id ?? LESSONS.find((l) => !done.has(l.id))?.id ?? null;
}

// ---------------------------------------------------------------------------
// Achievements (unlock dates replayed from history)
// ---------------------------------------------------------------------------

export interface AchievementDef {
  id: string;
  title: string;
  body: string;
  icon: string;
  test: (c: Cumulative) => boolean;
}

interface Cumulative {
  lessons: number;
  answers: number;
  correct: number;
  streak: number;
  patterns: number;
  perfect: number;
  revisions: number;
  predictionsRight: number;
  xp: number;
  /** Best week-over-week gain in accuracy, in points (needs 10+ answers in both weeks). */
  improvement: number;
  dailies: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-lesson", title: "First step", body: "Finish your first lesson", icon: "🎓", test: (c) => c.lessons >= 1 },
  { id: "lessons-10", title: "Bookworm", body: "Finish 10 lessons", icon: "📚", test: (c) => c.lessons >= 10 },
  { id: "lessons-25", title: "Halfway there", body: "Finish 25 lessons", icon: "🧭", test: (c) => c.lessons >= 25 },
  { id: "lessons-all", title: "Curriculum complete", body: `Finish all ${LESSONS.length} lessons`, icon: "🏛️", test: (c) => c.lessons >= LESSONS.length },
  { id: "answers-50", title: "Getting reps in", body: "Answer 50 questions", icon: "✍️", test: (c) => c.answers >= 50 },
  { id: "accuracy-80", title: "Sharp eye", body: "80% accuracy over at least 50 answers", icon: "🎯", test: (c) => c.answers >= 50 && c.correct / c.answers >= 0.8 },
  { id: "perfect", title: "Perfect round", body: "Get every question right in a round of 5 or more", icon: "💯", test: (c) => c.perfect >= 1 },
  { id: "perfect-5", title: "Flawless five", body: "Five perfect rounds", icon: "🏆", test: (c) => c.perfect >= 5 },
  { id: "streak-3", title: "On a roll", body: "3-day learning streak", icon: "🔥", test: (c) => c.streak >= 3 },
  { id: "streak-7", title: "A full week", body: "7-day learning streak", icon: "📅", test: (c) => c.streak >= 7 },
  { id: "streak-30", title: "Habit formed", body: "30-day learning streak", icon: "🌳", test: (c) => c.streak >= 30 },
  { id: "patterns-5", title: "Pattern spotter", body: "Master 5 candlestick patterns", icon: "🕯️", test: (c) => c.patterns >= 5 },
  { id: "patterns-all", title: "Pattern master", body: `Master all ${PATTERN_TOPICS.length} patterns`, icon: "👑", test: (c) => c.patterns >= PATTERN_TOPICS.length },
  { id: "revision-1", title: "Second look", body: "Finish a revision round", icon: "🔁", test: (c) => c.revisions >= 1 },
  { id: "revision-10", title: "Learns from mistakes", body: "Finish 10 revision rounds", icon: "🧠", test: (c) => c.revisions >= 10 },
  { id: "predict-10", title: "Chart reader", body: "10 correct predictions", icon: "🔮", test: (c) => c.predictionsRight >= 10 },
  { id: "improve-15", title: "Levelling up", body: "Improve weekly accuracy by 15 points", icon: "📈", test: (c) => c.improvement >= 15 },
  { id: "daily-7", title: "Daily devotee", body: "Complete 7 daily challenges", icon: "☀️", test: (c) => c.dailies >= 7 },
  { id: "xp-1000", title: "1,000 XP", body: "Earn 1,000 XP", icon: "⚡", test: (c) => c.xp >= 1000 },
];

export interface Unlocked {
  def: AchievementDef;
  on: ISODate | null;
}

/** Every achievement with the day it was earned (null = not yet), replayed day by day from your history. */
export function achievements(d: TrainingData, today: ISODate): Unlocked[] {
  const days = [...activeDays(d)].filter((x) => x <= today).sort();
  const on = new Map<string, ISODate>();
  const finished = d.sessions.filter((s) => s.finished_at);
  for (const day of days) {
    const upTo = <T extends { day?: ISODate }>(xs: T[]) => xs.filter((x) => (x.day ?? "") <= day);
    const at = upTo(d.attempts);
    const ses = upTo(finished);
    const ls = d.lessons.filter((l) => l.status === "completed" && l.completed_on && l.completed_on <= day);
    const st = topicStats(at);
    const perfect = ses.filter((s) => {
      const xs = at.filter((a) => a.session_id === s.id);
      return xs.length >= 5 && xs.every((a) => a.correct);
    }).length;
    const week = (end: ISODate) => at.filter((a) => a.day <= end && diffDays(a.day, end) < 7);
    let improvement = 0;
    for (let k = 0; k < 8; k++) {
      const end = addDays(day, -7 * k);
      const a = week(end);
      const b = week(addDays(end, -7));
      if (a.length >= 10 && b.length >= 10) improvement = Math.max(improvement, Math.round((a.filter((x) => x.correct).length / a.length - b.filter((x) => x.correct).length / b.length) * 100));
    }
    const c: Cumulative = {
      lessons: ls.length,
      answers: at.length,
      correct: at.filter((a) => a.correct).length,
      streak: streak(new Set(days.filter((x) => x <= day)), day).current,
      patterns: patternsMastered(st),
      perfect,
      revisions: ses.filter((s) => s.mode === "revision").length,
      predictionsRight: at.filter((a) => a.correct && isPrediction(a)).length,
      xp: totalXp({ attempts: at, sessions: ses, lessons: ls }),
      improvement,
      dailies: ses.filter((s) => s.mode === "daily").length,
    };
    for (const a of ACHIEVEMENTS) if (!on.has(a.id) && a.test(c)) on.set(a.id, day);
  }
  return ACHIEVEMENTS.map((def) => ({ def, on: on.get(def.id) ?? null }));
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface AnalyticsFilter {
  from: ISODate;
  to: ISODate;
  topic?: string | null;
  mode?: TrainingMode | null;
  difficulty?: Difficulty | null;
}

export function filterAttempts(attempts: TrainingAttempt[], f: AnalyticsFilter): TrainingAttempt[] {
  return attempts.filter((a) => a.day >= f.from && a.day <= f.to && (!f.topic || a.topic === f.topic) && (!f.mode || a.mode === f.mode) && (!f.difficulty || a.difficulty === f.difficulty));
}

export interface SeriesRow {
  day: ISODate;
  xp: number;
  attempted: number;
  correct: number;
  accuracy: number | null;
  predictions: number;
  predictionsRight: number;
  lessons: number;
}

/** One row per day in the range (days with nothing show zeros; accuracy stays empty rather than 0%). */
export function dailySeries(d: TrainingData, f: AnalyticsFilter): SeriesRow[] {
  const at = filterAttempts(d.attempts, f);
  const plain = !f.topic && !f.mode && !f.difficulty;
  const rows: SeriesRow[] = [];
  for (let day = f.from; day <= f.to; day = addDays(day, 1)) {
    const xs = at.filter((a) => a.day === day);
    const ls = plain ? d.lessons.filter((l) => l.status === "completed" && l.completed_on === day).length : 0;
    const bonus = plain ? d.sessions.filter((s) => s.day === day).reduce((t, s) => t + (s.bonus_xp ?? 0), 0) : 0;
    const correct = xs.filter((a) => a.correct).length;
    const preds = xs.filter(isPrediction);
    rows.push({
      day,
      xp: xs.reduce((t, a) => t + a.xp, 0) + ls * XP.lesson + bonus,
      attempted: xs.length,
      correct,
      accuracy: xs.length ? correct / xs.length : null,
      predictions: preds.length,
      predictionsRight: preds.filter((a) => a.correct).length,
      lessons: ls,
    });
  }
  return rows;
}

/** Group daily rows into weeks (starting Monday) or months. */
export function groupSeries(rows: SeriesRow[], by: "week" | "month"): (SeriesRow & { label: string })[] {
  const key = (day: ISODate) => {
    if (by === "month") return day.slice(0, 7);
    const wd = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
    return addDays(day, -wd);
  };
  const map = new Map<string, SeriesRow & { label: string }>();
  for (const r of rows) {
    const k = key(r.day);
    const g = map.get(k) ?? { day: k, label: k, xp: 0, attempted: 0, correct: 0, accuracy: null, predictions: 0, predictionsRight: 0, lessons: 0 };
    g.xp += r.xp;
    g.attempted += r.attempted;
    g.correct += r.correct;
    g.predictions += r.predictions;
    g.predictionsRight += r.predictionsRight;
    g.lessons += r.lessons;
    g.accuracy = g.attempted ? g.correct / g.attempted : null;
    map.set(k, g);
  }
  return [...map.values()];
}

export function accuracyBy<K extends string | number>(attempts: TrainingAttempt[], key: (a: TrainingAttempt) => K): { key: K; attempts: number; correct: number; accuracy: number }[] {
  const m = new Map<K, { attempts: number; correct: number }>();
  for (const a of attempts) {
    const k = key(a);
    const g = m.get(k) ?? { attempts: 0, correct: 0 };
    g.attempts++;
    if (a.correct) g.correct++;
    m.set(k, g);
  }
  return [...m.entries()].map(([k, g]) => ({ key: k, ...g, accuracy: g.correct / g.attempts }));
}

/** First tries vs repeat tries. */
export function firstVsRepeat(attempts: TrainingAttempt[]) {
  const f = attempts.filter((a) => a.attempt_no === 1);
  const r = attempts.filter((a) => a.attempt_no > 1);
  const acc = (xs: TrainingAttempt[]) => (xs.length ? xs.filter((a) => a.correct).length / xs.length : null);
  return { first: { attempts: f.length, accuracy: acc(f) }, repeat: { attempts: r.length, accuracy: acc(r) } };
}

/** Topics you miss most (at least 2 misses), worst first. */
export function mostMissed(attempts: TrainingAttempt[], limit = 6): { topic: string; misses: number; attempts: number; accuracy: number }[] {
  return accuracyBy(attempts, (a) => a.topic)
    .map((g) => ({ topic: g.key, misses: g.attempts - g.correct, attempts: g.attempts, accuracy: g.accuracy }))
    .filter((g) => g.misses >= 2)
    .sort((a, b) => b.misses - a.misses || a.accuracy - b.accuracy)
    .slice(0, limit);
}
