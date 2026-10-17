"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, CircleDot, Clock, Eye, GraduationCap, Lock, Search, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { celebrate } from "@/lib/celebrate";
import { LESSON_BY_ID, LESSONS, MODULES, QUESTION_BY_ID } from "@/lib/training/content";
import { XP } from "@/lib/training/engine";
import { DIFFICULTY_LABEL, SECTION_LABEL, type Lesson, type Section } from "@/lib/training/types";
import { Button } from "../ui/button";
import { Progress } from "../ui/misc";
import { useTraining, useTrainingActions } from "./actions";
import { CandleAnatomy, CandleChart } from "./candle-chart";
import { Rich } from "./glossary";
import { useTrainingView } from "./nav";
import { PracticeRunner } from "./runner";

/** All five levels, with your progress through each. Any lesson can be opened — the levels are a guide, not a gate. */
export function LearnCatalog() {
  const t = useTraining();
  const [, go] = useTrainingView();
  const [q, setQ] = useState("");
  const started = new Set(t.data.lessons.filter((l) => l.status === "started").map((l) => l.lesson_id));
  const needle = q.trim().toLowerCase();
  const match = (l: Lesson) => !needle || l.title.toLowerCase().includes(needle) || l.summary.toLowerCase().includes(needle);
  const [openLevel, setOpenLevel] = useState<number | null>(null);
  const shownLevel = openLevel ?? t.level.level;

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a lesson or pattern (e.g. hammer, RSI, gaps)" className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-[14.5px] outline-none focus:border-future focus:ring-2 focus:ring-future/20" aria-label="Find a lesson" />
      </label>
      {MODULES.filter((m) => m.status === "published").map((m) => {
        const ls = LESSONS.filter((l) => l.moduleId === m.id);
        const visible = ls.filter(match);
        if (needle && !visible.length) return null;
        const done = ls.filter((l) => t.completed.has(l.id)).length;
        const isCurrent = m.level === t.level.level;
        const ahead = m.level > t.level.level;
        const expanded = needle ? true : shownLevel === m.level;
        return (
          <section key={m.id} className={cn("overflow-hidden rounded-2xl border bg-surface", isCurrent ? "border-future/50 shadow-panel" : "border-line")}>
            <button type="button" onClick={() => setOpenLevel(expanded && !needle ? -1 : m.level)} aria-expanded={expanded} className="flex w-full items-center gap-3 p-4 text-left sm:p-5">
              <span className={cn("display flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[18px] font-semibold", done === ls.length ? "bg-ok text-white" : isCurrent ? "bg-future text-white" : "bg-surface-3 text-ink-2")}>{done === ls.length ? <Check className="h-5 w-5" /> : m.level}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-semibold">Level {m.level}: {m.title}</span>
                  {isCurrent && <span className="rounded-full bg-future-soft px-2 py-0.5 text-[11.5px] font-semibold text-future-ink">Your level</span>}
                  {ahead && <span className="inline-flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-[11.5px] text-ink-3"><Lock className="h-3 w-3" aria-hidden />Recommended later</span>}
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-3">{m.description}</span>
                <span className="mt-2 flex items-center gap-2">
                  <Progress value={done / ls.length} tone={done === ls.length ? "brand" : "future"} className="max-w-56" label={`Level ${m.level} lessons completed`} />
                  <span className="num shrink-0 text-[12px] text-ink-3">{done}/{ls.length}</span>
                </span>
              </span>
            </button>
            {expanded && (
              <ul className="grid grid-cols-1 gap-2 border-t border-line/70 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
                {visible.map((l) => {
                  const isDone = t.completed.has(l.id);
                  const inProgress = !isDone && started.has(l.id);
                  const st = t.stats.get(l.topic);
                  return (
                    <li key={l.id}>
                      <button type="button" onClick={() => go({ tab: "learn", lesson: l.id })} className="lift group flex h-full w-full flex-col gap-1.5 rounded-xl border border-line bg-surface-2/60 p-3 text-left hover:border-line-strong hover:bg-surface">
                        <span className="flex items-start gap-2">
                          {isDone ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="Completed" /> : inProgress ? <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-future" aria-label="In progress" /> : <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />}
                          <span className="text-[14.5px] font-semibold leading-snug">{l.title}</span>
                        </span>
                        <span className="line-clamp-2 text-[12.5px] text-ink-3">{l.summary}</span>
                        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[11.5px] text-ink-3">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden />{l.minutes} min</span>
                          <span>· {DIFFICULTY_LABEL[l.difficulty]}</span>
                          {st && <span className={cn("font-medium", st.mastered ? "text-ok" : st.weak ? "text-danger" : "text-ink-2")}>· {st.mastered ? "Mastered" : `${Math.round(st.recentAccuracy * 100)}% recent`}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** A lesson, one step at a time (you can jump to any step), ending with a knowledge check and "mark as completed". */
export function LessonView({ id }: { id: string }) {
  const lesson = LESSON_BY_ID[id];
  const t = useTraining();
  const actions = useTrainingActions();
  const [, go] = useTrainingView();
  const steps = useMemo(() => (lesson ? [...lesson.sections.map((s) => ({ kind: "section" as const, s })), { kind: "check" as const }] : []), [lesson]);
  const [step, setStep] = useState(0);
  const [quiz, setQuiz] = useState(false);
  const [quizScore, setQuizScore] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const opened = useRef(Date.now());
  const done = t.completed.has(id);

  useEffect(() => {
    opened.current = Date.now();
    setStep(0);
    setQuiz(false);
    setQuizScore(null);
    if (lesson) void actions.openLesson(id);
  }, [id]);

  if (!lesson)
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
        <p className="font-semibold">That lesson doesn't exist (any more).</p>
        <Button className="mt-4" onClick={() => go({ tab: "learn" })}>All lessons</Button>
      </div>
    );

  const mod = MODULES.find((m) => m.id === lesson.moduleId)!;
  const levelLessons = LESSONS.filter((l) => l.level === lesson.level);
  const nextLesson = LESSONS[LESSONS.indexOf(lesson) + 1];
  const cur = steps[step];

  const complete = async () => {
    setSaving(true);
    try {
      const first = await actions.completeLesson(id, (Date.now() - opened.current) / 1000);
      if (first) {
        toast.success(`Lesson complete · +${XP.lesson} XP`);
        celebrate(["🎓", "📈", "✨", "🕯️", "⭐"]);
      } else toast.success("Already completed — progress kept.");
    } catch {
      /* toast already shown */
    } finally {
      setSaving(false);
    }
  };

  if (quiz)
    return (
      <PracticeRunner
        mode="learn"
        lessonId={id}
        title={`Knowledge check · ${lesson.title}`}
        questions={lesson.quiz.map((q) => QUESTION_BY_ID[q]).filter(Boolean)}
        onDone={(r) => setQuizScore(`${r.correct}/${r.total}`)}
        onExit={() => setQuiz(false)}
      />
    );

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => go({ tab: "learn" })} aria-label="Back to all lessons" className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 hover:text-ink">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink-3">
            Level {lesson.level} · {mod.title} · {lesson.minutes} min · {DIFFICULTY_LABEL[lesson.difficulty]}
          </p>
          <h1 className="display text-[24px] font-semibold leading-tight sm:text-[28px]">{lesson.title}</h1>
          <p className="mt-1 text-[14px] text-ink-2">{lesson.summary}</p>
        </div>
        {done && <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-ok-soft px-2.5 py-1 text-[12px] font-semibold text-ok"><Check className="h-3.5 w-3.5" />Done</span>}
      </div>

      {step === 0 && (
        <div className="rounded-2xl border border-line bg-surface-2/60 p-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">You'll learn to</p>
          <ul className="mt-1 grid gap-1 sm:grid-cols-3">
            {lesson.objectives.map((o) => (
              <li key={o} className="flex items-start gap-1.5 text-[13.5px]"><Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-future" aria-hidden />{o}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Step chips: jump anywhere — nothing forces you through the reading first. */}
      <nav aria-label="Lesson steps" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ol className="flex min-w-max gap-1.5">
          {steps.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => setStep(i)} aria-current={i === step ? "step" : undefined} className={cn("h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors", i === step ? "bg-inverse text-on-inverse" : i < step ? "bg-brand-soft text-brand-strong" : "bg-surface-3/70 text-ink-2 hover:text-ink")}>
                {s.kind === "section" ? SECTION_LABEL[s.s.kind] : "Check & finish"}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section key={step} className="anim-rise rounded-2xl border border-line bg-surface p-4 sm:p-6">
        {cur.kind === "section" ? (
          <SectionView s={cur.s} />
        ) : (
          <div className="flex flex-col items-start gap-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-future" aria-hidden />
              <h2 className="text-[18px] font-semibold">Knowledge check</h2>
            </div>
            <p className="text-[14px] text-ink-2">{lesson.quiz.length} short questions on this lesson. Your answers are saved and count toward your scores and topic mastery.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="lg" onClick={() => setQuiz(true)}>{quizScore ? "Try the check again" : "Start the check"}</Button>
              {quizScore && <span className="self-center text-[14px] font-medium text-ink-2">Last result: {quizScore}</span>}
            </div>
            <div className="w-full border-t border-line pt-4">
              <h3 className="text-[15px] font-semibold">Mark as completed</h3>
              <p className="mt-1 text-[13.5px] text-ink-3">+{XP.lesson} XP the first time. Your level goes up from what you show you understand, not just from finishing lessons.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant={done ? "secondary" : "primary"} size="lg" loading={saving} onClick={complete} icon={<Check className="h-4 w-4" />}>
                  {done ? "Completed" : "Mark as completed"}
                </Button>
                {nextLesson && (
                  <Button size="lg" onClick={() => go({ tab: "learn", lesson: nextLesson.id })} icon={<ArrowRight className="h-4 w-4" />}>
                    Next: {nextLesson.title}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} icon={<ArrowLeft className="h-4 w-4" />}>
          Back
        </Button>
        <span className="num text-[12.5px] text-ink-3">
          Step {step + 1} of {steps.length} · lesson {levelLessons.indexOf(lesson) + 1} of {levelLessons.length} in Level {lesson.level}
        </span>
        {step < steps.length - 1 ? (
          <Button variant="primary" onClick={() => setStep(step + 1)} icon={<ArrowRight className="h-4 w-4" />}>
            Next
          </Button>
        ) : (
          <span />
        )}
      </div>
      <p className="text-center text-[12px] text-ink-3">Educational content only — not financial advice. Charts in lessons use simulated prices.</p>
    </article>
  );
}

function SectionView({ s }: { s: Section }) {
  const seen = new Set<string>();
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-future-ink">{s.title ?? SECTION_LABEL[s.kind]}</h2>
      {s.chart && <CandleChart spec={s.chart} height={s.chart.panel ? 300 : 250} />}
      {s.anatomy && <CandleAnatomy spec={s.anatomy} />}
      {s.body && (
        <p className="text-[15.5px] leading-relaxed text-ink">
          <Rich text={s.body} seen={seen} />
        </p>
      )}
      {s.bullets && (
        <ul className="flex flex-col gap-2">
          {s.bullets.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed">
              <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", s.kind === "mistakes" ? "bg-danger" : "bg-future")} aria-hidden />
              <span>
                <Rich text={b} seen={seen} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {s.compare && (
        <div className={cn("grid grid-cols-1 gap-3", s.compare.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
          {s.compare.map((c) => (
            <figure key={c.title} className="rounded-xl border border-line bg-surface-2/60 p-2.5">
              <figcaption className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-semibold">{c.title}</span>
                <span className="rounded-full bg-future-soft px-1.5 py-0.5 text-[10.5px] font-medium text-future-ink">Simulated</span>
              </figcaption>
              <CandleChart spec={c.chart} height={150} compact />
              {c.caption && <p className="mt-1 text-[12.5px] text-ink-3">{c.caption}</p>}
            </figure>
          ))}
        </div>
      )}
      {(s.bull || s.bear) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {s.bull && (
            <div className="rounded-xl border border-candle-up/30 bg-ok-soft/60 p-3">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-candle-up"><TrendingUp className="h-4 w-4" aria-hidden />Bullish reading</p>
              <p className="mt-1 text-[14px] leading-relaxed"><Rich text={s.bull} seen={seen} /></p>
            </div>
          )}
          {s.bear && (
            <div className="rounded-xl border border-candle-down/30 bg-danger-soft/60 p-3">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-candle-down"><TrendingDown className="h-4 w-4" aria-hidden />Bearish reading</p>
              <p className="mt-1 text-[14px] leading-relaxed"><Rich text={s.bear} seen={seen} /></p>
            </div>
          )}
        </div>
      )}
      {s.ask && (
        <div className="rounded-xl border border-future/30 bg-future-soft/50 p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-future-ink">Think about it</p>
          <p className="mt-1 text-[15px] font-medium">{s.ask.question}</p>
          {revealed ? (
            <p className="anim-fade mt-2 text-[14.5px] leading-relaxed text-ink-2"><Rich text={s.ask.answer} seen={seen} /></p>
          ) : (
            <Button className="mt-3" icon={<Eye className="h-4 w-4" />} onClick={() => setRevealed(true)}>
              I've thought about it — show me
            </Button>
          )}
        </div>
      )}
      {s.kind === "summary" && <p className="text-[13px] text-ink-3">Patterns and indicators describe probabilities, not certainties. Always consider context and define your risk.</p>}
    </div>
  );
}

