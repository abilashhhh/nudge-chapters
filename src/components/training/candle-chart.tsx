"use client";

import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, RotateCcw, SkipForward, Table2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import { aggregate, bollinger, ema, macd, rsi, sma, vwap, type Candle, type Series } from "@/lib/training/candles";
import { TIMEFRAME_LABEL, type Annotation, type AnatomySpec, type ChartSpec, type Overlay, type Timeframe, type Tone } from "@/lib/training/types";

const TONE: Record<Tone, string> = { up: "var(--candle-up)", down: "var(--candle-down)", neutral: "var(--ink-3)", brand: "var(--brand)", future: "var(--future)" };
const OVERLAY_COLOR = ["var(--chart-in)", "var(--chart-out)", "var(--future)"];
const fmt = (n: number) => n.toFixed(2);
const fmtVol = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(Math.round(v)));

/** Higher timeframes offered when a chart allows switching (each made from the chart's own candles). */
const STEPS: Record<Timeframe, { tf: Timeframe; factor: number }[]> = {
  "1m": [{ tf: "1m", factor: 1 }, { tf: "5m", factor: 5 }, { tf: "15m", factor: 15 }],
  "5m": [{ tf: "5m", factor: 1 }, { tf: "15m", factor: 3 }, { tf: "1h", factor: 12 }],
  "15m": [{ tf: "15m", factor: 1 }, { tf: "1h", factor: 4 }],
  "1h": [{ tf: "1h", factor: 1 }],
  "1D": [{ tf: "1D", factor: 1 }, { tf: "1W", factor: 5 }],
  "1W": [{ tf: "1W", factor: 1 }],
};

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    setW(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function overlaySeries(o: Overlay, cs: Candle[]): { label: string; lines: Series[] } {
  const closes = cs.map((c) => c.c);
  if (o.kind === "sma" || o.kind === "ema") return { label: `${o.kind.toUpperCase()} ${o.period}`, lines: [(o.kind === "sma" ? sma : ema)(closes, o.period)] };
  if (o.kind === "vwap") return { label: "VWAP", lines: [vwap(cs)] };
  const b = bollinger(closes, o.period ?? 20, o.k ?? 2);
  return { label: `Bollinger ${o.period ?? 20}, ${o.k ?? 2}`, lines: [b.upper, b.mid, b.lower] };
}

export interface CandleChartProps {
  spec: ChartSpec;
  height?: number;
  /** For hidden candles: how many have been revealed so far. */
  revealed?: number;
  /** No controls, no readout (thumbnails, side-by-side comparisons). */
  compact?: boolean;
  className?: string;
  /** Show the data-source badge. Default true. */
  badge?: boolean;
}

/**
 * Candlestick chart for lessons and exercises: tap or hover a candle to read its open, high, low, close and volume;
 * zoom, pan, switch to a higher timeframe and replay candle by candle where the chart allows it. Hidden candles stay
 * hidden — they aren't even used to scale the chart — until revealed.
 */
export function CandleChart({ spec, height = 260, revealed = 0, compact, className, badge = true }: CandleChartProps) {
  const uid = useId().replace(/:/g, "");
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const steps = spec.timeframes ? STEPS[spec.timeframe] : [{ tf: spec.timeframe, factor: 1 }];
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[Math.min(stepIdx, steps.length - 1)];
  const all = useMemo(() => aggregate(spec.candles, step.factor), [spec.candles, step.factor]);
  const hideFrom = spec.hideFrom != null && step.factor === 1 ? spec.hideFrom : null;
  const hiddenCount = hideFrom != null ? all.length - hideFrom : 0;
  const shownHidden = Math.min(revealed, hiddenCount);
  // Replay: step through the candles; null = everything.
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const shownCount = replay ?? (hideFrom != null ? hideFrom + shownHidden : all.length);
  const slots = hideFrom != null ? all.length : shownCount;
  const shown = all.slice(0, shownCount);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setReplay((r) => {
        const next = (r ?? 0) + 1;
        if (next >= all.length) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, 450);
    return () => clearInterval(t);
  }, [playing, all.length]);

  // Zoom / pan window over the slots.
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState(0); // slots hidden on the right
  const visibleSlots = Math.max(8, Math.round(slots / zoom));
  const end = Math.max(visibleSlots, slots - offset);
  const start = Math.max(0, end - visibleSlots);
  useEffect(() => {
    setOffset(0);
  }, [zoom, step.factor]);

  const [sel, setSel] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const panelH = spec.panel && !compact ? Math.round(height * 0.24) : spec.panel === "volume" && compact ? Math.round(height * 0.18) : 0;
  const axisH = compact ? 4 : 18;
  const priceH = height - panelH - axisH - (panelH ? 6 : 0);
  const padR = compact ? 6 : 52;
  const padL = 4;
  const plotW = Math.max(10, width - padL - padR);
  const slotW = plotW / Math.max(1, end - start);
  const x = (i: number) => padL + (i - start + 0.5) * slotW;

  const inView = shown.slice(start, Math.min(end, shownCount));
  const annotations = useMemo(() => [...(spec.annotations ?? []), ...(shownHidden > 0 || (replay == null && hideFrom == null) ? spec.afterReveal ?? [] : [])], [spec.annotations, spec.afterReveal, shownHidden, replay, hideFrom]);
  const overlays = useMemo(() => (spec.overlays ?? []).map((o) => overlaySeries(o, shown)), [spec.overlays, shown]);

  // Price scale from what's on screen only (never from hidden candles).
  const [lo, hi] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of inView) {
      lo = Math.min(lo, c.l);
      hi = Math.max(hi, c.h);
    }
    for (const o of overlays) for (const s of o.lines) for (let i = start; i < Math.min(end, shownCount); i++) if (s[i] != null) ((lo = Math.min(lo, s[i]!)), (hi = Math.max(hi, s[i]!)));
    if (step.factor === 1)
      for (const a of annotations) {
        if (a.kind === "hline") ((lo = Math.min(lo, a.price)), (hi = Math.max(hi, a.price)));
        if (a.kind === "band") ((lo = Math.min(lo, a.low)), (hi = Math.max(hi, a.high)));
      }
    if (!Number.isFinite(lo)) return [0, 1];
    const pad = (hi - lo) * 0.08 || 1;
    return [lo - pad, hi + pad];
  }, [inView, overlays, annotations, start, end, shownCount, step.factor]);
  const y = (p: number) => 6 + ((hi - p) / (hi - lo)) * (priceH - 12);

  const ticks = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  }, [lo, hi]);

  // Lower panel
  const panel = useMemo(() => {
    if (!spec.panel) return null;
    const closes = shown.map((c) => c.c);
    if (spec.panel === "rsi") return { kind: "rsi" as const, lines: [rsi(closes)], min: 0, max: 100, refs: [30, 70] };
    if (spec.panel === "macd") {
      const m = macd(closes);
      const vals = [...m.macd, ...m.signal, ...m.hist].filter((v): v is number => v != null);
      const ext = Math.max(0.01, ...vals.map(Math.abs));
      return { kind: "macd" as const, lines: [m.macd, m.signal], hist: m.hist, min: -ext, max: ext, refs: [0] };
    }
    const maxV = Math.max(1, ...inView.map((c) => c.v));
    return { kind: "volume" as const, lines: [], min: 0, max: maxV, refs: [] };
  }, [spec.panel, shown, inView]);
  const panelTop = priceH + 6;
  const py = (v: number) => (panel ? panelTop + ((panel.max - v) / (panel.max - panel.min || 1)) * (panelH - 4) + 2 : 0);

  const pick = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - padL) / slotW) + start;
    if (i >= start && i < Math.min(end, shownCount)) setSel(i);
  };
  const drag = useRef<{ x: number; offset: number } | null>(null);
  const onDown = (e: PointerEvent) => {
    if (zoom > 1) drag.current = { x: e.clientX, offset };
    pick(e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    if (drag.current && e.buttons) {
      const moved = Math.round((e.clientX - drag.current.x) / slotW);
      setOffset(Math.max(0, Math.min(slots - visibleSlots, drag.current.offset + moved)));
      return;
    }
    pick(e.clientX);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const last = Math.min(end, shownCount) - 1;
      setSel((s) => Math.max(start, Math.min(last, (s ?? last) + (e.key === "ArrowLeft" ? -1 : 1))));
    } else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, z * 1.5));
    else if (e.key === "-") setZoom((z) => Math.max(1, z / 1.5));
  };

  const readIdx = sel != null && sel < shownCount ? sel : shownCount - 1;
  const read = shown[readIdx];
  const prev = shown[readIdx - 1];
  const bodyW = Math.max(1.5, Math.min(18, slotW * 0.62));

  const describe = `${TIMEFRAME_LABEL[step.tf]} candlestick chart, ${spec.source === "simulated" ? "simulated data" : "historical data"}, ${shownCount} candles${hiddenCount - shownHidden > 0 ? `, ${hiddenCount - shownHidden} hidden` : ""}. Last close ${read ? fmt(read.c) : "—"}.`;

  return (
    <figure className={cn("min-w-0", className)}>
      {!compact && (
        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          {badge && (
            <span className={cn("rounded-full px-2 py-0.5 font-medium", spec.source === "simulated" ? "bg-future-soft text-future-ink" : "bg-surface-3 text-ink-2")} title={spec.source === "simulated" ? "Made-up prices generated for practice — not a real market" : "Recorded prices from a real market"}>
              {spec.source === "simulated" ? "Simulated data" : "Historical data"}
            </span>
          )}
          <span className="text-ink-3">{TIMEFRAME_LABEL[step.tf]}</span>
          {read && (
            <span className="num ml-auto flex flex-wrap gap-x-2.5 text-ink-2" aria-live="polite">
              <span className="text-ink-3">#{readIdx + 1}</span>
              <span>O {fmt(read.o)}</span>
              <span>H {fmt(read.h)}</span>
              <span>L {fmt(read.l)}</span>
              <span className={cn("font-semibold", read.c >= read.o ? "text-candle-up" : "text-candle-down")}>C {fmt(read.c)}</span>
              {prev && <span className={read.c >= prev.c ? "text-candle-up" : "text-candle-down"}>{read.c >= prev.c ? "+" : ""}{(((read.c - prev.c) / prev.c) * 100).toFixed(2)}%</span>}
              {read.v > 0 && <span className="text-ink-3">Vol {fmtVol(read.v)}</span>}
            </span>
          )}
        </div>
      )}
      <div
        ref={wrapRef}
        className={cn("relative touch-pan-y select-none rounded-xl outline-none", !compact && "cursor-crosshair")}
        style={{ height }}
        tabIndex={compact ? -1 : 0}
        role="img"
        aria-label={describe}
        onKeyDown={onKey}
        onPointerDown={compact ? undefined : onDown}
        onPointerMove={compact ? undefined : onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => {
          drag.current = null;
          setSel(null);
        }}
      >
        {width > 0 && (
          <svg width={width} height={height} className="block overflow-visible">
            <defs>
              <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-strong)" strokeWidth="2" />
              </pattern>
              <clipPath id={`clip-${uid}`}>
                <rect x={padL} y={0} width={plotW} height={height} />
              </clipPath>
            </defs>
            {/* grid + price axis */}
            {!compact &&
              ticks.map((t) => (
                <g key={t}>
                  <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" />
                  <text x={padL + plotW + 6} y={y(t) + 4} fontSize="11" fill="var(--ink-3)" className="num">
                    {fmt(t)}
                  </text>
                </g>
              ))}
            <g clipPath={`url(#clip-${uid})`}>
              {/* shaded zones */}
              {step.factor === 1 &&
                annotations.map((a, k) =>
                  a.kind === "zone" && a.to >= start && a.from < end ? (
                    <g key={`z${k}`}>
                      <rect x={x(a.from) - slotW / 2} y={0} width={(a.to - a.from + 1) * slotW} height={priceH} fill={TONE[a.tone ?? "brand"]} opacity={0.1} rx={4} />
                      {a.label && !compact && (
                        <text x={x(a.from) - slotW / 2 + 3} y={12} fontSize="11" fontWeight={600} fill={TONE[a.tone ?? "brand"]}>
                          {a.label}
                        </text>
                      )}
                    </g>
                  ) : a.kind === "band" ? (
                    <g key={`b${k}`}>
                      <rect x={padL} y={y(a.high)} width={plotW} height={Math.max(2, y(a.low) - y(a.high))} fill={TONE[a.tone ?? "neutral"]} opacity={0.14} />
                      {a.label && !compact && (
                        <text x={padL + 4} y={y(a.high) - 3} fontSize="11" fontWeight={600} fill={TONE[a.tone ?? "neutral"]}>
                          {a.label}
                        </text>
                      )}
                    </g>
                  ) : null,
                )}
              {/* hidden future */}
              {hideFrom != null && hiddenCount - shownHidden > 0 && replay == null && (
                <g>
                  <rect x={x(hideFrom + shownHidden) - slotW / 2} y={2} width={(hiddenCount - shownHidden) * slotW} height={priceH - 4} fill={`url(#hatch-${uid})`} opacity={0.5} rx={6} />
                  <text x={x(hideFrom + shownHidden) - slotW / 2 + ((hiddenCount - shownHidden) * slotW) / 2} y={priceH / 2 + 6} textAnchor="middle" fontSize="20" fontWeight={700} fill="var(--ink-3)">
                    ?
                  </text>
                </g>
              )}
              {/* candles */}
              {shown.map((c, i) => {
                if (i < start || i >= end) return null;
                const up = c.c >= c.o;
                const col = up ? "var(--candle-up)" : "var(--candle-down)";
                const top = y(Math.max(c.o, c.c));
                const bh = Math.max(1, Math.abs(y(c.o) - y(c.c)));
                const isNew = hideFrom != null && i >= hideFrom;
                return (
                  <g key={i} opacity={sel != null && sel !== i ? 0.75 : 1} className={isNew ? "anim-fade" : undefined}>
                    <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1.4} />
                    <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={bh} fill={up ? "var(--surface)" : col} stroke={col} strokeWidth={1.4} rx={Math.min(2, bodyW / 4)} />
                  </g>
                );
              })}
              {/* overlays */}
              {overlays.map((o, k) =>
                o.lines.map((s, j) => {
                  const pts = s.map((v, i) => (v != null && i >= start && i < Math.min(end, shownCount) ? `${x(i)},${y(v)}` : null)).filter(Boolean);
                  return pts.length > 1 ? <polyline key={`${k}-${j}`} points={pts.join(" ")} fill="none" stroke={OVERLAY_COLOR[k % 3]} strokeWidth={j === 1 && o.lines.length === 3 ? 1 : 1.6} strokeDasharray={o.lines.length === 3 && j !== 1 ? "4 3" : undefined} /> : null;
                }),
              )}
              {/* lines, arrows, marks */}
              {step.factor === 1 &&
                annotations.map((a, k) => <AnnotationMark key={k} a={a} x={x} y={y} padL={padL} plotW={plotW} compact={compact} visibleEnd={Math.min(end, shownCount)} shown={shown} />)}
              {/* selection */}
              {sel != null && !compact && <line x1={x(sel)} x2={x(sel)} y1={0} y2={height - axisH} stroke="var(--line-strong)" strokeDasharray="3 3" />}
            </g>
            {/* lower panel */}
            {panel && panelH > 0 && (
              <g clipPath={`url(#clip-${uid})`}>
                <line x1={padL} x2={padL + plotW} y1={panelTop - 3} y2={panelTop - 3} stroke="var(--line)" />
                {panel.refs.map((r) => (
                  <line key={r} x1={padL} x2={padL + plotW} y1={py(r)} y2={py(r)} stroke="var(--chart-grid)" strokeDasharray="3 3" />
                ))}
                {panel.kind === "volume" &&
                  shown.map((c, i) =>
                    i >= start && i < end ? <rect key={i} x={x(i) - bodyW / 2} y={py(c.v)} width={bodyW} height={Math.max(1, panelTop + panelH - 2 - py(c.v))} fill={c.c >= c.o ? "var(--candle-up)" : "var(--candle-down)"} opacity={0.45} rx={1} /> : null,
                  )}
                {panel.kind === "macd" &&
                  panel.hist?.map((v, i) =>
                    v != null && i >= start && i < Math.min(end, shownCount) ? <rect key={i} x={x(i) - bodyW / 2} y={Math.min(py(v), py(0))} width={bodyW} height={Math.max(1, Math.abs(py(v) - py(0)))} fill={v >= 0 ? "var(--candle-up)" : "var(--candle-down)"} opacity={0.45} /> : null,
                  )}
                {panel.lines.map((s, j) => {
                  const pts = s.map((v, i) => (v != null && i >= start && i < Math.min(end, shownCount) ? `${x(i)},${py(v)}` : null)).filter(Boolean);
                  return pts.length > 1 ? <polyline key={j} points={pts.join(" ")} fill="none" stroke={j === 0 ? "var(--future)" : "var(--chart-out)"} strokeWidth={1.5} /> : null;
                })}
              </g>
            )}
            {panel && panelH > 0 && !compact && (
              <text x={padL + plotW + 6} y={panelTop + 11} fontSize="10.5" fill="var(--ink-3)">
                {panel.kind === "volume" ? "Volume" : panel.kind === "rsi" ? "RSI 14" : "MACD"}
              </text>
            )}
            {/* x labels */}
            {!compact &&
              [start, Math.floor((start + end) / 2), end - 1].map((i) => (
                <text key={i} x={Math.max(padL + 10, Math.min(padL + plotW - 10, x(i)))} y={height - 4} fontSize="10.5" textAnchor="middle" fill="var(--ink-3)">
                  #{i + 1}
                </text>
              ))}
          </svg>
        )}
      </div>
      {!compact && (overlays.length > 0 || spec.panel === "macd") && (
        <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-ink-2">
          {overlays.map((o, k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: OVERLAY_COLOR[k % 3] }} />
              {o.label}
            </span>
          ))}
          {spec.panel === "macd" && (
            <>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded bg-future" />MACD</span>
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--chart-out)" }} />Signal</span>
            </>
          )}
        </figcaption>
      )}
      {!compact && (
        <div className="no-print mt-2 flex flex-wrap items-center gap-1.5">
          {steps.length > 1 && (
            <div className="mr-1 flex gap-1" role="radiogroup" aria-label="Timeframe">
              {steps.map((s, i) => (
                <button key={s.tf} type="button" role="radio" aria-checked={i === stepIdx} onClick={() => ((setStepIdx(i)), setReplay(null), setSel(null))} className={cn("h-8 rounded-full px-3 text-[12.5px] font-medium", i === stepIdx ? "bg-inverse text-on-inverse" : "bg-surface-3/70 text-ink-2 hover:text-ink")}>
                  {s.tf}
                </button>
              ))}
            </div>
          )}
          <Ctl label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z / 1.5))}><Minus className="h-4 w-4" /></Ctl>
          <Ctl label="Zoom in" disabled={visibleSlots <= 8} onClick={() => setZoom((z) => Math.min(4, z * 1.5))}><Plus className="h-4 w-4" /></Ctl>
          {zoom > 1 && (
            <>
              <Ctl label="Earlier candles" disabled={start === 0} onClick={() => setOffset((o) => Math.min(slots - visibleSlots, o + Math.ceil(visibleSlots / 3)))}><ChevronLeft className="h-4 w-4" /></Ctl>
              <Ctl label="Later candles" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - Math.ceil(visibleSlots / 3)))}><ChevronRight className="h-4 w-4" /></Ctl>
            </>
          )}
          {spec.replay && hideFrom == null && (
            <span className="ml-1 flex items-center gap-1.5">
              <Ctl label={playing ? "Pause replay" : "Replay candle by candle"} onClick={() => (playing ? setPlaying(false) : (setReplay((r) => (r == null || r >= all.length - 1 ? 3 : r)), setPlaying(true)))}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Ctl>
              <Ctl label="Next candle" onClick={() => ((setPlaying(false)), setReplay((r) => (r == null ? 3 : r + 1 >= all.length ? null : r + 1)))}><SkipForward className="h-4 w-4" /></Ctl>
              {replay != null && <Ctl label="Show all candles" onClick={() => ((setPlaying(false)), setReplay(null))}><RotateCcw className="h-4 w-4" /></Ctl>}
              <span className="text-[12px] text-ink-3">{replay != null ? `Candle ${replay} of ${all.length}` : "Replay"}</span>
            </span>
          )}
          <Ctl label={table ? "Hide data table" : "Show data table"} onClick={() => setTable((t) => !t)} className="ml-auto"><Table2 className="h-4 w-4" /></Ctl>
        </div>
      )}
      {table && !compact && (
        <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-line">
          <table className="num w-full text-right text-[12.5px]">
            <caption className="sr-only">Candle data</caption>
            <thead className="sticky top-0 bg-surface-2 text-ink-3">
              <tr>
                {["#", "Open", "High", "Low", "Close", "Volume"].map((h) => (
                  <th key={h} scope="col" className="px-2 py-1 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="px-2 py-1 text-ink-3">{i + 1}</td>
                  <td className="px-2 py-1">{fmt(c.o)}</td>
                  <td className="px-2 py-1">{fmt(c.h)}</td>
                  <td className="px-2 py-1">{fmt(c.l)}</td>
                  <td className={cn("px-2 py-1 font-medium", c.c >= c.o ? "text-candle-up" : "text-candle-down")}>{fmt(c.c)}</td>
                  <td className="px-2 py-1 text-ink-3">{fmtVol(c.v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

function Ctl({ label, onClick, disabled, children, className }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40", className)}>
      {children}
    </button>
  );
}

function AnnotationMark({ a, x, y, padL, plotW, compact, visibleEnd, shown }: { a: Annotation; x: (i: number) => number; y: (p: number) => number; padL: number; plotW: number; compact?: boolean; visibleEnd: number; shown: Candle[] }) {
  if (a.kind === "hline") {
    const col = TONE[a.tone ?? "neutral"];
    return (
      <g>
        <line x1={padL} x2={padL + plotW} y1={y(a.price)} y2={y(a.price)} stroke={col} strokeWidth={1.4} strokeDasharray={a.dashed ? "5 4" : undefined} />
        {a.label && !compact && (
          <g>
            <rect x={padL + 2} y={y(a.price) - 17} width={a.label.length * 6.4 + 10} height={15} rx={4} fill="var(--surface)" opacity={0.9} />
            <text x={padL + 7} y={y(a.price) - 6} fontSize="11" fontWeight={600} fill={col}>{a.label}</text>
          </g>
        )}
      </g>
    );
  }
  if (a.kind === "line") {
    const col = TONE[a.tone ?? "brand"];
    const [i1, p1] = a.a;
    const [i2, p2] = a.b;
    const slope = (p2 - p1) / (i2 - i1 || 1);
    const iEnd = a.extend ? visibleEnd - 1 : i2;
    return (
      <g>
        <line x1={x(i1)} y1={y(p1)} x2={x(iEnd)} y2={y(p1 + slope * (iEnd - i1))} stroke={col} strokeWidth={1.8} />
        {a.label && !compact && <text x={x(i1)} y={y(p1) + 16} fontSize="11" fontWeight={600} fill={col}>{a.label}</text>}
      </g>
    );
  }
  if (a.kind === "arrow" && a.i < shown.length) {
    const c = shown[a.i];
    const col = TONE[a.tone ?? (a.dir === "up" ? "up" : "down")];
    const tip = a.dir === "up" ? y(c.l) + 4 : y(c.h) - 4;
    const tail = a.dir === "up" ? tip + 26 : tip - 26;
    const head = a.dir === "up" ? `${x(a.i)},${tip} ${x(a.i) - 5},${tip + 8} ${x(a.i) + 5},${tip + 8}` : `${x(a.i)},${tip} ${x(a.i) - 5},${tip - 8} ${x(a.i) + 5},${tip - 8}`;
    return (
      <g>
        <line x1={x(a.i)} x2={x(a.i)} y1={tail} y2={tip} stroke={col} strokeWidth={2} />
        <polygon points={head} fill={col} />
        {a.label && !compact && (
          <text x={x(a.i)} y={a.dir === "up" ? tail + 13 : tail - 5} fontSize="11" fontWeight={600} textAnchor="middle" fill={col}>{a.label}</text>
        )}
      </g>
    );
  }
  if (a.kind === "mark" && a.i < shown.length) {
    const c = shown[a.i];
    const col = TONE[a.tone ?? "neutral"];
    return (
      <text x={x(a.i)} y={a.at === "high" ? y(c.h) - 6 : y(c.l) + 14} fontSize={compact ? 9 : 11} fontWeight={700} textAnchor="middle" fill={col}>{a.label}</text>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Anatomy diagrams: big labelled candles
// ---------------------------------------------------------------------------

const PARTS = {
  high: "High — the highest price traded in the period (top of the upper wick).",
  low: "Low — the lowest price traded (bottom of the lower wick).",
  open: "Open — the first trade of the period.",
  close: "Close — the last trade of the period.",
  body: "Body — from the open to the close. It shows the period's net result.",
  upper: "Upper wick — prices above the body that were reached but not held.",
  lower: "Lower wick — prices below the body that were reached but not held.",
} as const;
type Part = keyof typeof PARTS;

/** Tap a part of the candle to learn what it is. */
export function CandleAnatomy({ spec, height = 220 }: { spec: AnatomySpec; height?: number }) {
  const [part, setPart] = useState<Part | null>(null);
  const n = spec.candles.length;
  const lo = Math.min(...spec.candles.map((c) => c.l));
  const hi = Math.max(...spec.candles.map((c) => c.h));
  const W = Math.max(200, n * 150);
  const y = (p: number) => 14 + ((hi - p) / (hi - lo || 1)) * (height - 44);
  const bw = Math.min(44, 300 / n / 2);
  const hit = (p: Part) => ({ onClick: () => setPart(p), onMouseEnter: () => setPart(p), onFocus: () => setPart(p), tabIndex: 0, role: "button", "aria-label": PARTS[p].split(" — ")[0], className: "cursor-pointer outline-none" });
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${height}`} className="mx-auto block w-full max-w-md" role="group" aria-label="Labelled candlestick diagram">
        {spec.candles.map((c, k) => {
          const cx = (W / n) * (k + 0.5) - (spec.labels ? 26 : 0);
          const up = c.c >= c.o;
          const col = up ? "var(--candle-up)" : "var(--candle-down)";
          const lx = cx + bw / 2 + 10;
          const lab = (p: Part, py: number, text: string) =>
            spec.labels && (
              <g {...hit(p)}>
                <line x1={cx + bw / 2 + 2} x2={lx - 2} y1={py} y2={py} stroke="var(--line-strong)" />
                <text x={lx} y={py + 4} fontSize="12" fill={part === p ? "var(--ink)" : "var(--ink-2)"} fontWeight={part === p ? 700 : 500}>{text}</text>
              </g>
            );
          const sel = (p: Part) => (part === p ? 3 : 2);
          return (
            <g key={k}>
              <g {...hit("upper")}><line x1={cx} x2={cx} y1={y(c.h)} y2={y(Math.max(c.o, c.c))} stroke={col} strokeWidth={sel("upper")} /><rect x={cx - 10} y={y(c.h)} width={20} height={Math.max(4, y(Math.max(c.o, c.c)) - y(c.h))} fill="transparent" /></g>
              <g {...hit("lower")}><line x1={cx} x2={cx} y1={y(Math.min(c.o, c.c))} y2={y(c.l)} stroke={col} strokeWidth={sel("lower")} /><rect x={cx - 10} y={y(Math.min(c.o, c.c))} width={20} height={Math.max(4, y(c.l) - y(Math.min(c.o, c.c)))} fill="transparent" /></g>
              <g {...hit("body")}><rect x={cx - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(2, Math.abs(y(c.o) - y(c.c)))} fill={up ? "var(--surface)" : col} stroke={col} strokeWidth={part === "body" ? 3.2 : 2.2} rx={3} /></g>
              {lab("high", y(c.h), "High")}
              {lab(up ? "close" : "open", y(Math.max(c.o, c.c)), up ? "Close" : "Open")}
              {lab(up ? "open" : "close", y(Math.min(c.o, c.c)), up ? "Open" : "Close")}
              {lab("low", y(c.l), "Low")}
              {c.label && <text x={cx} y={height - 6} fontSize="12" fontWeight={600} textAnchor="middle" fill={up ? "var(--candle-up)" : "var(--candle-down)"}>{c.label}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 min-h-[2.5em] text-center text-[13px] text-ink-2" aria-live="polite">
        {part ? PARTS[part] : spec.labels ? "Tap or hover any part of the candle." : "Hollow = bullish (closed higher), filled = bearish (closed lower)."}
      </figcaption>
    </figure>
  );
}

/** Small static candles (for ordering questions and pattern chips). */
export function MiniCandles({ candles, height = 64, width = 48, className, scale }: { candles: Candle[]; height?: number; width?: number; className?: string; /** Shared price range, so separate drawings compare. */ scale?: [number, number] }) {
  const lo = scale?.[0] ?? Math.min(...candles.map((c) => c.l));
  const hi = scale?.[1] ?? Math.max(...candles.map((c) => c.h));
  const y = (p: number) => 4 + ((hi - p) / (hi - lo || 1)) * (height - 8);
  const slot = width / candles.length;
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      {candles.map((c, i) => {
        const cx = slot * (i + 0.5);
        const up = c.c >= c.o;
        const col = up ? "var(--candle-up)" : "var(--candle-down)";
        const bw = Math.min(14, slot * 0.55);
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1.5} />
            <rect x={cx - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(1.5, Math.abs(y(c.o) - y(c.c)))} fill={up ? "var(--surface)" : col} stroke={col} strokeWidth={1.5} rx={2} />
          </g>
        );
      })}
    </svg>
  );
}
