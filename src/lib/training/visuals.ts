// Ready-made simulated charts for lessons: trends, ranges, breakouts, gaps, indicators and trade plans.
// Each is seeded, so a lesson always shows the same picture.

import { fibLevels, highest, lowest, shape, swings, walk, type Candle } from "./candles";
import type { Annotation, ChartSpec, Overlay, Timeframe } from "./types";

const U = 2;
const sim = (candles: Candle[], extra: Partial<ChartSpec> = {}, timeframe: Timeframe = "1D"): ChartSpec => ({ candles, source: "simulated", timeframe, ...extra });
const r2 = (n: number) => Math.round(n * 100) / 100;

export function trendChart(dir: "up" | "down" | "sideways", seed = 3, n = 40): ChartSpec {
  const drift = dir === "up" ? 0.45 : dir === "down" ? -0.45 : 0;
  const legs =
    dir === "sideways"
      ? [{ n: n / 4, drift: 0.5 }, { n: n / 4, drift: -0.5 }, { n: n / 4, drift: 0.5 }, { n: n / 4, drift: -0.5 }]
      : [{ n: n / 4, drift: drift * 1.6 }, { n: n / 8, drift: -drift * 0.9 }, { n: n / 4, drift: drift * 1.6 }, { n: n / 8, drift: -drift * 0.9 }, { n: n / 4, drift: drift * 1.4 }];
  return sim(walk(seed, 200, U, legs.map((l) => ({ ...l, noise: 0.4 }))));
}

/** Higher highs and higher lows (or the opposite), with the swing points labelled. */
export function structureChart(dir: "up" | "down", seed = 5): ChartSpec {
  const s = dir === "up" ? 1 : -1;
  const candles = walk(seed, 200, U, [
    { n: 6, drift: 1.1 * s, noise: 0.3 },
    { n: 4, drift: -0.9 * s, noise: 0.3 },
    { n: 6, drift: 1.1 * s, noise: 0.3 },
    { n: 4, drift: -0.9 * s, noise: 0.3 },
    { n: 6, drift: 1.1 * s, noise: 0.3 },
    { n: 4, drift: -0.9 * s, noise: 0.3 },
    { n: 4, drift: 1 * s, noise: 0.3 },
  ]);
  const pts = swings(candles, 3);
  const annotations: Annotation[] = [];
  let lastHigh: number | null = null;
  let lastLow: number | null = null;
  for (const p of pts) {
    if (p.kind === "high") {
      const label = lastHigh == null ? "High" : p.price > lastHigh ? "HH" : "LH";
      annotations.push({ kind: "mark", i: p.i, at: "high", label, tone: label === "HH" ? "up" : label === "LH" ? "down" : "neutral" });
      lastHigh = p.price;
    } else {
      const label = lastLow == null ? "Low" : p.price > lastLow ? "HL" : "LL";
      annotations.push({ kind: "mark", i: p.i, at: "low", label, tone: label === "HL" ? "up" : label === "LL" ? "down" : "neutral" });
      lastLow = p.price;
    }
  }
  return sim(candles, { annotations });
}

/** A range bouncing between support and resistance. */
export function rangeChart(seed = 8, withLevels = true): ChartSpec & { support: number; resistance: number } {
  const candles = walk(seed, 200, U, [
    { n: 5, drift: 0.9, noise: 0.25 },
    { n: 5, drift: -0.9, noise: 0.25 },
    { n: 5, drift: 0.9, noise: 0.25 },
    { n: 5, drift: -0.9, noise: 0.25 },
    { n: 5, drift: 0.9, noise: 0.25 },
    { n: 4, drift: -0.8, noise: 0.25 },
  ]);
  const resistance = r2(highest(candles));
  const support = r2(lowest(candles));
  const annotations: Annotation[] = withLevels
    ? [
        { kind: "band", low: resistance - U * 0.5, high: resistance, label: "Resistance", tone: "down" },
        { kind: "band", low: support, high: support + U * 0.5, label: "Support", tone: "up" },
      ]
    : [];
  return { ...sim(candles, { annotations }), support, resistance };
}

/** Range, then a breakout with a volume spike (or a false breakout that closes back inside). */
export function breakoutChart(kind: "breakout" | "false" | "breakdown" | "retest", seed = 12): ChartSpec {
  const base = walk(seed, 200, U, [
    { n: 5, drift: 0.8, noise: 0.25, volume: 0.8 },
    { n: 5, drift: -0.8, noise: 0.25, volume: 0.8 },
    { n: 5, drift: 0.8, noise: 0.25, volume: 0.8 },
    { n: 5, drift: -0.8, noise: 0.25, volume: 0.8 },
    { n: 4, drift: 0.8, noise: 0.25, volume: 0.8 },
  ]);
  const top = r2(highest(base));
  const bottom = r2(lowest(base));
  let candles: Candle[];
  const at = base.length;
  const ann: Annotation[] = [];
  if (kind === "breakout" || kind === "retest") {
    const gapToTop = (top - base.at(-1)!.c) / U;
    candles = shape(base, U, [[0, gapToTop + 1.4, -0.1, gapToTop + 1.3, 2.6]]);
    if (kind === "retest") {
      candles = [...candles, ...walk(seed + 1, candles.at(-1)!.c, U, [{ n: 3, drift: 0.5, noise: 0.2 }])];
      const pull = (candles.at(-1)!.c - top) / U;
      candles = shape(candles, U, [
        [0, 0.1, -pull * 0.55, -pull * 0.5, 0.7],
        [0, 0.1, -pull * 0.5 - 0.15, -pull * 0.45, 0.6],
        [0, 0.25, -0.35, 0.15, 0.8],
        [0.05, 1.3, -0.05, 1.2, 1.6],
      ]);
      ann.push({ kind: "arrow", i: candles.length - 3, dir: "up", label: "Retest holds", tone: "up" });
    } else candles = [...candles, ...walk(seed + 2, candles.at(-1)!.c, U, [{ n: 5, drift: 0.6, noise: 0.3 }])];
    ann.push({ kind: "hline", price: top, label: kind === "retest" ? "Old resistance → support" : "Resistance", tone: "down", dashed: true });
    ann.push({ kind: "arrow", i: at, dir: "up", label: "Breakout, high volume", tone: "up" });
  } else if (kind === "breakdown") {
    const gap = (base.at(-1)!.c - bottom) / U;
    candles = shape(base, U, [[0, 0.1, -gap - 1.4, -gap - 1.3, 2.6]]);
    candles = [...candles, ...walk(seed + 3, candles.at(-1)!.c, U, [{ n: 5, drift: -0.6, noise: 0.3 }])];
    ann.push({ kind: "hline", price: bottom, label: "Support", tone: "up", dashed: true });
    ann.push({ kind: "arrow", i: at, dir: "down", label: "Breakdown", tone: "down" });
  } else {
    const gapToTop = (top - base.at(-1)!.c) / U;
    candles = shape(base, U, [
      [0, gapToTop + 0.9, -0.1, gapToTop + 0.5, 1.1],
      [0, 0.1, -1.1, -1.0, 1.4],
    ]);
    candles = [...candles, ...walk(seed + 4, candles.at(-1)!.c, U, [{ n: 4, drift: -0.5, noise: 0.3 }])];
    ann.push({ kind: "hline", price: top, label: "Resistance", tone: "down", dashed: true });
    ann.push({ kind: "arrow", i: at, dir: "down", label: "Pokes above, closes back inside", tone: "down" });
  }
  return sim(candles, { annotations: ann, panel: "volume", replay: true });
}

/** A rising trendline drawn through two swing lows. */
export function trendlineChart(seed = 21): ChartSpec {
  const c = structureChart("up", seed).candles;
  const lows = swings(c, 3).filter((s) => s.kind === "low");
  const [a, b] = [lows[0], lows[1] ?? lows[0]];
  return sim(c, { annotations: [{ kind: "line", a: [a.i, a.price], b: [b.i, b.price], label: "Trendline", tone: "up", extend: true }] });
}

/** An opening gap up that holds, and one that fills. */
export function gapChart(fills: boolean, seed = 31): ChartSpec {
  let c = walk(seed, 200, U, [{ n: 14, drift: 0.2, noise: 0.4 }]);
  const gapAt = c.length;
  c = shape(c, U, [[1.8, 2.6, 1.6, 2.4, 2.2]]);
  c = [...c, ...walk(seed + 1, c.at(-1)!.c, U, fills ? [{ n: 6, drift: -0.6, noise: 0.3 }] : [{ n: 6, drift: 0.4, noise: 0.3 }])];
  return sim(c, { annotations: [{ kind: "zone", from: gapAt - 1, to: gapAt, label: fills ? "Gap — later filled" : "Gap holds", tone: fills ? "down" : "up" }], panel: "volume", replay: true });
}

/** A chart with a lower panel or overlays for indicator lessons. */
export function indicatorChart(overlays: Overlay[], panel?: ChartSpec["panel"], seed = 41): ChartSpec {
  const c = walk(seed, 200, U, [
    { n: 18, drift: 0.55, noise: 0.45 },
    { n: 10, drift: -0.2, noise: 0.5 },
    { n: 14, drift: -0.6, noise: 0.45 },
    { n: 14, drift: 0.5, noise: 0.45 },
  ]);
  return sim(c, { overlays, panel });
}

/** A swing up and a pullback, with Fibonacci levels drawn. */
export function fibChart(seed = 51): ChartSpec {
  let c = walk(seed, 200, U, [{ n: 16, drift: 0.9, noise: 0.35 }]);
  const low = lowest(c);
  const high = highest(c);
  c = [...c, ...walk(seed + 1, c.at(-1)!.c, U, [{ n: 7, drift: -0.85, noise: 0.25 }, { n: 5, drift: 0.7, noise: 0.3 }])];
  const levels = fibLevels(low, high).filter((l) => l.ratio > 0 && l.ratio < 1);
  return sim(c, {
    annotations: levels.map((l) => ({ kind: "hline" as const, price: l.price, label: `${(l.ratio * 100).toFixed(1)}%`, tone: l.ratio === 0.618 || l.ratio === 0.5 ? ("future" as const) : ("neutral" as const), dashed: true })),
  });
}

/** Entry, stop and target lines on a pullback in an uptrend. */
export function tradePlanChart(seed = 61): ChartSpec & { entry: number; stop: number; target: number } {
  const c = walk(seed, 200, U, [{ n: 12, drift: 0.7, noise: 0.35 }, { n: 5, drift: -0.6, noise: 0.25 }, { n: 1, drift: 0.8, noise: 0.1 }]);
  const entry = r2(c.at(-1)!.c);
  const stop = r2(lowest(c.slice(-6)) - U * 0.3);
  const target = r2(entry + (entry - stop) * 2);
  return {
    ...sim(c, {
      annotations: [
        { kind: "hline", price: target, label: `Target ${target}`, tone: "up", dashed: true },
        { kind: "hline", price: entry, label: `Entry ${entry}`, tone: "brand" },
        { kind: "hline", price: stop, label: `Stop ${stop}`, tone: "down", dashed: true },
      ],
    }),
    entry,
    stop,
    target,
  };
}

/** Intraday candles (for timeframe and VWAP lessons), with a higher-timeframe switch. */
export function intradayChart(seed = 71, timeframe: Timeframe = "5m"): ChartSpec {
  const c = walk(seed, 200, U * 0.5, [
    { n: 16, drift: 0.4, noise: 0.6 },
    { n: 16, drift: -0.2, noise: 0.6 },
    { n: 16, drift: 0.5, noise: 0.6 },
    { n: 16, drift: -0.4, noise: 0.6 },
  ]);
  return sim(c, { timeframes: true }, timeframe);
}

/** A run of candles growing and shrinking (volatility). */
export function volatilityChart(seed = 81): ChartSpec {
  const c = walk(seed, 200, U, [
    { n: 12, drift: 0.1, noise: 0.25, range: 0.5 },
    { n: 12, drift: 0.1, noise: 1.6, range: 1.8, volume: 1.8 },
    { n: 12, drift: 0, noise: 0.3, range: 0.5, volume: 0.7 },
  ]);
  return sim(c, {
    annotations: [
      { kind: "zone", from: 0, to: 11, label: "Quiet: small candles", tone: "neutral" },
      { kind: "zone", from: 12, to: 23, label: "Volatile: big candles", tone: "future" },
    ],
  });
}

/** Volume rising with a trend vs fading. */
export function volumeTrendChart(confirming: boolean, seed = 91): ChartSpec {
  const legs = confirming
    ? [{ n: 10, drift: 0.1, noise: 0.4, volume: 0.7 }, { n: 14, drift: 0.8, noise: 0.35, volume: 1.8 }]
    : [{ n: 10, drift: 0.8, noise: 0.35, volume: 1.6 }, { n: 14, drift: 0.5, noise: 0.35, volume: 0.5 }];
  return sim(walk(seed, 200, U, legs), { panel: "volume" });
}
