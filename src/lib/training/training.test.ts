import { describe, expect, it } from "vitest";
import type { TrainingAttempt, TrainingLesson, TrainingSession } from "../types";
import { classifyMove, rsi, walk, shape, hashSeed } from "./candles";
import { LESSONS, LESSON_BY_ID, POOLS, QUESTIONS, QUESTION_BY_ID, TOPIC_BY_ID } from "./content";
import {
  achievements, dailyChallenge, dailyGoal, dailySeries, dayStats, firstVsRepeat, grade, gradePrediction, groupSeries, mostMissed, nextAttemptNo,
  nextLesson, pickQuestions, recommendedDifficulty, revisionQueue, streak, topicStats, totalXp, trainingLevel, xpForAnswer, XP, type AnswerValue,
} from "./engine";
import { SCENARIOS, SCENARIO_BY_ID } from "./scenarios";
import type { Question } from "./types";

const TODAY = "2026-10-17";

/** The answer that should score full marks for a question. */
function rightAnswer(q: Question): AnswerValue {
  switch (q.type) {
    case "single": case "pattern": case "chart": case "level": return q.answer;
    case "multi": case "errors": return q.answer;
    case "truefalse": return q.answer;
    case "match": return q.pairs.map((_, i) => i);
    case "order": return q.answer;
    case "calc": return q.answer;
    case "predict": {
      const m = classifyMove(q.scenario.candles, q.scenario.visible, q.scenario.horizon, q.scenario.threshold);
      return { choice: m.direction, signals: q.scenario.signals.filter((s) => s.valid).map((s) => s.id) };
    }
  }
}

let n = 0;
const attempt = (p: Partial<TrainingAttempt>): TrainingAttempt => ({
  id: `a${++n}`, session_id: "s1", question_id: "q", mode: "quiz", topic: "ohlc", difficulty: 1, answer: null, correct: true, score: 1, attempt_no: 1, time_ms: 10000, xp: 10, day: TODAY,
  created_at: `${p.day ?? TODAY}T10:00:${String(n % 60).padStart(2, "0")}Z`, ...p,
});
const lesson = (lesson_id: string, completed_on: string | null): TrainingLesson => ({ id: `l-${lesson_id}`, lesson_id, status: completed_on ? "completed" : "started", completed_on, last_opened_at: `${completed_on ?? TODAY}T09:00:00Z`, time_spent_s: 120 });
const session = (p: Partial<TrainingSession>): TrainingSession => ({ id: "s1", mode: "quiz", day: TODAY, started_at: `${TODAY}T10:00:00Z`, finished_at: `${TODAY}T10:05:00Z`, bonus_xp: 0, ...p });

describe("content", () => {
  it("has unique ids and every lesson's quiz exists", () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS) {
      expect(l.quiz.length).toBeGreaterThanOrEqual(3);
      for (const id of l.quiz) expect(QUESTION_BY_ID[id], id).toBeTruthy();
    }
  });

  it("covers the five levels and every pattern", () => {
    expect(new Set(LESSONS.map((l) => l.level))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(LESSONS.filter((l) => l.level === 3).length).toBe(19);
  });

  it("every lesson follows the standard format and has a visual", () => {
    for (const l of LESSONS) {
      const kinds = l.sections.map((s) => s.kind);
      expect(kinds, l.id).toContain("intro");
      expect(kinds, l.id).toContain("mistakes");
      expect(kinds, l.id).toContain("summary");
      expect(l.sections.some((s) => s.chart || s.anatomy || s.compare), l.id).toBe(true);
    }
  });

  it("every question's topic is known and its right answer grades as correct", () => {
    for (const q of QUESTIONS) {
      expect(TOPIC_BY_ID[q.topic], `${q.id} topic ${q.topic}`).toBeTruthy();
      const g = grade(q, rightAnswer(q));
      expect(g.correct, q.id).toBe(true);
      expect(g.score, q.id).toBe(1);
      if ("options" in q) {
        const ids = q.options.map((o) => o.id);
        expect(new Set(ids).size, q.id).toBe(ids.length);
        const answers = Array.isArray(q.answer) ? q.answer : [q.answer];
        for (const a of answers) expect(ids, q.id).toContain(a);
      }
    }
  });

  it("charts are the same every time (deterministic)", () => {
    expect(walk(5, 100, 1, [{ n: 10, drift: 0.3 }])).toEqual(walk(5, 100, 1, [{ n: 10, drift: 0.3 }]));
    // A pinned value: if the generator ever changes, stored answers would point at different charts.
    expect(walk(5, 100, 1, [{ n: 3, drift: 0.3 }]).map((c) => c.c)).toEqual([100.53, 100.33, 101.12]);
  });
});

describe("prediction scenarios", () => {
  it("every scenario's data gives the outcome its explanation describes", () => {
    for (const s of SCENARIOS) {
      const m = classifyMove(s.candles, s.visible, s.horizon, s.threshold);
      expect(m.direction, s.id).toBe(s.expected);
      expect(s.source).toBe("simulated");
      expect(s.candles.length).toBeGreaterThan(s.visible + s.horizon - 1);
      expect(s.signals.some((x) => x.valid) && s.signals.some((x) => !x.valid), s.id).toBe(true);
    }
  });

  it("the divergence scenario really has a higher high with a lower RSI high", () => {
    const s = SCENARIO_BY_ID["pm-a-divergence"];
    const v = s.candles.slice(0, s.visible);
    const r = rsi(v.map((c) => c.c));
    const peak1 = v.slice(0, 22).reduce((b, c, i) => (c.h > v[b].h ? i : b), 0);
    expect(v.at(-1)!.h).toBeGreaterThan(v[peak1].h);
    expect(r.at(-1)!).toBeLessThan(r[peak1]!);
  });

  it("classifies by ATR threshold over the horizon", () => {
    const base = walk(1, 100, 1, [{ n: 20, drift: 0, noise: 0.5 }]);
    const up = shape(base, 1, [[0, 2, -0.1, 1.9], [0, 2, -0.1, 1.9], [0, 2, -0.1, 1.9]]);
    const flat = shape(base, 1, [[0, 0.3, -0.3, 0.1], [0, 0.3, -0.3, -0.1], [0, 0.3, -0.3, 0.05]]);
    const down = shape(base, 1, [[0, 0.1, -2, -1.9], [0, 0.1, -2, -1.9], [0, 0.1, -2, -1.9]]);
    expect(classifyMove(up, 20).direction).toBe("bullish");
    expect(classifyMove(flat, 20).direction).toBe("sideways");
    expect(classifyMove(down, 20).direction).toBe("bearish");
    expect(classifyMove(up, 20).horizon).toBe(3);
  });

  it("scores direction and reasoning separately; a bare guess earns less than a reasoned call", () => {
    const s = SCENARIO_BY_ID["pm-b-hammer-support"];
    const valid = s.signals.filter((x) => x.valid).map((x) => x.id);
    const invalid = s.signals.filter((x) => !x.valid).map((x) => x.id);
    const q = QUESTION_BY_ID[s.id];
    const reasoned = grade(q, { choice: "bullish", signals: valid });
    const guess = grade(q, { choice: "bullish", signals: [] });
    const wrongButThoughtful = grade(q, { choice: "bearish", signals: valid });
    const junk = grade(q, { choice: "bullish", signals: invalid });
    expect(reasoned).toMatchObject({ correct: true, score: 1, reasoningScore: 1 });
    expect(guess).toMatchObject({ correct: true, score: 0.7, reasoningScore: 0 });
    expect(wrongButThoughtful).toMatchObject({ correct: false, score: 0.3 });
    expect(junk.reasoningScore).toBe(0);
    expect(xpForAnswer(1, reasoned.score, 1, "predict")).toBeGreaterThan(xpForAnswer(1, guess.score, 1, "predict"));
  });

  it("accepts 'uncertain' only when signals genuinely compete", () => {
    expect(gradePrediction(SCENARIO_BY_ID["pm-a-engulf-under-resistance"], { choice: "uncertain", signals: [] }).directionCorrect).toBe(true);
    expect(gradePrediction(SCENARIO_BY_ID["pm-a-engulf-under-resistance"], { choice: "sideways", signals: [] }).directionCorrect).toBe(true);
    expect(gradePrediction(SCENARIO_BY_ID["pm-b-hammer-support"], { choice: "uncertain", signals: [] }).directionCorrect).toBe(false);
  });

  it("the outcome never depends on the answer", () => {
    const s = SCENARIO_BY_ID["pm-i-hammer-fails"];
    const a = gradePrediction(s, { choice: "bullish", signals: [] }).move;
    const b = gradePrediction(s, { choice: "bearish", signals: [] }).move;
    expect(a).toEqual(b);
  });
});

describe("grading", () => {
  it("gives partial credit for multi-select, matching and ordering", () => {
    const multi = QUESTIONS.find((q) => q.type === "multi" && q.answer.length === 3)!;
    if (multi.type !== "multi") throw new Error();
    expect(grade(multi, multi.answer.slice(0, 2)).score).toBeCloseTo(2 / 3, 2);
    const wrongOpt = multi.options.find((o) => !multi.answer.includes(o.id))!.id;
    expect(grade(multi, [...multi.answer.slice(0, 2), wrongOpt]).score).toBeCloseTo(1 / 3, 2);
    const m = QUESTIONS.find((q) => q.type === "match")!;
    if (m.type !== "match") throw new Error();
    expect(grade(m, [1, 0, 2, 3]).score).toBe(0.5);
    const o = QUESTIONS.find((q) => q.type === "order")!;
    expect(grade(o, ["3", "2", "1"])).toMatchObject({ correct: false });
  });

  it("checks calculations within tolerance", () => {
    const q = QUESTION_BY_ID["fib-2"];
    expect(grade(q, 138.2).correct).toBe(true);
    expect(grade(q, 138.6).correct).toBe(true);
    expect(grade(q, 140).correct).toBe(false);
    expect(grade(q, Number.NaN).correct).toBe(false);
  });
});

describe("XP", () => {
  it("follows the published table", () => {
    expect(xpForAnswer(1, 1, 1, "quiz")).toBe(10);
    expect(xpForAnswer(2, 1, 1, "quiz")).toBe(20);
    expect(xpForAnswer(3, 1, 1, "quiz")).toBe(30);
    expect(xpForAnswer(3, 1, 1, "challenge")).toBe(45);
    expect(xpForAnswer(2, 0, 1, "quiz")).toBe(0);
  });

  it("pays less for repeats and nothing from the third try", () => {
    expect(xpForAnswer(2, 1, 2, "quiz")).toBe(10);
    expect(xpForAnswer(2, 1, 3, "quiz")).toBe(0);
    const at = [attempt({ question_id: "x" }), attempt({ question_id: "x" }), attempt({ question_id: "y" })];
    expect(nextAttemptNo(at, "x")).toBe(3);
    expect(nextAttemptNo(at, "z")).toBe(1);
  });

  it("totals answers, session bonuses and finished lessons", () => {
    const d = { attempts: [attempt({ xp: 10 }), attempt({ xp: 20 })], sessions: [session({ bonus_xp: XP.dailyChallenge })], lessons: [lesson("ohlc", TODAY), lesson("market", null)] };
    expect(totalXp(d)).toBe(10 + 20 + 20 + 25);
  });
});

describe("streaks", () => {
  const days = (...ds: string[]) => new Set(ds);
  it("counts consecutive days and doesn't break before today is done", () => {
    const s = streak(days("2026-10-14", "2026-10-15", "2026-10-16"), TODAY);
    expect(s).toMatchObject({ current: 3, best: 3, totalDays: 3, activeToday: false });
  });

  it("a single missed day uses a freeze instead of resetting", () => {
    const s = streak(days("2026-10-13", "2026-10-14", "2026-10-16", TODAY), TODAY);
    expect(s.current).toBe(4);
    expect(s.frozen).toEqual(["2026-10-15"]);
    expect(s.freezes).toBe(0);
  });

  it("resets after more misses than freezes, but keeps total days and best", () => {
    const s = streak(days("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-10", "2026-10-11"), TODAY);
    expect(s.current).toBe(0);
    expect(s.best).toBe(4);
    expect(s.totalDays).toBe(6);
  });

  it("earns a freeze every 7 active days, up to 2", () => {
    const ds = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const s = streak(new Set(ds), "2026-10-14");
    expect(s.freezes).toBe(2);
    expect(s.lastWeek).toBe(7);
  });
});

describe("mastery, levels and adaptivity", () => {
  it("marks a topic mastered at ≥80% over 5+ answers and tracks first tries separately", () => {
    const at = [true, true, false, true, true, true].map((c, i) => attempt({ topic: "pattern:hammer", correct: c, attempt_no: i < 3 ? 1 : 2 }));
    const st = topicStats(at).get("pattern:hammer")!;
    expect(st.mastered).toBe(true);
    expect(st.firstAccuracy).toBeCloseTo(2 / 3);
    expect(topicStats(at.slice(0, 4)).get("pattern:hammer")!.mastered).toBe(false);
  });

  it("flags weak topics", () => {
    const at = [false, false, true, false].map((c) => attempt({ topic: "rsi", correct: c }));
    expect(topicStats(at).get("rsi")!.weak).toBe(true);
  });

  it("doesn't level you up for finishing lessons alone", () => {
    const l1 = LESSONS.filter((l) => l.level === 1);
    const done = l1.map((l) => lesson(l.id, TODAY));
    expect(trainingLevel(done, new Map()).level).toBe(1);
    const good = l1.flatMap((l) => Array.from({ length: 5 }, () => attempt({ topic: l.topic, correct: true })));
    expect(trainingLevel(done, topicStats(good)).level).toBe(2);
    const bad = l1.flatMap((l) => Array.from({ length: 5 }, (_, i) => attempt({ topic: l.topic, correct: i === 0 })));
    expect(trainingLevel(done, topicStats(bad)).level).toBe(1);
  });

  it("raises difficulty after consistent success and lowers it after a slump", () => {
    expect(recommendedDifficulty([])).toBe(1);
    const easy = Array.from({ length: 12 }, () => attempt({ difficulty: 1, correct: true }));
    expect(recommendedDifficulty(easy)).toBe(2);
    const slump = [...easy, ...Array.from({ length: 8 }, () => attempt({ difficulty: 2, correct: false }))];
    expect(recommendedDifficulty(slump)).toBe(1);
  });

  it("schedules missed questions for revision and re-checks recent recoveries", () => {
    const at = [
      attempt({ question_id: "ohlc-1", correct: false, day: "2026-10-10" }),
      attempt({ question_id: "ohlc-2", correct: false, day: "2026-10-10" }),
      attempt({ question_id: "ohlc-2", correct: true, day: "2026-10-11" }),
      attempt({ question_id: "ohlc-3", correct: false, day: "2026-10-16" }),
      attempt({ question_id: "ohlc-3", correct: true, day: TODAY }),
      attempt({ question_id: "market-1", correct: true, day: "2026-10-10" }),
    ];
    const q = revisionQueue(at, TODAY);
    expect(q).toContain("ohlc-1");
    expect(q).toContain("ohlc-2");
    expect(q).not.toContain("ohlc-3");
    expect(q).not.toContain("market-1");
  });

  it("picks reproducible, unseen questions and mixes in revision", () => {
    const opts = { seed: "s-1", attempts: [], today: TODAY, difficulty: 1 as const, level: 5 };
    const a = pickQuestions("quiz", opts).map((q) => q.id);
    expect(pickQuestions("quiz", opts).map((q) => q.id)).toEqual(a);
    expect(a).toHaveLength(8);
    const missed = [attempt({ question_id: "ohlc-1", correct: false })];
    expect(pickQuestions("quiz", { ...opts, attempts: missed }).map((q) => q.id)).toContain("ohlc-1");
    expect(pickQuestions("revision", { ...opts, attempts: missed }).map((q) => q.id)).toEqual(["ohlc-1"]);
    expect(pickQuestions("quiz", { ...opts, topic: "rsi" }).every((q) => q.topic === "rsi")).toBe(true);
    expect(pickQuestions("predict", opts).every((q) => q.type === "predict")).toBe(true);
  });

  it("continues the lesson you left open, else the next one", () => {
    expect(nextLesson([], 1)).toBe(LESSONS[0].id);
    expect(nextLesson([lesson("market", TODAY)], 1)).toBe(LESSONS[1].id);
    expect(nextLesson([lesson("market", TODAY), lesson("volume", null)], 1)).toBe("volume");
  });

  it("the daily challenge is fixed per date", () => {
    expect(dailyChallenge(TODAY).id).toBe(dailyChallenge(TODAY).id);
    expect(POOLS.predict.length + POOLS.pattern.length).toBeGreaterThan(10);
    expect(hashSeed("a")).toBe(hashSeed("a"));
  });
});

describe("scoreboard and analytics", () => {
  const data = {
    sessions: [session({ id: "d", mode: "daily", bonus_xp: 20 }), session({ id: "s1" })],
    attempts: [
      attempt({ session_id: "d", question_id: "pm-b-hammer-support", topic: "pattern:hammer", mode: "daily", correct: true, xp: 10 }),
      attempt({ question_id: "ohlc-1", topic: "ohlc", correct: true, xp: 10 }),
      attempt({ question_id: "ohlc-2", topic: "ohlc", correct: true, xp: 10 }),
      attempt({ question_id: "vol-1", topic: "volume", correct: false, xp: 0 }),
      attempt({ question_id: "vol-2", topic: "volume", correct: false, xp: 0, attempt_no: 2 }),
      attempt({ question_id: "vol-1", topic: "volume", correct: true, xp: 5, day: "2026-10-16", attempt_no: 1 }),
    ],
    lessons: [lesson("ohlc", TODAY)],
  };

  it("computes today's stats from real records", () => {
    const s = dayStats(data, TODAY);
    expect(s).toMatchObject({ attempted: 5, correct: 3, incorrect: 2, lessons: 1, predictions: 1, predictionsRight: 1, challengeDone: true, best: "ohlc", weakest: "volume" });
    expect(s.xp).toBe(30 + 20 + 25);
    expect(s.firstAttempted).toBe(4);
    expect(dailyGoal(s).done).toBe(true);
    expect(dailyGoal(dayStats({ sessions: [], attempts: [], lessons: [] }, TODAY)).done).toBe(false);
  });

  it("builds daily, weekly and monthly series and leaves empty days blank", () => {
    const rows = dailySeries(data, { from: "2026-10-15", to: TODAY });
    expect(rows.map((r) => r.attempted)).toEqual([0, 1, 5]);
    expect(rows[0].accuracy).toBeNull();
    const weeks = groupSeries(rows, "week");
    expect(weeks.reduce((t, w) => t + w.attempted, 0)).toBe(6);
    expect(groupSeries(rows, "month")).toHaveLength(1);
    const ohlcOnly = dailySeries(data, { from: TODAY, to: TODAY, topic: "ohlc" });
    expect(ohlcOnly[0].attempted).toBe(2);
  });

  it("separates first tries from repeats and finds most-missed topics", () => {
    expect(firstVsRepeat(data.attempts).repeat.attempts).toBe(1);
    expect(mostMissed(data.attempts)[0].topic).toBe("volume");
  });

  it("dates achievements by replaying history", () => {
    const list = achievements(data, TODAY);
    expect(list.find((a) => a.def.id === "first-lesson")!.on).toBe(TODAY);
    expect(list.find((a) => a.def.id === "streak-3")!.on).toBeNull();
    expect(list.find((a) => a.def.id === "lessons-all")!.on).toBeNull();
  });

  it("every lesson in a level can be found by id", () => {
    for (const l of LESSONS) expect(LESSON_BY_ID[l.id]).toBe(l);
  });
});
