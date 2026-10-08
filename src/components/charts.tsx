"use client";

import { useId } from "react";
import {
  Area, Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { formatDate, formatMonth } from "@/lib/dates";
import type { MonthRow } from "@/lib/engine/reports";
import { useFinance } from "@/lib/finance";
import { formatCompact, formatMoney } from "@/lib/money";

const axisTick = { fill: "var(--ink-3)", fontSize: 12 };

function TooltipBox({ title, rows, note }: { title: string; rows: { label: string; value: string; color?: string; dashed?: boolean }[]; note?: string }) {
  return (
    <div className="min-w-44 rounded-xl border border-line bg-surface px-3 py-2.5 text-[13px] shadow-panel">
      <p className="mb-1.5 font-semibold text-ink">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-2 text-ink-2">
            {r.color && (
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={r.dashed ? { backgroundImage: `repeating-linear-gradient(45deg, ${r.color} 0 2px, transparent 2px 4px)`, border: `1px solid ${r.color}` } : { background: r.color }}
              />
            )}
            {r.label}
          </span>
          <span className="num font-medium text-ink">{r.value}</span>
        </div>
      ))}
      {note && <p className="mt-1.5 text-[11.5px] text-future-ink">{note}</p>}
    </div>
  );
}

export function LegendKey({ items }: { items: { label: string; color: string; pattern?: "hatch" | "dash" }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          {it.pattern === "dash" ? (
            <svg width="18" height="8" aria-hidden>
              <line x1="0" y1="4" x2="18" y2="4" stroke={it.color} strokeWidth="2" strokeDasharray="3 3" />
            </svg>
          ) : (
            <span
              className="inline-block h-3 w-3 rounded-[3px]"
              style={it.pattern === "hatch" ? { backgroundImage: `repeating-linear-gradient(135deg, ${it.color} 0 2px, transparent 2px 5px)`, border: `1px solid ${it.color}` } : { background: it.color }}
              aria-hidden
            />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Monthly income vs expenses: past months solid, projected months hatched. */
export function CashFlowChart({ rows, height = 240 }: { rows: MonthRow[]; height?: number }) {
  const { ctx } = useFinance();
  const uid = useId().replace(/:/g, "");
  const data = rows.map((r) => ({ ...r, label: formatMonth(r.month, r.month.endsWith("-01")) }));
  return (
    <div>
      <LegendKey
        items={[
          { label: "Income", color: "var(--chart-in)" },
          { label: "Expenses", color: "var(--chart-out)" },
          { label: "Projected", color: "var(--ink-3)", pattern: "hatch" },
        ]}
      />
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <defs>
              <pattern id={`hin-${uid}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                <rect width="5" height="5" fill="var(--chart-in)" fillOpacity="0.18" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--chart-in)" strokeWidth="2.2" />
              </pattern>
              <pattern id={`hout-${uid}`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(135)">
                <rect width="5" height="5" fill="var(--chart-out)" fillOpacity="0.18" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="var(--chart-out)" strokeWidth="2.2" />
              </pattern>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={(v) => formatCompact(v, ctx)} />
            <Tooltip
              cursor={{ fill: "var(--surface-3)", fillOpacity: 0.6 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as MonthRow & { label: string };
                return (
                  <TooltipBox
                    title={formatMonth(r.month)}
                    rows={[
                      { label: "Income", value: formatMoney(r.income, ctx), color: "var(--chart-in)", dashed: r.projected },
                      { label: "Expenses", value: formatMoney(r.expenses, ctx), color: "var(--chart-out)", dashed: r.projected },
                      { label: "Left over", value: formatMoney(r.net, ctx) },
                      ...(r.invested ? [{ label: "Invested", value: formatMoney(r.invested, ctx) }] : []),
                    ]}
                    note={r.projected ? "Projected from your plans" : undefined}
                  />
                );
              }}
            />
            <Bar dataKey="income" maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.month} fill={d.projected ? `url(#hin-${uid})` : "var(--chart-in)"} />
              ))}
            </Bar>
            <Bar dataKey="expenses" maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.month} fill={d.projected ? `url(#hout-${uid})` : "var(--chart-out)"} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** One tick per month (the first point in each month), so labels never repeat. */
function monthTicks(dates: string[]): string[] {
  const out: string[] = [];
  let last = "";
  for (const d of dates) {
    const m = d.slice(0, 7);
    if (m !== last) {
      out.push(d);
      last = m;
    }
  }
  return out;
}

export interface SeriesPoint {
  date: string;
  actual?: number | null;
  projected?: number | null;
}

/** Net worth (or any single measure): actual history solid, projection dashed violet. */
export function TrendChart({ points, height = 240, label = "Net worth", today }: { points: SeriesPoint[]; height?: number; label?: string; today?: string }) {
  const { ctx } = useFinance();
  const uid = useId().replace(/:/g, "");
  const hasProjection = points.some((p) => p.projected != null);
  return (
    <div>
      <LegendKey items={[{ label: "Actual", color: "var(--chart-actual)" }, ...(hasProjection ? [{ label: "Projected (estimate)", color: "var(--chart-future)", pattern: "dash" as const }] : [])]} />
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`wash-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-actual)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--chart-actual)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="date" ticks={monthTicks(points.map((p) => p.date))} tick={axisTick} axisLine={false} tickLine={false} minTickGap={28} tickFormatter={(d: string) => formatMonth(d.slice(0, 7))} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => formatCompact(v, ctx)} domain={["auto", "auto"]} />
            {today && <ReferenceLine x={today} stroke="var(--line-strong)" strokeDasharray="0" label={{ value: "Today", position: "insideTopLeft", fill: "var(--ink-3)", fontSize: 11 }} />}
            <Tooltip
              cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as SeriesPoint;
                const isProj = p.actual == null;
                const v = isProj ? p.projected : p.actual;
                return <TooltipBox title={formatDate(p.date)} rows={[{ label, value: formatMoney(v ?? 0, ctx), color: isProj ? "var(--chart-future)" : "var(--chart-actual)", dashed: isProj }]} note={isProj ? "Estimate" : undefined} />;
              }}
            />
            <Area type="monotone" dataKey="actual" stroke="none" fill={`url(#wash-${uid})`} isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey="actual" stroke="var(--chart-actual)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }} isAnimationActive={false} connectNulls={false} />
            <Line
              type="monotone"
              dataKey="projected"
              stroke="var(--chart-future)"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
              isAnimationActive={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface ScenarioSeries {
  key: "conservative" | "base" | "optimistic";
  label: string;
  points: { date: string; value: number }[];
}

const SC_COLOR = { conservative: "var(--sc-cons)", base: "var(--sc-base)", optimistic: "var(--sc-opt)" };

/** Three scenarios on one axis (same measure), with a legend and end labels via tooltip. */
export function ScenarioChart({ series, height = 260, metricLabel }: { series: ScenarioSeries[]; height?: number; metricLabel: string }) {
  const { ctx } = useFinance();
  const dates = series[0]?.points.map((p) => p.date) ?? [];
  const data = dates.map((d, i) => {
    const row: Record<string, number | string> = { date: d };
    for (const s of series) row[s.key] = s.points[i]?.value ?? 0;
    return row;
  });
  return (
    <div>
      <LegendKey items={series.map((s) => ({ label: s.label, color: SC_COLOR[s.key], pattern: "dash" as const }))} />
      <div style={{ height }} className="mt-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="date" ticks={monthTicks(dates)} tick={axisTick} axisLine={false} tickLine={false} minTickGap={28} tickFormatter={(d: string) => formatMonth(d.slice(0, 7))} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={56} tickFormatter={(v) => formatCompact(v, ctx)} domain={["auto", "auto"]} />
            <ReferenceLine y={0} stroke="var(--line-strong)" />
            <Tooltip
              cursor={{ stroke: "var(--line-strong)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as Record<string, number | string>;
                return (
                  <TooltipBox
                    title={`${metricLabel} · ${formatDate(r.date as string)}`}
                    rows={series.map((s) => ({ label: s.label, value: formatMoney(r[s.key] as number, ctx), color: SC_COLOR[s.key], dashed: true }))}
                    note="Estimates"
                  />
                );
              }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={SC_COLOR[s.key]}
                strokeWidth={s.key === "base" ? 2.5 : 2}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export const ALLOC_LABEL: Record<string, string> = {
  equity: "Equity",
  debt: "Debt",
  cash: "Cash & bank",
  gold: "Gold",
  real_estate: "Real estate",
  hybrid: "Hybrid",
  other: "Other",
};
const ALLOC_ORDER = ["equity", "debt", "cash", "gold", "real_estate", "hybrid", "other"];

/** One stacked bar with a 2px surface gap between segments, plus a labelled list. */
export function AllocationBar({ items }: { items: { key: string; amount: number; share: number }[] }) {
  const { ctx } = useFinance();
  const sorted = [...items].sort((a, b) => ALLOC_ORDER.indexOf(a.key) - ALLOC_ORDER.indexOf(b.key));
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Asset allocation">
        {sorted.map((it) => (
          <div key={it.key} style={{ width: `${it.share * 100}%`, background: `var(--alloc-${it.key})` }} title={`${ALLOC_LABEL[it.key]} ${Math.round(it.share * 100)}%`} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {sorted.map((it) => (
          <li key={it.key} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: `var(--alloc-${it.key})` }} aria-hidden />
              {ALLOC_LABEL[it.key] ?? it.key}
            </span>
            <span className="num text-ink">
              {formatCompact(it.amount, ctx)} <span className="text-ink-3">· {Math.round(it.share * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranked horizontal bars (single hue — magnitude only). */
export function RankedBars({ items, max, valueLabel }: { items: { name: string; amount: number; hint?: string }[]; max?: number; valueLabel?: (n: number) => string }) {
  const { ctx } = useFinance();
  const top = max ?? Math.max(1, ...items.map((i) => i.amount));
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((it) => (
        <li key={it.name}>
          <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
            <span className="truncate text-ink">{it.name}</span>
            <span className="num shrink-0 text-ink-2">{valueLabel ? valueLabel(it.amount) : formatMoney(it.amount, ctx)}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-surface-3">
            <div className="h-2 rounded-full bg-[var(--chart-out)]" style={{ width: `${Math.max(2, (it.amount / top) * 100)}%` }} />
          </div>
          {it.hint && <p className="mt-0.5 text-[12px] text-ink-3">{it.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
