// Candles for Trading Training: deterministic simulated price data, pattern builders, pattern checks,
// indicators and the rule that decides whether a move was bullish, bearish or sideways.
// Everything here is pure and seeded, so the same exercise always draws the same chart and has the same outcome.

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Direction = "bullish" | "bearish" | "sideways";

/** Where a chart's candles came from. Every chart says so on screen. */
export type DataSource = "simulated" | "historical";

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** mulberry32: small, fast and the same on every device. Returns numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number for a text (to seed a chart from an id or a date). */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function fix(c: Candle): Candle {
  const o = r2(c.o);
  const cl = r2(c.c);
  return { o, c: cl, h: r2(Math.max(c.h, o, cl)), l: r2(Math.min(c.l, o, cl)), v: Math.max(0, Math.round(c.v)) };
}

// ---------------------------------------------------------------------------
// Random walks
// ---------------------------------------------------------------------------

export interface Leg {
  /** Number of candles. */
  n: number;
  /** Average close-to-close step, in units of `unit` (positive = up). */
  drift: number;
  /** Noise around the drift, in units. Default 0.6. */
  noise?: number;
  /** Volume multiplier for this leg. Default 1. */
  volume?: number;
  /** Candle range multiplier. Default 1. */
  range?: number;
}

/**
 * A price path made of legs (trend up, range, trend down…). `unit` is the typical candle range; `start` is
 * the first open. Each candle opens at the previous close.
 */
export function walk(seed: number, start: number, unit: number, legs: Leg[], baseVolume = 1000): Candle[] {
  const rand = rng(seed);
  const out: Candle[] = [];
  let p = start;
  for (const leg of legs) {
    for (let i = 0; i < leg.n; i++) {
      const noise = (leg.noise ?? 0.6) * unit;
      const step = leg.drift * unit + (rand() * 2 - 1) * noise;
      const o = p;
      const c = Math.max(unit, o + step);
      const span = (leg.range ?? 1) * unit;
      const h = Math.max(o, c) + rand() * 0.45 * span;
      const l = Math.min(o, c) - rand() * 0.45 * span;
      const v = baseVolume * (leg.volume ?? 1) * (0.7 + rand() * 0.6) * (1 + Math.abs(step) / unit / 3);
      out.push(fix({ o, h, l, c, v }));
      p = c;
    }
  }
  return out;
}

/** Continue a series with more legs, from its last close. */
export function extend(candles: Candle[], seed: number, unit: number, legs: Leg[], baseVolume = 1000): Candle[] {
  const last = candles.at(-1);
  return [...candles, ...walk(seed, last ? last.c : 100, unit, legs, baseVolume)];
}

/** Append candles given relative to the last close, in units: [open, high, low, close] offsets (+ volume ×). */
export function shape(candles: Candle[], unit: number, rows: [number, number, number, number, number?][], baseVolume = 1000): Candle[] {
  const out = [...candles];
  let p = out.at(-1)?.c ?? 100;
  for (const [o, h, l, c, vol] of rows) {
    const cnd = fix({ o: p + o * unit, h: p + h * unit, l: p + l * unit, c: p + c * unit, v: baseVolume * (vol ?? 1) });
    out.push(cnd);
    p = cnd.c;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Candle anatomy
// ---------------------------------------------------------------------------

export const body = (c: Candle) => Math.abs(c.c - c.o);
export const range = (c: Candle) => c.h - c.l;
export const upperWick = (c: Candle) => c.h - Math.max(c.o, c.c);
export const lowerWick = (c: Candle) => Math.min(c.o, c.c) - c.l;
export const isBull = (c: Candle) => c.c > c.o;
export const isBear = (c: Candle) => c.c < c.o;
const mid = (c: Candle) => (c.o + c.c) / 2;

/** Average true range: how far price usually travels in one candle. */
export function atr(candles: Candle[], period = 14): number {
  if (!candles.length) return 0;
  const trs = candles.map((c, i) => (i === 0 ? range(c) : Math.max(range(c), Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c))));
  const tail = trs.slice(-period);
  return tail.reduce((s, x) => s + x, 0) / tail.length;
}

// ---------------------------------------------------------------------------
// Pattern checks (used to verify every pattern drawing matches its definition)
// ---------------------------------------------------------------------------

export const isDoji = (c: Candle) => range(c) > 0 && body(c) <= 0.1 * range(c);
export const isMarubozu = (c: Candle) => range(c) > 0 && body(c) >= 0.9 * range(c);
export const isSpinningTop = (c: Candle) =>
  range(c) > 0 && body(c) > 0.1 * range(c) && body(c) <= 0.35 * range(c) && upperWick(c) >= body(c) * 0.8 && lowerWick(c) >= body(c) * 0.8;
/** Small body near the top, lower wick at least twice the body, little upper wick. (Hammer / hanging man.) */
export const isHammerShape = (c: Candle) => body(c) > 0 && lowerWick(c) >= 2 * body(c) && upperWick(c) <= 0.35 * body(c) + 0.05 * range(c);
/** Small body near the bottom, upper wick at least twice the body. (Shooting star / inverted hammer.) */
export const isInvertedShape = (c: Candle) => body(c) > 0 && upperWick(c) >= 2 * body(c) && lowerWick(c) <= 0.35 * body(c) + 0.05 * range(c);

export const isBullishEngulfing = (a: Candle, b: Candle) => isBear(a) && isBull(b) && b.o <= a.c && b.c >= a.o && body(b) > body(a);
export const isBearishEngulfing = (a: Candle, b: Candle) => isBull(a) && isBear(b) && b.o >= a.c && b.c <= a.o && body(b) > body(a);
export const isPiercing = (a: Candle, b: Candle) => isBear(a) && isBull(b) && b.o < a.c && b.c > mid(a) && b.c < a.o;
export const isDarkCloud = (a: Candle, b: Candle) => isBull(a) && isBear(b) && b.o > a.c && b.c < mid(a) && b.c > a.o;
export const isInsideBar = (a: Candle, b: Candle) => b.h < a.h && b.l > a.l;
export const isOutsideBar = (a: Candle, b: Candle) => b.h > a.h && b.l < a.l;
export const isTweezerTop = (a: Candle, b: Candle, unit: number) => isBull(a) && isBear(b) && Math.abs(a.h - b.h) <= 0.08 * unit;
export const isTweezerBottom = (a: Candle, b: Candle, unit: number) => isBear(a) && isBull(b) && Math.abs(a.l - b.l) <= 0.08 * unit;
export const isMorningStar = (a: Candle, b: Candle, c: Candle) =>
  isBear(a) && body(a) > 0.6 * range(a) && body(b) < 0.4 * body(a) && Math.max(b.o, b.c) <= a.c + 0.1 * body(a) && isBull(c) && c.c > mid(a);
export const isEveningStar = (a: Candle, b: Candle, c: Candle) =>
  isBull(a) && body(a) > 0.6 * range(a) && body(b) < 0.4 * body(a) && Math.min(b.o, b.c) >= a.c - 0.1 * body(a) && isBear(c) && c.c < mid(a);
export const isThreeWhiteSoldiers = (a: Candle, b: Candle, c: Candle) =>
  [a, b, c].every((x) => isBull(x) && body(x) >= 0.6 * range(x)) && b.c > a.c && c.c > b.c && b.o > a.o && b.o < a.c && c.o > b.o && c.o < b.c;
export const isThreeBlackCrows = (a: Candle, b: Candle, c: Candle) =>
  [a, b, c].every((x) => isBear(x) && body(x) >= 0.6 * range(x)) && b.c < a.c && c.c < b.c && b.o < a.o && b.o > a.c && c.o < b.o && c.o > b.c;

// ---------------------------------------------------------------------------
// Movement rule (how predictions are judged)
// ---------------------------------------------------------------------------

/** Default: look this many candles ahead… */
export const MOVE_HORIZON = 3;
/** …and call it a move only if the close travelled at least this many ATRs. */
export const MOVE_THRESHOLD_ATR = 1;

export interface MoveResult {
  direction: Direction;
  /** Close after the horizon minus the last visible close. */
  change: number;
  changePct: number;
  /** The change measured in ATRs of the visible candles. */
  changeAtr: number;
  atr: number;
  horizon: number;
  threshold: number;
}

/**
 * Bullish / bearish / sideways, decided only from the data: compare the close `horizon` candles after the last
 * visible one with the last visible close, in units of the visible chart's ATR(14). At least `threshold` ATRs up
 * is bullish, at least that far down is bearish, anything in between is sideways.
 */
export function classifyMove(candles: Candle[], visible: number, horizon = MOVE_HORIZON, threshold = MOVE_THRESHOLD_ATR): MoveResult {
  const shown = candles.slice(0, visible);
  const a = atr(shown);
  const from = shown.at(-1)?.c ?? 0;
  const endIdx = Math.min(candles.length - 1, visible - 1 + horizon);
  const to = candles[endIdx]?.c ?? from;
  const change = to - from;
  const changeAtr = a > 0 ? change / a : 0;
  const direction: Direction = changeAtr >= threshold ? "bullish" : changeAtr <= -threshold ? "bearish" : "sideways";
  return { direction, change: r2(change), changePct: from ? (change / from) * 100 : 0, changeAtr: Math.round(changeAtr * 100) / 100, atr: r2(a), horizon: endIdx - (visible - 1), threshold };
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  return values.map((_, i) => (i + 1 < period ? null : values.slice(i + 1 - period, i + 1).reduce((s, x) => s + x, 0) / period));
}

export function ema(values: number[], period: number): Series {
  const k = 2 / (period + 1);
  const out: Series = [];
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (i + 1 < period) return out.push(null);
    if (prev == null) prev = values.slice(0, period).reduce((s, x) => s + x, 0) / period;
    else prev = v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}

/** Wilder's RSI. */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const val = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[period] = val();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = val();
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9): { macd: Series; signal: Series; hist: Series } {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_, i) => (f[i] != null && s[i] != null ? (f[i] as number) - (s[i] as number) : null));
  const firstIdx = line.findIndex((x) => x != null);
  const sig: Series = closes.map(() => null);
  if (firstIdx >= 0) {
    const e = ema(line.slice(firstIdx) as number[], signal);
    e.forEach((x, i) => (sig[firstIdx + i] = x));
  }
  return { macd: line, signal: sig, hist: line.map((x, i) => (x != null && sig[i] != null ? x - (sig[i] as number) : null)) };
}

export function bollinger(closes: number[], period = 20, k = 2): { mid: Series; upper: Series; lower: Series } {
  const m = sma(closes, period);
  const sd = closes.map((_, i) => {
    if (m[i] == null) return null;
    const w = closes.slice(i + 1 - period, i + 1);
    const mean = m[i] as number;
    return Math.sqrt(w.reduce((s, x) => s + (x - mean) ** 2, 0) / period);
  });
  return { mid: m, upper: m.map((x, i) => (x == null ? null : x + k * (sd[i] as number))), lower: m.map((x, i) => (x == null ? null : x - k * (sd[i] as number))) };
}

/** Volume-weighted average price from the first candle (one session). */
export function vwap(candles: Candle[]): Series {
  let pv = 0;
  let vol = 0;
  return candles.map((c) => {
    const typical = (c.h + c.l + c.c) / 3;
    pv += typical * c.v;
    vol += c.v;
    return vol ? pv / vol : null;
  });
}

/** Fibonacci retracement levels between a swing low and high (measured down from the high). */
export function fibLevels(low: number, high: number): { ratio: number; price: number }[] {
  return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].map((ratio) => ({ ratio, price: r2(high - (high - low) * ratio) }));
}

/** Merge every `factor` candles into one (a higher timeframe from the same data). */
export function aggregate(candles: Candle[], factor: number): Candle[] {
  if (factor <= 1) return candles;
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += factor) {
    const g = candles.slice(i, i + factor);
    out.push({ o: g[0].o, c: g[g.length - 1].c, h: Math.max(...g.map((x) => x.h)), l: Math.min(...g.map((x) => x.l)), v: g.reduce((s, x) => s + x.v, 0) });
  }
  return out;
}

export const highest = (cs: Candle[]) => Math.max(...cs.map((c) => c.h));
export const lowest = (cs: Candle[]) => Math.min(...cs.map((c) => c.l));

export interface Swing {
  i: number;
  kind: "high" | "low";
  price: number;
}

/** Swing highs and lows: a candle whose high (low) is the highest (lowest) of the `w` candles on each side. */
export function swings(candles: Candle[], w = 2): Swing[] {
  const out: Swing[] = [];
  for (let i = w; i < candles.length - w; i++) {
    const win = candles.slice(i - w, i + w + 1);
    if (candles[i].h === Math.max(...win.map((c) => c.h))) out.push({ i, kind: "high", price: candles[i].h });
    if (candles[i].l === Math.min(...win.map((c) => c.l))) out.push({ i, kind: "low", price: candles[i].l });
  }
  return out;
}

/** Fisher–Yates with a seed: the same order on every device. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
