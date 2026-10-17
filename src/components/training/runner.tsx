"use client";

import { ArrowRight, BookOpen, Check, ChevronDown, Flame, RotateCcw, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { celebrate } from "@/lib/celebrate";
import { LESSON_BY_ID, TOPIC_BY_ID, topicLabel } from "@/lib/training/content";
import { CHALLENGE_SECONDS } from "@/lib/training/engine";
import type { Question } from "@/lib/training/types";
import type { TrainingMode } from "@/lib/types";
import { Button } from "../ui/button";
import { Progress } from "../ui/misc";
import { newSession, useTrainingActions } from "./actions";
import { QuestionCard, type Submitted } from "./question";
import { trainingHref } from "./nav";

export const MODE_LABEL: Record<TrainingMode, string> = {
  learn: "Knowledge check",
  quiz: "Quick quiz",
  pattern: "Pattern recognition",
  predict: "Predict the next move",
  analysis: "Chart analysis",
  revision: "Revision",
  challenge: "Challenge",
  daily: "Daily challenge",
};

/**
 * Runs a round of questions: one at a time, each answer saved (and locked) as you submit it, then a summary
 * with your score, accuracy, time, strengths, weak spots and lessons to revisit.
 */
export function PracticeRunner({ mode, questions, lessonId, title, onExit, onDone }: { mode: TrainingMode; questions: Question[]; lessonId?: string; title?: string; onExit: () => void; onDone?: (r: RoundResult) => void }) {
  const session = useRef(newSession(mode, lessonId));
  const actions = useTrainingActions();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Submitted>>({});
  const [result, setResult] = useState<RoundResult | null>(null);
  const [finishing, setFinishing] = useState(false);
  const q = questions[idx];
  const answered = q ? answers[q.id] : undefined;
  const runStreak = useMemo(() => {
    let n = 0;
    for (let i = idx; i >= 0; i--) {
      const a = answers[questions[i]?.id];
      if (!a) continue;
      if (!a.grade.correct) break;
      n++;
    }
    return n;
  }, [answers, idx, questions]);

  const submit = async (s: Submitted) => {
    setAnswers((a) => ({ ...a, [q.id]: s }));
    const saved = await actions.recordAnswer(session.current, q, s.answer, s.grade, s.timeMs);
    setAnswers((a) => ({ ...a, [q.id]: { ...s, xp: saved.xp } }));
    return { xp: saved.xp };
  };

  const finish = async () => {
    setFinishing(true);
    const bonus = await actions.finishSession(session.current).catch(() => 0);
    const r = summarise(questions, answers, bonus);
    setResult(r);
    setFinishing(false);
    onDone?.(r);
    if (r.total >= 3 && r.correct === r.total) celebrate(["🎯", "🏆", "✨", "📈", "🕯️"]);
  };

  if (result) return <RoundSummary mode={mode} result={result} questions={questions} answers={answers} onExit={onExit} />;
  if (!q)
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
        <p className="text-[15px] font-semibold">Nothing to practise here yet</p>
        <Button className="mt-4" onClick={onExit}>Back</Button>
      </div>
    );

  const last = idx === questions.length - 1;
  const next = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary" size="lg" loading={finishing} onClick={() => (last ? finish() : setIdx(idx + 1))} icon={!last ? <ArrowRight className="h-4 w-4" /> : <Check className="h-4 w-4" />}>
        {last ? "See results" : "Next question"}
      </Button>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onExit} aria-label="Leave this round" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 hover:text-ink">
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[12.5px] text-ink-3">
            <span className="truncate font-medium text-ink-2">{title ?? MODE_LABEL[mode]}</span>
            <span className="num shrink-0">
              {idx + 1} / {questions.length}
            </span>
          </div>
          <Progress value={(idx + (answered ? 1 : 0)) / questions.length} tone="future" className="mt-1" label="Progress through this round" />
        </div>
        {runStreak >= 2 && (
          <span className="anim-count inline-flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-2 py-1 text-[12.5px] font-semibold text-warn" aria-label={`${runStreak} correct in a row`}>
            <Flame className="h-3.5 w-3.5" aria-hidden />
            {runStreak}
          </span>
        )}
      </div>
      <section key={q.id} className="anim-rise rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <QuestionCard q={q} onSubmit={submit} timeLimit={mode === "challenge" ? CHALLENGE_SECONDS : undefined} footer={next} />
      </section>
    </div>
  );
}

export interface RoundResult {
  total: number;
  correct: number;
  xp: number;
  bonus: number;
  seconds: number;
  strengths: string[];
  weak: string[];
}

function summarise(questions: Question[], answers: Record<string, Submitted>, bonus: number): RoundResult {
  const done = questions.filter((q) => answers[q.id]);
  const byTopic = new Map<string, { n: number; ok: number }>();
  for (const q of done) {
    const t = byTopic.get(q.topic) ?? { n: 0, ok: 0 };
    t.n++;
    if (answers[q.id].grade.correct) t.ok++;
    byTopic.set(q.topic, t);
  }
  return {
    total: done.length,
    correct: done.filter((q) => answers[q.id].grade.correct).length,
    xp: done.reduce((t, q) => t + (answers[q.id].xp ?? 0), 0) + bonus,
    bonus,
    seconds: Math.round(done.reduce((t, q) => t + answers[q.id].timeMs, 0) / 1000),
    strengths: [...byTopic.entries()].filter(([, t]) => t.ok === t.n).map(([k]) => k),
    weak: [...byTopic.entries()].filter(([, t]) => t.ok < t.n).map(([k]) => k),
  };
}

function RoundSummary({ mode, result: r, questions, answers, onExit }: { mode: TrainingMode; result: RoundResult; questions: Question[]; answers: Record<string, Submitted>; onExit: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const acc = r.total ? r.correct / r.total : 0;
  const lessons = [...new Set(r.weak.map((t) => TOPIC_BY_ID[t]?.lesson).filter((l): l is string => !!l && !!LESSON_BY_ID[l]))];
  const verdict = acc === 1 ? "Perfect round!" : acc >= 0.8 ? "Great work" : acc >= 0.5 ? "Good effort" : "Keep going — every miss is a lesson";
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <section className="anim-rise rounded-2xl bg-inverse p-5 text-on-inverse sm:p-6">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-warn" aria-hidden />
          <div>
            <p className="text-[13px] opacity-75">{MODE_LABEL[mode]} complete</p>
            <p className="display text-[26px] font-semibold leading-tight">{verdict}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Big label="Score" value={`+${r.xp} XP`} note={r.bonus ? `incl. +${r.bonus} bonus` : undefined} />
          <Big label="Accuracy" value={`${Math.round(acc * 100)}%`} note={`${r.correct} of ${r.total}`} />
          <Big label="Time" value={r.seconds >= 60 ? `${Math.floor(r.seconds / 60)}m ${r.seconds % 60}s` : `${r.seconds}s`} note={r.total ? `${Math.round(r.seconds / r.total)}s a question` : undefined} />
          <Big label="Topics" value={String(new Set(questions.map((q) => q.topic)).size)} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="text-[14px] font-semibold text-ok">Strengths</h3>
          {r.strengths.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">{r.strengths.map((t) => <li key={t} className="rounded-full bg-ok-soft px-2.5 py-1 text-[12.5px] font-medium text-ok">{topicLabel(t)}</li>)}</ul>
          ) : (
            <p className="mt-1 text-[13px] text-ink-3">Nothing fully right this round — that's fine, the review below will help.</p>
          )}
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <h3 className="text-[14px] font-semibold text-warn">Work on</h3>
          {r.weak.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">{r.weak.map((t) => <li key={t} className="rounded-full bg-warn-soft px-2.5 py-1 text-[12.5px] font-medium text-warn">{topicLabel(t)}</li>)}</ul>
          ) : (
            <p className="mt-1 text-[13px] text-ink-3">No weak spots this round.</p>
          )}
          {lessons.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <p className="text-[12px] text-ink-3">Recommended lessons</p>
              {lessons.slice(0, 3).map((id) => (
                <Link key={id} href={trainingHref({ tab: "learn", lesson: id })} className="inline-flex items-center gap-2 text-[13.5px] font-medium text-brand hover:underline">
                  <BookOpen className="h-4 w-4" aria-hidden />
                  {LESSON_BY_ID[id].title}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-surface">
        <h3 className="px-4 pt-4 text-[14px] font-semibold">Review your answers</h3>
        <ul className="mt-2 divide-y divide-line/70">
          {questions.filter((q) => answers[q.id]).map((q, i) => {
            const a = answers[q.id];
            const isOpen = open === q.id;
            return (
              <li key={q.id}>
                <button type="button" onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white", a.grade.correct ? "bg-ok" : a.grade.score > 0 ? "bg-warn" : "bg-danger")}>{a.grade.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{i + 1}. {q.prompt}</span>
                    <span className="block text-[12px] text-ink-3">{topicLabel(q.topic)} · +{a.xp ?? 0} XP</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-3 transition-transform", isOpen && "rotate-180")} aria-hidden />
                </button>
                {isOpen && (
                  <div className="border-t border-line/70 bg-surface-2/50 p-4">
                    <QuestionCard q={q} review={a} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={onExit} icon={<RotateCcw className="h-4 w-4" />}>
          Done
        </Button>
      </div>
    </div>
  );
}

function Big({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-[12px] opacity-70">{label}</p>
      <p className="num anim-count text-[22px] font-semibold leading-tight">{value}</p>
      {note && <p className="text-[11.5px] opacity-70">{note}</p>}
    </div>
  );
}
