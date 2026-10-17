"use client";

import { ArrowRight, BookOpen, Brain, CalendarCheck, CandlestickChart, Check, CircleDashed, Flame, Repeat, Snowflake, Sparkles, Target, Trophy, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addDays, formatDate } from "@/lib/dates";
import { LESSON_BY_ID, LESSONS, PATTERN_TOPICS, TOPIC_BY_ID, topicLabel } from "@/lib/training/content";
import { PATTERN_BY_ID } from "@/lib/training/patterns";
import { confusions, dailyChallenge, dailyGoal, dayStats, LEVEL_TITLES, MAX_FREEZES, nextLesson, patternsMastered, revisionQueue, type TrainingData } from "@/lib/training/engine";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from "@/lib/training/types";
import { Button } from "../ui/button";
import { Progress } from "../ui/misc";
import { useTraining } from "./actions";
import { useTrainingView } from "./nav";

export function Tile({ label, value, note, icon: Icon, tone, onClick }: { label: string; value: ReactNode; note?: ReactNode; icon?: typeof Flame; tone?: "ok" | "warn" | "danger" | "future"; onClick?: () => void }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
        {Icon && <Icon className={cn("h-3.5 w-3.5", tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : tone === "danger" ? "text-danger" : "text-future")} aria-hidden />}
        {label}
      </span>
      <span className="num anim-count mt-0.5 block text-[20px] font-semibold leading-tight sm:text-[22px]">{value}</span>
      {note && <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">{note}</span>}
    </>
  );
  const cls = "block min-w-0 rounded-2xl border border-line bg-surface p-3 text-left sm:p-4";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "lift w-full hover:border-line-strong")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

/** The training home: today, your level and streak, where to continue, and what to work on. */
export function TrainingDashboard() {
  const t = useTraining();
  const [, go] = useTrainingView();
  const s = t.todayStats;
  const goal = dailyGoal(s);
  const next = nextLesson(t.data.lessons, t.level.level);
  const nextL = next ? LESSON_BY_ID[next] : null;
  const nextStarted = t.data.lessons.some((l) => l.lesson_id === next && l.status === "started");
  const challenge = dailyChallenge(t.today);
  const revision = revisionQueue(t.data.attempts, t.today);
  const weak = [...t.stats.values()].filter((x) => x.weak).sort((a, b) => a.recentAccuracy - b.recentAccuracy);
  const mixups = confusions(t.data.attempts).filter((c) => c.count >= 2).slice(0, 3);
  const quizzes = t.data.sessions.filter((x) => x.finished_at && x.mode !== "daily").length;
  const mastered = patternsMastered(t.stats);
  const fresh = !t.data.attempts.length && !t.data.lessons.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Hero */}
      <section className="anim-rise relative overflow-hidden rounded-2xl bg-inverse p-5 text-on-inverse sm:p-6">
        <CandleDecor />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] opacity-75">{fresh ? "Welcome to Trading Training" : `Level ${t.level.level} · ${LEVEL_TITLES[t.level.level]}`}</p>
            <p className="display mt-0.5 text-[28px] font-semibold leading-tight sm:text-[32px]">{fresh ? "Learn to read charts, one candle at a time" : `${s.xp} XP today`}</p>
            {!fresh && (
              <div className="mt-3 max-w-sm">
                <div className="flex items-center justify-between text-[12px] opacity-80">
                  <span>{t.level.blocker ? `Next: ${t.level.blocker}` : "Top level reached"}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-warn transition-[width]" style={{ width: `${Math.round(t.level.progress * 100)}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <Flame className={cn("mx-auto h-7 w-7", t.streak.current > 0 ? "text-warn" : "opacity-40")} aria-hidden />
              <p className="num text-[22px] font-semibold leading-none">{t.streak.current}</p>
              <p className="text-[11px] opacity-70">day streak</p>
            </div>
            <div className="text-center">
              <Zap className="mx-auto h-7 w-7 text-warn" aria-hidden />
              <p className="num text-[22px] font-semibold leading-none">{t.xp.toLocaleString("en-IN")}</p>
              <p className="text-[11px] opacity-70">total XP</p>
            </div>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2">
          {nextL && (
            <Button variant="primary" size="lg" onClick={() => go({ tab: "learn", lesson: nextL.id })} icon={<BookOpen className="h-4 w-4" />}>
              {fresh ? "Start Lesson 1" : nextStarted ? "Continue lesson" : "Next lesson"}
            </Button>
          )}
          {!s.challengeDone && (
            <button type="button" onClick={() => go({ tab: "practice", run: "daily" })} className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 px-4 text-[15px] font-medium hover:bg-white/10">
              <Target className="h-4 w-4" aria-hidden /> Daily challenge
            </button>
          )}
        </div>
      </section>

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile icon={Zap} tone="warn" label="Today's score" value={`${s.xp} XP`} note={s.attempted ? `${s.correct}/${s.attempted} correct` : "Nothing yet today"} onClick={() => go({ tab: "scores" })} />
        <Tile icon={Target} label="Quiz accuracy today" value={pct(s.accuracy)} note={s.firstAttempted ? `First tries: ${s.firstCorrect}/${s.firstAttempted}` : "Answer a few questions"} />
        <Tile icon={Flame} tone="warn" label="Learning streak" value={`${t.streak.current} day${t.streak.current === 1 ? "" : "s"}`} note={`Best ${t.streak.best} · ${t.streak.freezes}/${MAX_FREEZES} freezes`} />
        <Tile icon={CalendarCheck} tone="ok" label="Learning days" value={t.streak.totalDays} note={`${t.streak.lastWeek} of the last 7`} />
        <Tile icon={BookOpen} label="Lessons completed" value={`${t.completed.size}/${LESSONS.length}`} onClick={() => go({ tab: "learn" })} />
        <Tile icon={Brain} label="Quizzes completed" value={quizzes} note={`${t.data.attempts.length} answers in all`} onClick={() => go({ tab: "review" })} />
        <Tile icon={CandlestickChart} tone="ok" label="Patterns mastered" value={`${mastered}/${PATTERN_TOPICS.length}`} note="80%+ over 5+ answers" />
        <Tile icon={Trophy} tone="warn" label="Level" value={`${t.level.level} · ${LEVEL_TITLES[t.level.level]}`} note={`Questions at ${DIFFICULTY_LABEL[t.difficulty]} level`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {/* Continue learning */}
          {nextL && (
            <Card title="Continue learning" icon={BookOpen}>
              <button type="button" onClick={() => go({ tab: "learn", lesson: nextL.id })} className="lift group flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3 text-left hover:border-future/50">
                <span className="display flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-future text-[17px] font-semibold text-white">{nextL.level}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{nextL.title}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{nextStarted ? "You started this one" : "Up next"} · {nextL.minutes} min · {nextL.summary}</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
            </Card>
          )}

          {/* Daily challenge */}
          <Card title="Daily challenge" icon={Target} action={<span className="text-[12px] text-ink-3">{formatDate(t.today, "medium")}</span>}>
            {s.challengeDone ? (
              <div className="flex items-center gap-3 rounded-xl bg-ok-soft p-3">
                <Check className="h-5 w-5 shrink-0 text-ok" aria-hidden />
                <p className="text-[14px]">Done for today — come back tomorrow for a new chart. {challengeResult(t.data, t.today)}</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-medium">{QUESTION_TYPE_LABEL[challenge.type]} · {DIFFICULTY_LABEL[challenge.difficulty]}</p>
                  <p className="text-[13px] text-ink-3">One chart question, the same for everyone today. +20 XP bonus for finishing.</p>
                </div>
                <Button variant="primary" onClick={() => go({ tab: "practice", run: "daily" })} icon={<ArrowRight className="h-4 w-4" />}>
                  Take it
                </Button>
              </div>
            )}
          </Card>

          {/* Week & month */}
          <Card title="This week" icon={CalendarCheck} action={<button type="button" onClick={() => go({ tab: "scores" })} className="text-[13px] font-medium text-brand hover:underline">Scoreboard</button>}>
            <WeekBars data={t.data} today={t.today} />
            <MonthLine data={t.data} today={t.today} />
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {/* Daily goal */}
          <Card title="Today's training" icon={goal.done ? Check : CircleDashed}>
            <ul className="flex flex-col gap-2">
              {goal.steps.map((st) => (
                <li key={st.label} className="flex items-center gap-2.5 text-[14px]">
                  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", st.done ? "border-ok bg-ok text-white" : "border-line-strong")}>{st.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}</span>
                  <span className={cn(st.done && "text-ink-3 line-through")}>{st.label}</span>
                </li>
              ))}
            </ul>
            <p className={cn("mt-3 text-[13px] font-medium", goal.done ? "text-ok" : "text-ink-3")}>{goal.done ? "Daily training complete 🎉" : `${s.attempted}/10 answers · ${s.lessons} lesson${s.lessons === 1 ? "" : "s"} today`}</p>
            {t.streak.frozen.includes(addDays(t.today, -1)) && (
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-future-ink"><Snowflake className="h-3.5 w-3.5" aria-hidden />A streak freeze covered yesterday — your streak is safe.</p>
            )}
          </Card>

          {/* Needs work */}
          <Card title="Areas to improve" icon={Sparkles}>
            {fresh ? (
              <p className="text-[13.5px] text-ink-3">Once you've answered some questions, the topics you find hardest show up here with a lesson to revisit.</p>
            ) : weak.length || revision.length || mixups.length ? (
              <div className="flex flex-col gap-2">
                {revision.length > 0 && (
                  <button type="button" onClick={() => go({ tab: "practice", run: "revision" })} className="flex items-center gap-3 rounded-xl bg-warn-soft p-3 text-left hover:opacity-90">
                    <Repeat className="h-5 w-5 shrink-0 text-warn" aria-hidden />
                    <span className="flex-1 text-[14px]"><span className="font-semibold">{revision.length} question{revision.length === 1 ? "" : "s"} to revise</span> — missed before, worth another look</span>
                    <ArrowRight className="h-4 w-4 text-ink-3" aria-hidden />
                  </button>
                )}
                {weak.slice(0, 4).map((w) => (
                  <div key={w.topic} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{topicLabel(w.topic)}</span>
                      <span className="block text-[12px] text-danger">{Math.round(w.recentAccuracy * 100)}% recently · {w.attempts} answers</span>
                    </span>
                    {TOPIC_BY_ID[w.topic] && <Button size="sm" onClick={() => go({ tab: "learn", lesson: TOPIC_BY_ID[w.topic].lesson })}>Lesson</Button>}
                    <Button size="sm" variant="ghost" onClick={() => go({ tab: "practice", run: "quiz", topic: w.topic })}>Practise</Button>
                  </div>
                ))}
                {mixups.map((m) => (
                  <p key={m.actual + m.said} className="rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
                    You've called a <span className="font-semibold text-ink">{PATTERN_BY_ID[m.actual]?.name ?? m.actual}</span> a <span className="font-semibold text-ink">{PATTERN_BY_ID[m.said]?.name ?? m.said}</span> {m.count} times.
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[13.5px] text-ink-3">Nothing stands out — keep practising across topics.</p>
            )}
          </Card>
        </div>
      </div>
      <p className="text-center text-[12px] text-ink-3">Trading Training is for education only. It isn't financial advice, and no chart pattern guarantees what price does next.</p>
    </div>
  );
}

function challengeResult(d: TrainingData, today: string): string {
  const s = d.sessions.find((x) => x.mode === "daily" && x.day === today);
  const a = s && d.attempts.find((x) => x.session_id === s.id);
  return a ? (a.correct ? `You got it right (+${a.xp + (s?.bonus_xp ?? 0)} XP).` : `Not this time, but you still earned +${a.xp + (s?.bonus_xp ?? 0)} XP for doing it.`) : "";
}

export function Card({ title, icon: Icon, action, children, className }: { title: string; icon?: typeof Flame; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("anim-rise rounded-2xl border border-line bg-surface p-4 sm:p-5", className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          {Icon && <Icon className="h-4 w-4 text-future" aria-hidden />}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** XP for each of the last 7 days as small bars. */
function WeekBars({ data, today }: { data: TrainingData; today: string }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const rows = days.map((d) => dayStats(data, d));
  const max = Math.max(30, ...rows.map((r) => r.xp));
  const total = rows.reduce((t, r) => t + r.xp, 0);
  const answered = rows.reduce((t, r) => t + r.attempted, 0);
  const correct = rows.reduce((t, r) => t + r.correct, 0);
  return (
    <div>
      <div className="flex h-28 items-end gap-2" role="img" aria-label={`XP over the last 7 days: ${rows.map((r) => r.xp).join(", ")}`}>
        {rows.map((r) => (
          <div key={r.day} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="num text-[10.5px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">{r.xp}</span>
            <div className={cn("w-full max-w-9 rounded-t-[4px] transition-[height]", r.day === today ? "bg-future" : r.xp ? "bg-future/45" : "bg-surface-3")} style={{ height: `${Math.max(4, (r.xp / max) * 80)}%` }} title={`${formatDate(r.day, "short")}: ${r.xp} XP, ${r.correct}/${r.attempted} correct`} />
            <span className={cn("text-[11px]", r.day === today ? "font-semibold text-ink" : "text-ink-3")}>{new Date(`${r.day}T00:00:00Z`).toLocaleDateString("en", { weekday: "narrow", timeZone: "UTC" })}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-ink-2">
        <span className="num font-semibold text-ink">{total} XP</span> this week · {answered ? `${Math.round((correct / answered) * 100)}% accuracy on ${answered} answers` : "no answers yet"}
      </p>
    </div>
  );
}

function MonthLine({ data, today }: { data: TrainingData; today: string }) {
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const rows = days.map((d) => dayStats(data, d));
  const xp = rows.reduce((t, r) => t + r.xp, 0);
  const active = rows.filter((r) => r.attempted || r.lessons).length;
  const lessons = rows.reduce((t, r) => t + r.lessons, 0);
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[12.5px] text-ink-2">
      <span>Last 30 days:</span>
      <span className="num font-medium text-ink">{xp} XP</span>
      <span>{active} active days</span>
      <span>{lessons} lessons</span>
      <Progress value={active / 30} tone="future" className="mt-1 w-full" label="Active days in the last 30" />
    </div>
  );
}

function CandleDecor() {
  const cs = [30, 45, 38, 55, 50, 68, 60, 78, 72, 88];
  return (
    <svg className="pointer-events-none absolute -right-2 bottom-0 h-full w-56 opacity-[0.12]" viewBox="0 0 220 120" aria-hidden>
      {cs.map((v, i) => {
        const up = i % 3 !== 1;
        return (
          <g key={i}>
            <line x1={12 + i * 21} x2={12 + i * 21} y1={120 - v - 14} y2={120 - v + 22} stroke="currentColor" strokeWidth="2" />
            <rect x={5 + i * 21} y={120 - v - (up ? 6 : 0)} width="14" height="18" fill={up ? "none" : "currentColor"} stroke="currentColor" strokeWidth="2" rx="2" />
          </g>
        );
      })}
    </svg>
  );
}
