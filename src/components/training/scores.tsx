"use client";

import { Award, BarChart3, Brain, CalendarDays, Check, Clock, Medal, Target, ThumbsDown, ThumbsUp, TrendingUp, X, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { addDays, formatDate } from "@/lib/dates";
import { TOPICS, topicLabel } from "@/lib/training/content";
import { accuracyBy, achievements, dailySeries, filterAttempts, firstVsRepeat, groupSeries, mostMissed, type AnalyticsFilter } from "@/lib/training/engine";
import { DIFFICULTY_LABEL, type Difficulty } from "@/lib/training/types";
import type { TrainingMode } from "@/lib/types";
import { LegendKey } from "../charts";
import { EmptyState } from "../ui/misc";
import { ChipGroup } from "../v2/ui";
import { useTraining } from "./actions";
import { Card, Tile } from "./dashboard";
import { MODE_LABEL } from "./runner";
import { useTrainingView } from "./nav";

const tick = { fill: "var(--ink-3)", fontSize: 12 };
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const shortDay = (d: string) => formatDate(d, "short");

function Tip({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] shadow-panel">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-ink-2">
            {r.color && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="num font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type Range = "7" | "30" | "90" | "365";

export function ScoresScreen() {
  const t = useTraining();
  const s = t.todayStats;
  const [range, setRange] = useState<Range>("30");
  const [topic, setTopic] = useState("");
  const [mode, setMode] = useState<TrainingMode | "">("");
  const [diff, setDiff] = useState<"all" | "1" | "2" | "3">("all");
  const [group, setGroup] = useState<"week" | "month">("week");
  const f: AnalyticsFilter = useMemo(
    () => ({ from: addDays(t.today, -(Number(range) - 1)), to: t.today, topic: topic || null, mode: (mode || null) as TrainingMode | null, difficulty: diff === "all" ? null : (Number(diff) as Difficulty) }),
    [t.today, range, topic, mode, diff],
  );
  const rows = useMemo(() => dailySeries(t.data, f), [t.data, f]);
  const at = useMemo(() => filterAttempts(t.data.attempts, f), [t.data.attempts, f]);
  const grouped = groupSeries(rows, group).map((g) => ({ ...g, label: group === "month" ? new Date(`${g.day}-01T00:00:00Z`).toLocaleDateString("en", { month: "short", timeZone: "UTC" }) : shortDay(g.day) }));
  const fr = firstVsRepeat(at);
  const missed = mostMissed(at);
  const byDiff = accuracyBy(at, (a) => a.difficulty).sort((a, b) => a.key - b.key);
  const byMode = accuracyBy(at, (a) => a.mode).sort((a, b) => b.attempts - a.attempts);
  const byTopic = accuracyBy(at, (a) => a.topic).sort((a, b) => b.attempts - a.attempts).slice(0, 12);
  const preds = groupSeries(rows, "week").filter((w) => w.predictions > 0).map((w) => ({ label: shortDay(w.day), rate: Math.round((w.predictionsRight / w.predictions) * 100), n: w.predictions, ok: w.predictionsRight }));
  const unlocked = achievements(t.data, t.today);
  const nothing = !t.data.attempts.length && !t.data.lessons.length;

  return (
    <div className="flex flex-col gap-4">
      <Card title={`Today · ${formatDate(t.today, "long")}`} icon={Zap}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="XP earned" value={s.xp} icon={Zap} tone="warn" />
          <Tile label="Questions" value={s.attempted} note={`${s.correct} right · ${s.incorrect} wrong`} icon={Brain} />
          <Tile label="Accuracy" value={pct(s.accuracy)} note={s.firstAttempted ? `First tries ${s.firstCorrect}/${s.firstAttempted}` : undefined} icon={Target} />
          <Tile label="Predictions" value={s.predictions ? `${s.predictionsRight}/${s.predictions}` : "—"} note={s.predictions ? pct(s.predictionsRight / s.predictions) : "None yet"} icon={TrendingUp} />
          <Tile label="Lessons" value={s.lessons} icon={Award} tone="ok" />
          <Tile label="Time learning" value={`${s.minutes} min`} icon={Clock} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium", s.challengeDone ? "bg-ok-soft text-ok" : "bg-surface-3 text-ink-2")}>
            {s.challengeDone ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} Daily challenge {s.challengeDone ? "done" : "not done yet"}
          </span>
          {s.best && <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 font-medium text-ok"><ThumbsUp className="h-3.5 w-3.5" />Best: {topicLabel(s.best)}</span>}
          {s.weakest && <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-2.5 py-1 font-medium text-warn"><ThumbsDown className="h-3.5 w-3.5" />Weakest: {topicLabel(s.weakest)}</span>}
        </div>
      </Card>

      {nothing ? (
        <EmptyState icon={BarChart3} title="Your charts will fill in as you learn" body="Every answer, lesson and challenge is recorded and turned into trends here — nothing is sample data." />
      ) : (
        <>
          {/* Filters: one row above the charts */}
          <div className="sticky top-14 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-line/70 bg-paper/90 px-4 py-2 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-3">
            <ChipGroup<Range> label="Date range" value={range} onChange={setRange} options={[{ id: "7", label: "7 days" }, { id: "30", label: "30 days" }, { id: "90", label: "90 days" }, { id: "365", label: "Year" }]} />
            <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic" className="h-8 max-w-44 rounded-full border border-line bg-surface px-3 text-[12.5px]">
              <option value="">All topics</option>
              {TOPICS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <select value={mode} onChange={(e) => setMode(e.target.value as TrainingMode | "")} aria-label="Training mode" className="h-8 rounded-full border border-line bg-surface px-3 text-[12.5px]">
              <option value="">All modes</option>
              {(Object.keys(MODE_LABEL) as TrainingMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
            <ChipGroup<"all" | "1" | "2" | "3"> label="Difficulty" value={diff} onChange={setDiff} options={[{ id: "all", label: "All levels" }, { id: "1", label: "Beginner" }, { id: "2", label: "Intermediate" }, { id: "3", label: "Advanced" }]} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Daily score (XP)" icon={Zap}>
              <ChartBox>
                <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={24} />
                  <YAxis tick={tick} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "var(--surface-3)", opacity: 0.5 }} content={({ active, payload }) => { const p = payload?.[0]?.payload; return active && p ? <Tip title={formatDate(p.day, "long")} rows={[{ label: "XP", value: String(p.xp), color: "var(--future)" }, { label: "Answers", value: `${p.correct}/${p.attempted} right` }, { label: "Lessons", value: String(p.lessons) }]} /> : null; }} />
                  <Bar dataKey="xp" fill="var(--future)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ChartBox>
            </Card>
            <Card title="Daily quiz accuracy" icon={Target}>
              <ChartBox>
                <LineChart data={rows.map((r) => ({ ...r, rate: r.accuracy == null ? null : Math.round(r.accuracy * 100) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={shortDay} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={24} />
                  <YAxis domain={[0, 100]} ticks={[0, 50, 80, 100]} tickFormatter={(v) => `${v}%`} tick={tick} tickLine={false} axisLine={false} width={44} />
                  <Tooltip cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }} content={({ active, payload }) => { const p = payload?.[0]?.payload; return active && p ? <Tip title={formatDate(p.day, "long")} rows={[{ label: "Accuracy", value: p.rate == null ? "No answers" : `${p.rate}%`, color: "var(--brand)" }, { label: "Answers", value: `${p.correct}/${p.attempted}` }]} /> : null; }} />
                  <Line dataKey="rate" stroke="var(--brand)" strokeWidth={2} dot={{ r: 3, fill: "var(--brand)", stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ChartBox>
            </Card>
          </div>

          <Card title="Learning activity" icon={CalendarDays} action={<ChipGroup<"week" | "month"> label="Group by" value={group} onChange={setGroup} options={[{ id: "week", label: "Weekly" }, { id: "month", label: "Monthly" }]} />}>
            <LegendKey items={[{ label: "Answered", color: "var(--line-strong)" }, { label: "Correct", color: "var(--brand)" }, { label: "Lessons", color: "var(--future)" }]} />
            <ChartBox height={220}>
              <BarChart data={grouped} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={12} />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                <Tooltip cursor={{ fill: "var(--surface-3)", opacity: 0.5 }} content={({ active, payload }) => { const p = payload?.[0]?.payload; return active && p ? <Tip title={group === "week" ? `Week of ${formatDate(p.day, "medium")}` : p.label} rows={[{ label: "Answered", value: String(p.attempted), color: "var(--line-strong)" }, { label: "Correct", value: String(p.correct), color: "var(--brand)" }, { label: "Accuracy", value: pct(p.accuracy) }, { label: "Lessons", value: String(p.lessons), color: "var(--future)" }, { label: "XP", value: String(p.xp) }]} /> : null; }} />
                <Bar dataKey="attempted" fill="var(--line-strong)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="correct" fill="var(--brand)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="lessons" fill="var(--future)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartBox>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Prediction accuracy over time" icon={TrendingUp}>
              {preds.length ? (
                <ChartBox height={180}>
                  <LineChart data={preds} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
                    <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} tick={tick} tickLine={false} axisLine={false} width={44} />
                    <Tooltip content={({ active, payload }) => { const p = payload?.[0]?.payload; return active && p ? <Tip title={`Week of ${p.label}`} rows={[{ label: "Direction right", value: `${p.ok}/${p.n} · ${p.rate}%`, color: "var(--chart-in)" }]} /> : null; }} />
                    <Line dataKey="rate" stroke="var(--chart-in)" strokeWidth={2} dot={{ r: 4, fill: "var(--chart-in)", stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
                  </LineChart>
                </ChartBox>
              ) : (
                <p className="text-[13.5px] text-ink-3">No predictions in this range yet. Try “Predict the next move”.</p>
              )}
            </Card>
            <Card title="First tries vs repeats" icon={Medal}>
              <div className="grid grid-cols-2 gap-3">
                <Tile label="First-attempt accuracy" value={pct(fr.first.accuracy)} note={`${fr.first.attempts} answers`} />
                <Tile label="Repeat-attempt accuracy" value={pct(fr.repeat.accuracy)} note={`${fr.repeat.attempts} answers`} />
              </div>
              <p className="mt-2 text-[12.5px] text-ink-3">First tries show what you knew; repeats show what you learned from feedback.</p>
              <h3 className="mt-4 text-[13.5px] font-semibold">By difficulty</h3>
              <Bars rows={byDiff.map((d) => ({ label: DIFFICULTY_LABEL[d.key as Difficulty], value: d.accuracy, note: `${d.correct}/${d.attempts}` }))} />
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card title="Accuracy by topic" icon={Target}>
              {byTopic.length ? <Bars rows={byTopic.map((d) => ({ label: topicLabel(d.key), value: d.accuracy, note: `${d.correct}/${d.attempts}` }))} /> : <p className="text-[13.5px] text-ink-3">No answers in this range.</p>}
            </Card>
            <div className="flex flex-col gap-4">
              <Card title="By training mode" icon={Brain}>
                {byMode.length ? <Bars rows={byMode.map((d) => ({ label: MODE_LABEL[d.key as TrainingMode], value: d.accuracy, note: `${d.correct}/${d.attempts}` }))} /> : <p className="text-[13.5px] text-ink-3">No answers in this range.</p>}
              </Card>
              <Card title="Most misunderstood" icon={ThumbsDown}>
                {missed.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {missed.map((m) => (
                      <li key={m.topic} className="flex items-center justify-between gap-3 text-[13.5px]">
                        <span className="truncate">{topicLabel(m.topic)}</span>
                        <span className="num shrink-0 text-danger">{m.misses} missed · {pct(m.accuracy)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13.5px] text-ink-3">No topic missed twice in this range. 👏</p>
                )}
              </Card>
            </div>
          </div>
        </>
      )}

      <Card title="Learning streak calendar" icon={CalendarDays} action={<span className="text-[12.5px] text-ink-3">Current {t.streak.current} · best {t.streak.best}</span>}>
        <StreakCalendar />
      </Card>

      <Card title="Achievements" icon={Award} action={<span className="num text-[12.5px] text-ink-3">{unlocked.filter((a) => a.on).length}/{unlocked.length}</span>}>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {unlocked.map(({ def, on }) => (
            <li key={def.id} className={cn("flex items-start gap-2.5 rounded-xl border p-3", on ? "border-warn/40 bg-warn-soft/50" : "border-line bg-surface-2/50")}>
              <span className={cn("text-[24px] leading-none", !on && "grayscale opacity-40")} aria-hidden>{def.icon}</span>
              <span className="min-w-0">
                <span className={cn("block text-[13.5px] font-semibold", !on && "text-ink-2")}>{def.title}</span>
                <span className="block text-[12px] text-ink-3">{def.body}</span>
                <span className={cn("mt-0.5 block text-[11.5px]", on ? "font-medium text-warn" : "text-ink-3")}>{on ? `Unlocked ${formatDate(on, "medium")}` : "Locked"}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function ChartBox({ children, height = 200 }: { children: React.ReactElement; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal accuracy bars with the share labelled (colour follows the band: green ≥80%, amber ≥50%, red below). */
function Bars({ rows }: { rows: { label: string; value: number; note?: string }[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
          <span className="truncate text-ink-2" title={r.label}>{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-3">
            <span className={cn("block h-full rounded-full", r.value >= 0.8 ? "bg-ok" : r.value >= 0.5 ? "bg-warn" : "bg-danger")} style={{ width: `${Math.max(3, r.value * 100)}%` }} />
          </span>
          <span className="num w-20 text-right text-ink">
            {Math.round(r.value * 100)}% {r.note && <span className="text-[11.5px] text-ink-3">{r.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The last 18 weeks: one square per day, shaded by XP. Frozen days (streak kept) are marked. */
function StreakCalendar() {
  const t = useTraining();
  const [, go] = useTrainingView();
  const weeks = 18;
  const todayWd = (new Date(`${t.today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(t.today, -(weeks - 1) * 7 - todayWd);
  const xpByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of dailySeries(t.data, { from: start, to: t.today })) m.set(r.day, r.xp);
    return m;
  }, [t.data, start, t.today]);
  const max = Math.max(1, ...xpByDay.values());
  const frozen = new Set(t.streak.frozen);
  const level = (xp: number) => (xp <= 0 ? 0 : xp < max * 0.25 ? 1 : xp < max * 0.5 ? 2 : xp < max * 0.75 ? 3 : 4);
  const SHADE = ["var(--surface-3)", "color-mix(in oklab, var(--future) 30%, var(--surface))", "color-mix(in oklab, var(--future) 55%, var(--surface))", "color-mix(in oklab, var(--future) 78%, var(--surface))", "var(--future)"];
  return (
    <div>
      <div className="no-scrollbar overflow-x-auto">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]" role="grid" aria-label="Learning days over the last 18 weeks">
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const d = addDays(start, i);
            if (d > t.today) return <span key={d} className="h-3.5 w-3.5" />;
            const xp = xpByDay.get(d) ?? 0;
            return (
              <button
                key={d}
                type="button"
                onClick={() => go({ tab: "review" })}
                title={`${formatDate(d, "medium")}: ${xp ? `${xp} XP` : frozen.has(d) ? "streak freeze used" : "no training"}`}
                aria-label={`${formatDate(d, "medium")}: ${xp} XP`}
                className={cn("h-3.5 w-3.5 rounded-[3px]", d === t.today && "ring-2 ring-future/50", frozen.has(d) && "outline outline-1 outline-dashed outline-future")}
                style={{ background: SHADE[level(xp)] }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
        Less {SHADE.map((c, i) => <span key={i} className="inline-block h-3 w-3 rounded-[3px]" style={{ background: c }} />)} More
        <span className="ml-3 inline-block h-3 w-3 rounded-[3px] outline outline-1 outline-dashed outline-future" /> Freeze used
      </div>
    </div>
  );
}
