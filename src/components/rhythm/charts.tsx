"use client";

import { useId } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { formatDate, formatMonth, formatMonthLong } from "@/lib/dates";
import { WEEKDAY_SHORT, monthCells, type DaySummary, type HabitMonth, type MonthReport, type WeekRow } from "@/lib/rhythm";
import { LegendKey } from "../charts";

const tick = { fill: "var(--ink-3)", fontSize: 12 };
const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function Tip({ title, rows, note }: { title: string; rows: { label: string; value: string; color?: string; hatch?: boolean }[]; note?: string }) {
  return (
    <div className="min-w-40 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] shadow-panel">
      <p className="mb-1 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-ink-2">
            {r.color && (
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={r.hatch ? { backgroundImage: `repeating-linear-gradient(135deg, ${r.color} 0 2px, transparent 2px 4px)`, border: `1px solid ${r.color}` } : { background: r.color }}
              />
            )}
            {r.label}
          </span>
          <span className="num font-medium text-ink">{r.value}</span>
        </div>
      ))}
      {note && <p className="mt-1 text-[11.5px] text-ink-3">{note}</p>}
    </div>
  );
}

/** Graph 1 — each day's completion rate. Days with nothing counted are left out (not drawn as 0%). */
export function DailyTrendChart({ days, today, height = 220 }: { days: DaySummary[]; today: string; height?: number }) {
  const data = days.map((d) => ({ day: Number(d.date.slice(8)), date: d.date, rate: d.date <= today && d.tally.rate != null ? Math.round(d.tally.rate * 100) : null, t: d.tally, open: d.date === today && d.tally.pending > 0 }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="day" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={14} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={44} />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return (
                <Tip
                  title={formatDate(p.date, "long")}
                  rows={p.rate == null ? [{ label: p.date > today ? "Still to come" : "Nothing counted", value: "—" }] : [{ label: "Completed", value: `${p.t.completed} of ${p.t.eligible} · ${p.rate}%` }]}
                  note={p.open ? "Today so far — still time to tick more." : p.t.skipped ? `${p.t.skipped} skipped (not counted)` : undefined}
                />
              );
            }}
          />
          <Line
            type="linear"
            dataKey="rate"
            stroke="var(--brand)"
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: (typeof data)[number] }) => {
              const { cx, cy, payload, index } = props;
              if (cx == null || cy == null || payload?.rate == null) return <g key={index} />;
              // Today, while things are still to do: an open ring — the number can still go up.
              return payload.open ? (
                <circle key={index} cx={cx} cy={cy} r={4} fill="var(--surface)" stroke="var(--brand)" strokeWidth={2} />
              ) : (
                <circle key={index} cx={cx} cy={cy} r={3} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
              );
            }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Graph 2 — completion rate per activity. */
export function HabitBarsChart({ perHabit, onSelect }: { perHabit: HabitMonth[]; onSelect?: (id: string) => void }) {
  const rows = perHabit
    .filter((p) => p.tally.rate != null)
    .map((p) => ({ id: p.habit.id, name: `${p.habit.icon ? `${p.habit.icon} ` : ""}${p.habit.name}`, rate: Math.round(p.tally.rate! * 100), t: p.tally }))
    .sort((a, b) => b.rate - a.rate);
  if (!rows.length) return <p className="text-[13px] text-ink-3">Nothing counted yet this month.</p>;
  return (
    <div style={{ height: rows.length * 38 + 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="name" tick={{ ...tick, fill: "var(--ink-2)" }} tickLine={false} axisLine={false} width={150} />
          <Tooltip
            cursor={{ fill: "var(--surface-3)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !p) return null;
              return <Tip title={p.name} rows={[{ label: "Done", value: `${p.t.completed} of ${p.t.eligible}` }, { label: "Missed", value: String(p.t.missed) }, { label: "Skipped", value: String(p.t.skipped) }]} />;
            }}
          />
          <Bar dataKey="rate" fill="var(--brand)" radius={[0, 4, 4, 0]} barSize={18} minPointSize={2} isAnimationActive={false} onClick={(d) => onSelect?.((d as unknown as { id: string }).id)} className={cn(onSelect && "cursor-pointer")}>
            <LabelList dataKey="rate" position="right" formatter={(v) => `${v}%`} style={{ fill: "var(--ink-2)", fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Graph 3 — done, missed and still-to-do per day (skipped shown apart, not counted). */
export function StackedDaysChart({ days, today, height = 220 }: { days: DaySummary[]; today: string; height?: number }) {
  const uid = useId().replace(/:/g, "");
  const data = days.map((d) => ({
    day: Number(d.date.slice(8)),
    date: d.date,
    completed: d.date <= today ? d.tally.completed : 0,
    missed: d.date <= today ? d.tally.missed : 0,
    pending: d.date <= today ? d.tally.pending : 0,
    skipped: d.date <= today ? d.tally.skipped : 0,
  }));
  return (
    <div>
      <LegendKey
        items={[
          { label: "Done", color: "var(--rh-done)" },
          { label: "Missed", color: "var(--rh-missed)" },
          { label: "To do today", color: "var(--ink-3)" },
          { label: "Skipped (not counted)", color: "var(--ink-3)", pattern: "hatch" },
        ]}
      />
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="18%">
            <defs>
              <pattern id={`sk-${uid}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(135)">
                <rect width="5" height="5" fill="var(--ink-3)" fillOpacity="0.12" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ink-3)" strokeWidth="1.6" />
              </pattern>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="day" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} interval="preserveStartEnd" minTickGap={14} />
            <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={36} />
            <Tooltip
              cursor={{ fill: "var(--surface-3)", opacity: 0.5 }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !p) return null;
                if (p.date > today) return <Tip title={formatDate(p.date, "long")} rows={[{ label: "Still to come", value: "—" }]} />;
                return (
                  <Tip
                    title={formatDate(p.date, "long")}
                    rows={[
                      { label: "Done", value: String(p.completed), color: "var(--rh-done)" },
                      { label: "Missed", value: String(p.missed), color: "var(--rh-missed)" },
                      ...(p.pending ? [{ label: "To do", value: String(p.pending), color: "var(--ink-3)" }] : []),
                      ...(p.skipped ? [{ label: "Skipped", value: String(p.skipped), color: "var(--ink-3)", hatch: true }] : []),
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="completed" stackId="s" fill="var(--rh-done)" stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="missed" stackId="s" fill="var(--rh-missed)" stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="pending" stackId="s" fill="var(--ink-3)" fillOpacity={0.45} stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
            <Bar dataKey="skipped" stackId="s" fill={`url(#sk-${uid})`} stroke="var(--surface)" strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function weekLabel(w: WeekRow) {
  return w.from === w.to ? formatDate(w.from, "short") : `${formatDate(w.from, "short")}–${Number(w.to.slice(8))}`;
}

/** Graph 4 — each week's rate from its own counts (a short last week is fine). */
export function WeeklyChart({ weeks, height = 200 }: { weeks: WeekRow[]; height?: number }) {
  const data = weeks.map((w) => ({ label: w.label.replace("Week ", "W"), range: weekLabel(w), rate: w.tally.rate == null ? null : Math.round(w.tally.rate * 100), t: w.tally }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={44} />
          <Tooltip
            cursor={{ fill: "var(--surface-3)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return <Tip title={`${p.label.replace("W", "Week ")} · ${p.range}`} rows={p.rate == null ? [{ label: "Nothing counted", value: "—" }] : [{ label: "Completed", value: `${p.t.completed} of ${p.t.eligible} · ${p.rate}%` }]} note={p.t.upcoming ? `${p.t.upcoming} still to come` : undefined} />;
            }}
          />
          <Bar dataKey="rate" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
            <LabelList dataKey="rate" position="top" formatter={(v) => (v == null ? "" : `${v}%`)} style={{ fill: "var(--ink-2)", fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HabitWeeksChart({ weeks }: { weeks: WeekRow[] }) {
  return <WeeklyChart weeks={weeks} height={170} />;
}

/** Graph 5 — consistency heatmap: one hue, darker = more done. Zero and "nothing scheduled" look different. */
export function Heatmap({ report, weekStart, today, onSelect }: { report: MonthReport; weekStart: 0 | 1; today: string; onSelect?: (date: string) => void }) {
  const byDate = new Map(report.days.map((d) => [d.date, d]));
  const cells = monthCells(report.month, weekStart);
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT[(i + weekStart) % 7]);
  const shade = (r: number) => `color-mix(in oklab, var(--rh-done) ${Math.round(22 + r * 78)}%, var(--surface-2))`;
  return (
    <div>
      <div className="grid max-w-md grid-cols-7 gap-1">
        {heads.map((h) => (
          <div key={h} className="text-center text-[11px] font-medium text-ink-3">
            {h.slice(0, 2)}
          </div>
        ))}
        {cells.map(({ date, inMonth }) => {
          if (!inMonth) return <div key={date} aria-hidden />;
          const d = byDate.get(date)!;
          const t = d.tally;
          const counted = date <= today && t.eligible > 0;
          const label = `${formatDate(date, "long")}: ${counted ? `${t.completed} of ${t.eligible} (${pct(t.rate)})` : date > today ? "still to come" : "nothing counted"}`;
          return (
            <button
              key={date}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => onSelect?.(date)}
              className={cn("num relative flex aspect-square items-center justify-center rounded-md text-[11px] font-medium", !counted && (date > today ? "border border-line text-ink-3" : "bg-surface-3 text-ink-3"), counted && t.completed === 0 && "border border-danger/50 bg-surface text-danger")}
              style={counted && t.completed > 0 ? { background: shade(t.rate ?? 0), color: (t.rate ?? 0) > 0.55 ? "white" : "var(--ink)" } : undefined}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          Less
          {[0.1, 0.4, 0.7, 1].map((r) => (
            <span key={r} className="inline-block h-3.5 w-3.5 rounded-[4px]" style={{ background: shade(r) }} aria-hidden />
          ))}
          More done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-[4px] border border-danger/50" aria-hidden />
          None done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-[4px] bg-surface-3" aria-hidden />
          Nothing scheduled
        </span>
      </div>
    </div>
  );
}

/** History — completion rate per month. */
export function MonthlyTrendChart({ rows, height = 200 }: { rows: { month: string; rate: number | null; completed: number; eligible: number }[]; height?: number }) {
  const data = [...rows].reverse().map((r) => ({ ...r, label: formatMonth(r.month, r.month.endsWith("-01")), v: r.rate == null ? null : Math.round(r.rate * 100) }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tick={tick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={44} />
          <Tooltip
            cursor={{ stroke: "var(--line-strong)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !p) return null;
              return <Tip title={formatMonthLong(p.month)} rows={[{ label: "Completed", value: p.v == null ? "—" : `${p.completed} of ${p.eligible} · ${p.v}%` }]} />;
            }}
          />
          <Line type="linear" dataKey="v" stroke="var(--brand)" strokeWidth={2} dot={{ r: 4, fill: "var(--brand)", stroke: "var(--surface)", strokeWidth: 2 }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
