"use client";

import { ArrowRight, BookOpen, Brain, CandlestickChart, ChartLine, CheckCircle2, Repeat, ScrollText, Timer, TrendingUp, Info } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { newId } from "@/lib/data/repo";
import { MODULES, TOPICS, topicLabel } from "@/lib/training/content";
import { CHALLENGE_SECONDS, dailyChallenge, MASTERY, pickQuestions, PREDICTION_WEIGHTS, revisionQueue, SESSION_SIZE, XP, type PracticeMode } from "@/lib/training/engine";
import { MOVE_HORIZON, MOVE_THRESHOLD_ATR } from "@/lib/training/candles";
import { DIFFICULTY_LABEL } from "@/lib/training/types";
import type { TrainingMode } from "@/lib/types";
import { Button } from "../ui/button";
import { useTraining } from "./actions";
import { Card } from "./dashboard";
import { useTrainingView } from "./nav";
import { PracticeRunner, MODE_LABEL } from "./runner";

const MODES: { id: PracticeMode | "learn" | "mistakes"; icon: typeof Brain; title: string; body: string; feature?: boolean }[] = [
  { id: "predict", icon: TrendingUp, title: "Predict the next move", body: "Read a chart with the next candles hidden, call the direction, give your reasons — then see what actually happened.", feature: true },
  { id: "quiz", icon: Brain, title: "Quick quiz", body: `${SESSION_SIZE.quiz} mixed questions at your level, with some you missed before mixed in.` },
  { id: "pattern", icon: CandlestickChart, title: "Pattern recognition", body: "Name the pattern, put candles in order, match patterns to their meaning." },
  { id: "analysis", icon: ChartLine, title: "Chart analysis", body: "Trend, support and resistance, breakouts and possible scenarios on whole charts." },
  { id: "revision", icon: Repeat, title: "Revision", body: "Questions you answered wrong, back for another go." },
  { id: "challenge", icon: Timer, title: "Challenge mode", body: `Harder questions, ${CHALLENGE_SECONDS} seconds each, 1.5× XP.` },
  { id: "mistakes", icon: ScrollText, title: "Mistake review", body: "Your past mistakes with the right answers and explanations." },
  { id: "learn", icon: BookOpen, title: "Learn mode", body: "Structured lessons with diagrams, step by step." },
];

export function PracticeHub() {
  const t = useTraining();
  const [, go] = useTrainingView();
  const due = revisionQueue(t.data.attempts, t.today).length;
  const [topic, setTopic] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m) => {
          const disabled = m.id === "revision" && due === 0;
          const onClick = () => (m.id === "learn" ? go({ tab: "learn" }) : m.id === "mistakes" ? go({ tab: "review" }) : go({ tab: "practice", run: m.id }));
          return (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              onClick={onClick}
              className={cn(
                "lift group flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors disabled:opacity-55",
                m.feature ? "border-transparent bg-inverse text-on-inverse sm:col-span-2 lg:col-span-1 lg:row-span-2" : "border-line bg-surface hover:border-line-strong",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <m.icon className={cn("h-6 w-6", m.feature ? "text-warn" : "text-future")} aria-hidden />
                {m.id === "revision" && <span className={cn("num rounded-full px-2 py-0.5 text-[12px] font-semibold", due ? "bg-warn-soft text-warn" : "bg-surface-3 text-ink-3")}>{due ? `${due} due` : "Nothing due"}</span>}
                {m.feature && <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11.5px] font-semibold">Featured</span>}
              </span>
              <span className={cn("font-semibold", m.feature ? "display text-[22px]" : "text-[15.5px]")}>{m.title}</span>
              <span className={cn("text-[13px]", m.feature ? "opacity-80" : "text-ink-3")}>{m.body}</span>
              {m.feature && <PredictPreview />}
              <span className={cn("mt-auto inline-flex items-center gap-1 pt-1 text-[13px] font-semibold", m.feature ? "text-warn" : "text-brand")}>
                {disabled ? "All caught up" : "Start"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </button>
          );
        })}
      </div>

      <Card title="Practise one topic" icon={CheckCircle2}>
        <div className="flex flex-wrap items-center gap-2">
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[14.5px] outline-none focus:border-future sm:max-w-md" aria-label="Topic">
            <option value="">Choose a topic…</option>
            {MODULES.map((m) => (
              <optgroup key={m.id} label={`Level ${m.level}: ${m.title}`}>
                {TOPICS.filter((x) => x.level === m.level).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                    {t.stats.get(x.id)?.mastered ? " ✓" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Button variant="primary" disabled={!topic} onClick={() => go({ tab: "practice", run: "quiz", topic })}>
            Practise
          </Button>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">Questions are picked at your level ({DIFFICULTY_LABEL[t.difficulty]} right now) and move up after 10+ answers at 80%+.</p>
      </Card>

      <ScoringRules />
    </div>
  );
}

function PredictPreview() {
  const up = [0, 1, 0, 1, 1, 0, 1];
  return (
    <svg viewBox="0 0 160 56" className="my-1 h-14 w-full max-w-[220px]" aria-hidden>
      {up.map((u, i) => {
        const base = 40 - i * 3;
        return (
          <g key={i}>
            <line x1={10 + i * 16} x2={10 + i * 16} y1={base - 14} y2={base + 10} stroke={u ? "var(--candle-up)" : "var(--candle-down)"} strokeWidth="2" />
            <rect x={5 + i * 16} y={base - (u ? 8 : 0)} width="10" height="12" rx="2" fill={u ? "var(--inverse)" : "var(--candle-down)"} stroke={u ? "var(--candle-up)" : "var(--candle-down)"} strokeWidth="2" />
          </g>
        );
      })}
      <rect x="116" y="4" width="40" height="48" rx="6" fill="none" stroke="currentColor" strokeDasharray="4 3" opacity="0.6" />
      <text x="136" y="35" textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor" opacity="0.8">?</text>
    </svg>
  );
}

/** The scoring rules, in plain words. */
export function ScoringRules() {
  return (
    <details className="group rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-semibold">
        <Info className="h-4 w-4 text-future" aria-hidden /> How scoring works
        <span className="ml-auto text-[12.5px] font-normal text-ink-3 group-open:hidden">Show</span>
      </summary>
      <div className="mt-3 grid gap-4 text-[13.5px] text-ink-2 sm:grid-cols-2">
        <ul className="flex flex-col gap-1">
          <li>Correct beginner question: <b className="text-ink">{XP.question[1]} XP</b></li>
          <li>Correct intermediate: <b className="text-ink">{XP.question[2]} XP</b> · advanced: <b className="text-ink">{XP.question[3]} XP</b></li>
          <li>Partly right (multi-select, matching, ordering): that share of the XP</li>
          <li>Completing a lesson: <b className="text-ink">{XP.lesson} XP</b> (once)</li>
          <li>Daily challenge: <b className="text-ink">+{XP.dailyChallenge} XP</b> · revision round: <b className="text-ink">+{XP.revisionRound} XP</b></li>
          <li>Challenge mode: <b className="text-ink">{XP.challenge}×</b></li>
          <li>Same question again: half XP on the 2nd try, none after</li>
        </ul>
        <ul className="flex flex-col gap-1">
          <li>Predictions: direction is {Math.round(PREDICTION_WEIGHTS.direction * 100)}% of the score, your reasons {Math.round(PREDICTION_WEIGHTS.reasoning * 100)}%. A bare guess can't score full marks; wrong reasons count against you.</li>
          <li>A move counts as bullish or bearish if the close {MOVE_HORIZON} candles later is at least {MOVE_THRESHOLD_ATR} ATR away; otherwise it's sideways.</li>
          <li>Mastered topic: {MASTERY.accuracy * 100}%+ over your last {MASTERY.recentWindow} answers, with at least {MASTERY.minAttempts}. First tries are tracked separately.</li>
          <li>Missing a day uses a streak freeze (you earn one every 7 active days, up to 2) instead of resetting your streak.</li>
        </ul>
      </div>
    </details>
  );
}

/** Starts a round for `run` (a practice mode, or "daily"). The question set is fixed for the round. */
export function RunLauncher({ run, topic }: { run: string; topic: string | null }) {
  const t = useTraining();
  const [, go] = useTrainingView();
  const [seed] = useState(() => newId());
  const [questions] = useState(() => {
    if (run === "daily") return [dailyChallenge(t.today)];
    const mode = (["quiz", "pattern", "predict", "analysis", "revision", "challenge"].includes(run) ? run : "quiz") as PracticeMode;
    return pickQuestions(mode, { seed, attempts: t.data.attempts, today: t.today, difficulty: t.difficulty, topic, level: t.level.level });
  });
  // Decided once: finishing today's challenge inside this round mustn't swap the results screen away.
  const [alreadyDone] = useState(() => run === "daily" && t.todayStats.challengeDone);
  const back = () => go({ tab: run === "daily" ? "home" : "practice" });
  if (alreadyDone)
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-line bg-surface p-6 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-ok" aria-hidden />
        <p className="mt-2 text-[16px] font-semibold">You've done today's challenge</p>
        <p className="mt-1 text-[13.5px] text-ink-3">A new one appears tomorrow. Meanwhile, try Predict the next move.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => go({ tab: "home" })}>Home</Button>
          <Button variant="primary" onClick={() => go({ tab: "practice", run: "predict" })}>Predict the next move</Button>
        </div>
      </div>
    );
  const mode: TrainingMode = run === "daily" ? "daily" : ((["quiz", "pattern", "predict", "analysis", "revision", "challenge"].includes(run) ? run : "quiz") as TrainingMode);
  return <PracticeRunner key={seed} mode={mode} questions={questions} title={topic ? `${MODE_LABEL[mode]} · ${topicLabel(topic)}` : undefined} onExit={back} />;
}
