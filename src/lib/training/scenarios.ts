// "Predict the next move" scenarios. All simulated (and labelled so), all seeded, so the same scenario always
// shows the same candles and has the same outcome. The outcome is never chosen by your answer: it's measured from
// the hidden candles with classifyMove (close `horizon` candles later vs the last visible close, in ATRs).

import { aggregate, highest, lowest, MOVE_HORIZON, MOVE_THRESHOLD_ATR, shape, walk, type Candle, type Leg } from "./candles";
import { appendPattern, PATTERN_BY_ID } from "./patterns";
import type { Annotation, ChartSpec, Difficulty, Overlay, PredictScenario, Signal } from "./types";

const U = 2;
type Row = [number, number, number, number, number?];

/** Future candles that rise / fall / chop by a known amount (in units), so outcomes are clear-cut. */
const FUTURE: Record<"up" | "down" | "flat" | "upSlow" | "downSlow", Row[]> = {
  up: [[0.05, 1.1, -0.2, 0.95, 1.4], [0, 1.0, -0.25, 0.85, 1.2], [0, 1.1, -0.3, 0.9, 1.2], [0, 0.8, -0.5, 0.3], [0, 0.7, -0.4, 0.4]],
  down: [[-0.05, 0.2, -1.1, -0.95, 1.4], [0, 0.25, -1.0, -0.85, 1.2], [0, 0.3, -1.1, -0.9, 1.2], [0, 0.5, -0.8, -0.3], [0, 0.4, -0.7, -0.4]],
  flat: [[0, 0.45, -0.4, 0.2, 0.8], [0, 0.35, -0.5, -0.3, 0.7], [0, 0.4, -0.35, 0.15, 0.7], [0, 0.4, -0.45, -0.1], [0, 0.5, -0.4, 0.2]],
  upSlow: [[0, 0.8, -0.3, 0.6], [0, 0.9, -0.3, 0.75, 1.2], [0, 1.0, -0.2, 0.85, 1.3], [0, 0.6, -0.4, 0.2], [0, 0.8, -0.3, 0.5]],
  downSlow: [[0, 0.3, -0.8, -0.6], [0, 0.3, -0.9, -0.75, 1.2], [0, 0.2, -1.0, -0.85, 1.3], [0, 0.4, -0.6, -0.2], [0, 0.3, -0.8, -0.5]],
};

export interface ScenarioDef extends PredictScenario {
  id: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
}

interface Make {
  id: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
  seed: number;
  lead: Leg[];
  /** Extra hand-shaped candles after the lead (before the pattern). */
  pre?: Row[];
  pattern?: string;
  future: Row[];
  expected: PredictScenario["expected"];
  setup: string;
  outcomeNote: string;
  signals: Signal[];
  ambiguous?: boolean;
  annotate?: (visible: Candle[], all: Candle[]) => { before?: Annotation[]; after?: Annotation[] };
  overlays?: Overlay[];
  panel?: ChartSpec["panel"];
  higher?: (all: Candle[]) => ChartSpec;
}

function make(m: Make): ScenarioDef {
  let candles = walk(m.seed, 220, U, m.lead);
  if (m.pre) candles = shape(candles, U, m.pre);
  if (m.pattern) candles = appendPattern(candles, PATTERN_BY_ID[m.pattern], U);
  const visible = candles.length;
  candles = shape(candles, U, m.future);
  const notes = m.annotate?.(candles.slice(0, visible), candles) ?? {};
  return {
    id: m.id,
    title: m.title,
    difficulty: m.difficulty,
    topic: m.topic,
    candles,
    visible,
    horizon: MOVE_HORIZON,
    threshold: MOVE_THRESHOLD_ATR,
    source: "simulated",
    timeframe: "1D",
    setup: m.setup,
    outcomeNote: m.outcomeNote,
    expected: m.expected,
    ambiguous: m.ambiguous,
    signals: m.signals,
    annotations: notes.before,
    afterReveal: notes.after,
    overlays: m.overlays,
    panel: m.panel ?? "volume",
    higher: m.higher?.(candles.slice(0, visible)),
  };
}

const sig = (id: string, label: string, valid: boolean, why: string): Signal => ({ id, label, valid, why });
const NO_RSI = sig("rsi", "RSI is overbought", false, "There's no RSI on this chart — don't assume an indicator you can't see.");
const NO_NEWS = sig("news", "Positive news just came out", false, "Nothing on the chart tells you about news.");

/** Support zone at the lowest low of the first `n` candles. */
const supportAt = (n: number) => (v: Candle[]) => {
  const low = lowest(v.slice(0, n));
  return { before: [{ kind: "band" as const, low, high: low + U * 0.6, label: "Support", tone: "up" as const }] };
};
const resistanceAt = (n: number) => (v: Candle[]) => {
  const high = highest(v.slice(0, n));
  return { before: [{ kind: "band" as const, low: high - U * 0.6, high, label: "Resistance", tone: "down" as const }] };
};

export const SCENARIOS: ScenarioDef[] = [
  // ---------------- Beginner ----------------
  make({
    id: "pm-b-hammer-support",
    title: "Hammer at support",
    difficulty: 1,
    topic: "pattern:hammer",
    seed: 101,
    lead: [{ n: 8, drift: -0.8, noise: 0.3 }, { n: 6, drift: 0.8, noise: 0.3 }, { n: 7, drift: -0.85, noise: 0.3 }],
    pattern: "hammer",
    future: FUTURE.up,
    expected: "bullish",
    setup: "Price fell back to an area where it bounced before, and printed a hammer with above-average volume.",
    outcomeNote: "Buyers defended the old support again and price rose over the next three candles. The hammer, the support level and the volume all pointed the same way — but the same setup can fail, which is why traders place a stop below the hammer's low.",
    signals: [sig("hammer", "Hammer: long lower wick, close near the high", true, "The last candle rejected lower prices."), sig("support", "Price is at an earlier support area", true, "Price turned up from this zone before."), sig("vol", "Volume rose on the hammer", true, "The hammer's volume bar is taller than recent ones."), sig("engulf", "Bearish engulfing on the last candles", false, "The last two candles don't form a bearish engulfing."), NO_RSI],
    annotate: supportAt(9),
  }),
  make({
    id: "pm-b-star-resistance",
    title: "Shooting star at resistance",
    difficulty: 1,
    topic: "pattern:shooting-star",
    seed: 102,
    lead: [{ n: 8, drift: 0.8, noise: 0.3 }, { n: 6, drift: -0.8, noise: 0.3 }, { n: 7, drift: 0.85, noise: 0.3 }],
    pattern: "shooting-star",
    future: FUTURE.down,
    expected: "bearish",
    setup: "Price rallied back into an area that stopped it before and left a long upper wick.",
    outcomeNote: "Sellers defended resistance again and price fell over the next three candles. The rejection wick at a known level was the clue.",
    signals: [sig("star", "Shooting star: long upper wick, close near the low", true, "The last candle rejected higher prices."), sig("res", "Price is at an earlier resistance area", true, "Price turned down from this zone before."), sig("hammer", "Hammer at support", false, "The wick is on top, and this is resistance, not support."), NO_NEWS],
    annotate: resistanceAt(9),
  }),
  make({
    id: "pm-b-marubozu-breakout",
    title: "Strong candle out of a range",
    difficulty: 1,
    topic: "breakouts",
    seed: 103,
    lead: [{ n: 5, drift: 0.7, noise: 0.25, volume: 0.7 }, { n: 5, drift: -0.7, noise: 0.25, volume: 0.7 }, { n: 5, drift: 0.7, noise: 0.25, volume: 0.7 }, { n: 4, drift: -0.6, noise: 0.25, volume: 0.7 }],
    pre: [[0, 0.5, -0.3, 0.4, 0.7], [0, 0.6, -0.2, 0.5, 0.8]],
    pattern: "marubozu",
    future: FUTURE.upSlow,
    expected: "bullish",
    setup: "After a long sideways range, a big bullish candle with almost no wicks closed above the top of the range on heavy volume.",
    outcomeNote: "The breakout held and price kept rising. A full-bodied candle on heavy volume shows buyers in control. Breakouts can still fail — a close back inside the range would have been the warning.",
    signals: [sig("maru", "Strong bullish candle with tiny wicks", true, "The last candle is a bullish marubozu."), sig("break", "Close above the range's resistance", true, "It closed above the earlier highs."), sig("vol", "Volume spike on the breakout", true, "Volume on the last candle is well above the range's."), sig("doji", "Doji showing indecision", false, "The last candle has a big body — the opposite of a doji.")],
    annotate: (v) => ({ before: [{ kind: "hline", price: highest(v.slice(0, -1)), label: "Range top", tone: "down", dashed: true }] }),
  }),
  make({
    id: "pm-b-doji-range",
    title: "Doji in the middle of a range",
    difficulty: 1,
    topic: "pattern:doji",
    seed: 104,
    lead: [{ n: 5, drift: 0.7, noise: 0.25 }, { n: 5, drift: -0.7, noise: 0.25 }, { n: 5, drift: 0.7, noise: 0.25 }, { n: 3, drift: -0.6, noise: 0.25 }],
    pattern: "doji",
    future: FUTURE.flat,
    expected: "sideways",
    setup: "The market has been going sideways. A doji formed roughly in the middle of the range.",
    outcomeNote: "Nothing much happened: price kept chopping sideways. A doji in the middle of a range is just more indecision — it's only worth noticing at a level or after a strong move.",
    signals: [sig("range", "Market is in a sideways range", true, "Highs and lows have been repeating."), sig("doji", "Doji: open and close almost equal", true, "The last candle has a tiny body."), sig("mid", "The doji is in the middle of the range, away from levels", true, "It's not at support or resistance."), sig("trend", "Strong uptrend in place", false, "There's no trend — highs aren't rising.")],
  }),
  make({
    id: "pm-b-engulfing-top",
    title: "Bearish engulfing after a rally",
    difficulty: 1,
    topic: "pattern:bearish-engulfing",
    seed: 105,
    lead: [{ n: 8, drift: 0.8, noise: 0.3 }, { n: 5, drift: -0.7, noise: 0.3 }, { n: 5, drift: 0.75, noise: 0.3 }],
    pattern: "bearish-engulfing",
    future: FUTURE.down,
    expected: "bearish",
    setup: "A rally reached the area of the previous high, and a large bearish candle swallowed the prior bullish one.",
    outcomeNote: "Sellers followed through and price dropped. The engulfing at the old high was the warning; follow-through below its low confirmed it.",
    signals: [sig("engulf", "Bearish engulfing", true, "The last red body covers the previous green body."), sig("res", "At the previous high (resistance)", true, "Price is back at the earlier peak."), sig("vol", "Heavy volume on the bearish candle", true, "Volume jumped on the engulfing candle."), sig("hammer", "Hammer showing buying", false, "There's no long lower wick at a low.")],
    annotate: resistanceAt(10),
  }),

  // ---------------- Intermediate ----------------
  make({
    id: "pm-i-morning-star",
    title: "Morning star after a decline",
    difficulty: 2,
    topic: "pattern:morning-star",
    seed: 201,
    lead: [{ n: 8, drift: -0.7, noise: 0.35 }, { n: 5, drift: 0.6, noise: 0.35 }, { n: 7, drift: -0.8, noise: 0.35 }],
    pattern: "morning-star",
    future: FUTURE.upSlow,
    expected: "bullish",
    setup: "A decline into an earlier low ends with a big red candle, a small star, and a strong green candle.",
    outcomeNote: "Price continued higher after the third candle. The morning star at support, with the strongest volume on the bullish third candle, made a well-aligned reversal setup.",
    signals: [sig("ms", "Morning star (3 candles)", true, "Big red, small star, strong green closing above the first candle's middle."), sig("support", "At the earlier swing low", true, "Price reached the previous low area."), sig("vol", "Highest volume on the bullish candle", true, "The third candle's volume stands out."), sig("lh", "A lower high has just formed", false, "The last move is up, not a lower high.")],
    annotate: supportAt(10),
  }),
  make({
    id: "pm-i-hammer-fails",
    title: "Hammer in a steep downtrend",
    difficulty: 2,
    topic: "pattern:hammer",
    seed: 202,
    lead: [{ n: 22, drift: -0.9, noise: 0.3, volume: 1.2 }],
    pattern: "hammer",
    future: FUTURE.down,
    expected: "bearish",
    setup: "A steep, steady downtrend with no support nearby prints a hammer.",
    outcomeNote: "The hammer failed: the downtrend continued. Without a support level and with every rally being sold, one bullish-looking candle wasn't enough. Patterns are context-dependent — this is why confirmation matters.",
    signals: [sig("hammer", "Hammer shape", true, "The shape is there — but shape alone isn't enough."), sig("trend", "Strong downtrend: lower highs and lower lows", true, "Every swing has been lower."), sig("nosupport", "No support level nearby", true, "Price is at new lows — nothing below to lean on."), sig("support", "Price at a major support", false, "There's no earlier low here; price is at new lows.")],
  }),
  make({
    id: "pm-i-inside-bar",
    title: "Inside bar in an uptrend",
    difficulty: 2,
    topic: "pattern:inside-bar",
    seed: 203,
    lead: [{ n: 10, drift: 0.6, noise: 0.3 }, { n: 4, drift: -0.4, noise: 0.3 }, { n: 8, drift: 0.7, noise: 0.3 }],
    pattern: "inside-bar",
    future: FUTURE.up,
    expected: "bullish",
    setup: "In a steady uptrend, a big bullish candle is followed by a small inside bar on light volume.",
    outcomeNote: "Price broke above the mother bar's high and the uptrend continued. An inside bar is a pause; with the trend up, a break upward was the more likely resolution — but traders still wait for the break.",
    signals: [sig("inside", "Inside bar: range within the previous candle", true, "The last candle's high and low are inside the one before."), sig("trend", "Uptrend: higher highs and higher lows", true, "Swings are rising."), sig("lowvol", "Light volume on the inside bar (a quiet pause)", true, "Volume dropped on the pause."), sig("outside", "Outside bar", false, "It's the opposite: the range is inside, not outside.")],
  }),
  make({
    id: "pm-i-retest",
    title: "Breakout, then a pullback to the old high",
    difficulty: 2,
    topic: "breakouts",
    seed: 204,
    lead: [{ n: 5, drift: 0.7, noise: 0.25 }, { n: 5, drift: -0.7, noise: 0.25 }, { n: 5, drift: 0.7, noise: 0.25 }, { n: 3, drift: -0.5, noise: 0.25 }],
    pre: [[0, 2.2, -0.1, 2.0, 2.4], [0, 0.9, -0.2, 0.7, 1.4], [0, 0.4, -0.9, -0.7, 0.7], [0, 0.2, -0.9, -0.6, 0.6]],
    pattern: "hammer",
    future: FUTURE.up,
    expected: "bullish",
    setup: "Price broke out of a range on big volume, pulled back on light volume to the old range top, and printed a hammer there.",
    outcomeNote: "The retest held and price resumed upward. Old resistance acting as new support, a light-volume pullback and a hammer at the level all lined up.",
    signals: [sig("retest", "Pullback to the broken resistance (now support)", true, "Price came back to the old range top."), sig("lightvol", "Pullback on lighter volume than the breakout", true, "Volume shrank on the way down."), sig("hammer", "Hammer at the level", true, "Long lower wick right at the retest."), sig("false", "False breakout", false, "Price stayed above the old range for several candles.")],
    annotate: (v) => ({ before: [{ kind: "hline", price: highest(v.slice(0, 18)), label: "Old resistance", tone: "neutral", dashed: true }] }),
  }),
  make({
    id: "pm-i-false-breakout",
    title: "Poke above resistance",
    difficulty: 2,
    topic: "breakouts",
    seed: 205,
    lead: [{ n: 5, drift: 0.7, noise: 0.25 }, { n: 5, drift: -0.7, noise: 0.25 }, { n: 5, drift: 0.7, noise: 0.25 }, { n: 4, drift: -0.6, noise: 0.25 }, { n: 4, drift: 0.7, noise: 0.25 }],
    pre: [[0, 1.4, -0.1, 0.4, 1.0]],
    pattern: "bearish-engulfing",
    future: FUTURE.downSlow,
    expected: "bearish",
    setup: "Price pushed above the range top on ordinary volume, couldn't hold it, and the next candle engulfed the breakout candle.",
    outcomeNote: "It was a false breakout: price fell back through the range. Weak volume on the break and a bearish engulfing back inside were the signs that buyers couldn't hold the higher prices.",
    signals: [sig("fail", "Close back inside the range", true, "The breakout didn't hold on a closing basis."), sig("engulf", "Bearish engulfing", true, "The last body covers the previous one."), sig("weakvol", "Breakout volume wasn't special", true, "The breakout candle's volume was ordinary."), sig("retest", "Successful retest of the breakout", false, "Price fell back inside instead of holding above.")],
    annotate: (v) => ({ before: [{ kind: "hline", price: highest(v.slice(0, 23)), label: "Range top", tone: "down", dashed: true }] }),
  }),
  make({
    id: "pm-i-evening-star",
    title: "Evening star at the highs",
    difficulty: 2,
    topic: "pattern:evening-star",
    seed: 206,
    lead: [{ n: 8, drift: 0.75, noise: 0.35 }, { n: 5, drift: -0.6, noise: 0.35 }, { n: 5, drift: 0.75, noise: 0.35 }],
    pattern: "evening-star",
    future: FUTURE.down,
    expected: "bearish",
    setup: "An advance into the prior high ends with a big green candle, a small star and a strong red candle.",
    outcomeNote: "Price followed through lower. The three-candle reversal at an old high, with the heaviest volume on the bearish candle, was a well-aligned warning.",
    signals: [sig("es", "Evening star", true, "Big green, small star, strong red closing below the first candle's middle."), sig("res", "At the previous high", true, "Price reached the earlier peak."), sig("vol", "Highest volume on the bearish candle", true, "The third candle's volume stands out."), sig("ms", "Morning star", false, "That's the bullish mirror image, at lows.")],
    annotate: resistanceAt(10),
  }),

  // ---------------- Advanced ----------------
  make({
    id: "pm-a-engulf-under-resistance",
    title: "Bullish candle under resistance in a downtrend",
    difficulty: 3,
    topic: "setups",
    seed: 301,
    lead: [{ n: 8, drift: -0.7, noise: 0.3 }, { n: 4, drift: 0.7, noise: 0.3 }, { n: 6, drift: -0.7, noise: 0.3 }, { n: 3, drift: 0.4, noise: 0.3 }],
    pattern: "bullish-engulfing",
    future: FUTURE.flat,
    expected: "sideways",
    ambiguous: true,
    setup: "The bigger trend is down. A bullish engulfing has just formed — right below the last swing high, which may act as resistance.",
    outcomeNote: "Price went sideways. The bullish engulfing and the downtrend + nearby resistance pulled in opposite directions. 'Uncertain' was a perfectly good answer here — competing signals are a reason to wait.",
    signals: [sig("engulf", "Bullish engulfing", true, "The last green body covers the red one before it."), sig("downtrend", "Bigger trend is down (lower highs)", true, "The swing highs have been falling."), sig("res", "Resistance just above", true, "The previous swing high is close above."), sig("support", "Major support right here", false, "Price is in the middle of the down-leg, not at a major low.")],
    annotate: (v) => ({ before: [{ kind: "hline", price: highest(v.slice(12, 19)), label: "Last swing high", tone: "down", dashed: true }] }),
  }),
  make({
    id: "pm-a-divergence",
    title: "New high, weaker momentum",
    difficulty: 3,
    topic: "rsi",
    seed: 302,
    lead: [{ n: 8, drift: 0.2, noise: 0.4 }, { n: 12, drift: 1.0, noise: 0.25, volume: 1.5 }, { n: 5, drift: -0.7, noise: 0.25 }, { n: 8, drift: 0.45, noise: 0.25, volume: 0.6 }],
    pattern: "shooting-star",
    future: FUTURE.down,
    expected: "bearish",
    setup: "Price edged to a new high on falling volume, while RSI made a lower high. The last candle is a shooting star.",
    outcomeNote: "Price turned down. The new high came with less momentum (bearish RSI divergence) and less volume, and the shooting star showed rejection. Divergence often warns before price turns — but it can also persist for a while.",
    signals: [sig("div", "Bearish RSI divergence (price higher high, RSI lower high)", true, "RSI peaked lower on the second high."), sig("vol", "Volume fading into the high", true, "The second push came on lighter volume."), sig("star", "Shooting star at the high", true, "Long upper wick, close near the low."), sig("os", "RSI oversold", false, "RSI is high, not below 30.")],
    panel: "rsi",
  }),
  make({
    id: "pm-a-mtf",
    title: "Pullback in a higher-timeframe uptrend",
    difficulty: 3,
    topic: "structure",
    seed: 303,
    lead: [{ n: 16, drift: 0.7, noise: 0.35 }, { n: 4, drift: -0.5, noise: 0.3 }, { n: 10, drift: 0.7, noise: 0.35 }, { n: 6, drift: -0.65, noise: 0.25, volume: 0.6 }],
    pattern: "hammer",
    future: FUTURE.up,
    expected: "bullish",
    setup: "The weekly view (top) is a clean uptrend. On the daily, price pulled back on light volume to the 20 EMA and printed a hammer.",
    outcomeNote: "The pullback ended and the uptrend resumed. Higher timeframe trend, a quiet pullback to a rising average and a hammer all lined up.",
    signals: [sig("htf", "Higher timeframe uptrend", true, "The weekly chart makes higher highs and lows."), sig("ema", "Pullback to the rising 20 EMA", true, "Price touched the average from above."), sig("hammer", "Hammer on the daily", true, "Long lower wick at the average."), sig("ll", "Daily made a lower low below the last swing low", false, "The pullback stayed above the last swing low.")],
    overlays: [{ kind: "ema", period: 20 }],
    higher: (v) => ({ candles: aggregate(v, 5), source: "simulated", timeframe: "1W", title: "Weekly (same market)" }),
  }),
  make({
    id: "pm-a-squeeze",
    title: "Tight squeeze, no edge",
    difficulty: 3,
    topic: "bollinger",
    seed: 304,
    lead: [{ n: 14, drift: 0.2, noise: 0.6 }, { n: 16, drift: 0, noise: 0.2, range: 0.4, volume: 0.6 }],
    pattern: "spinning-top",
    future: FUTURE.up,
    expected: "bullish",
    ambiguous: true,
    setup: "Bollinger Bands are at their tightest. The last candle is a spinning top. Nothing on the chart says which way the squeeze will break.",
    outcomeNote: "The squeeze broke upward. But nothing visible beforehand pointed up rather than down — 'uncertain' was a valid, honest answer. A squeeze tells you a move may come, not its direction.",
    signals: [sig("squeeze", "Bands very narrow (squeeze)", true, "Volatility is at a low."), sig("spin", "Spinning top (indecision)", true, "Small body, wicks both sides."), sig("dir", "The squeeze shows which way it will break", false, "Bands measure volatility, not direction."), sig("trend", "Strong trend in progress", false, "Price is flat inside the squeeze.")],
    overlays: [{ kind: "bb" }],
  }),
  make({
    id: "pm-a-gap-fill",
    title: "Gap up on light volume into resistance",
    difficulty: 3,
    topic: "gaps-volume",
    seed: 305,
    lead: [{ n: 8, drift: 0.8, noise: 0.3 }, { n: 7, drift: -0.7, noise: 0.3 }, { n: 4, drift: 0.3, noise: 0.3 }],
    pre: [[2.2, 2.9, 2.0, 2.4, 0.7]],
    pattern: "shooting-star",
    future: FUTURE.down,
    expected: "bearish",
    setup: "Price gapped up on below-average volume straight into the previous high, then printed a shooting star.",
    outcomeNote: "The gap filled as price fell back. Light volume showed little conviction behind the gap, and the shooting star at the old high showed rejection.",
    signals: [sig("gap", "Gap up", true, "The open jumped above the previous close."), sig("lightvol", "Light volume on the gap", true, "Volume was below average."), sig("res", "Gap ran into the previous high", true, "The earlier peak is right there."), sig("bigvol", "Very heavy volume confirming the gap", false, "Volume was light, not heavy.")],
    annotate: resistanceAt(9),
  }),
];

export const SCENARIO_BY_ID: Record<string, ScenarioDef> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
