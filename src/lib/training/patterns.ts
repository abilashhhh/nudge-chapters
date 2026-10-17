// The candlestick patterns taught in Level 3: what each one is, how to read it, and a drawing of it in the
// kind of trend where it usually shows up. Drawings are simulated and seeded; tests check each one really
// matches its definition.

import { shape, walk, type Candle } from "./candles";
import type { ChartSpec, Difficulty, Tone } from "./types";

type Rel = { o: number; h: number; l: number; c: number; v?: number };

export interface PatternInfo {
  id: string;
  name: string;
  size: 1 | 2 | 3;
  bias: "bullish" | "bearish" | "neutral";
  /** The trend it is drawn after (and usually appears after). */
  context: "downtrend" | "uptrend" | "any";
  difficulty: Difficulty;
  /** One line. */
  short: string;
  structure: string[];
  interpretation: string;
  where: string;
  indicates: string;
  confirmation: string;
  mistakes: string[];
  limitations: string;
  /** Patterns people mix it up with. */
  lookalikes: string[];
  /** The pattern's candles, each relative to the previous close, in units of a normal candle's range. */
  rows: Rel[];
}

export const PATTERNS: PatternInfo[] = [
  {
    id: "doji",
    name: "Doji",
    size: 1,
    bias: "neutral",
    context: "any",
    difficulty: 1,
    short: "Open and close almost equal: buyers and sellers ended the candle even.",
    structure: ["Body is tiny — 10% of the candle's range or less.", "Wicks can be any length on either side.", "Colour doesn't matter; the near-equal open and close is the point."],
    interpretation: "Indecision. Neither side won the candle. After a long run it can mean the run is losing energy; in a quiet range it means very little.",
    where: "Anywhere, but it is most worth noticing after a strong trend or at a support or resistance level.",
    indicates: "A pause and a possible change of balance — not a direction on its own.",
    confirmation: "Wait for the next candle: a strong close away from the doji in the opposite direction to the trend shows who took control.",
    mistakes: ["Treating every doji as a reversal signal.", "Ignoring where it formed — a doji in the middle of a range is noise.", "Not waiting for the next candle."],
    limitations: "Dojis are very common on short timeframes and in quiet markets, so most of them don't lead anywhere.",
    lookalikes: ["spinning-top", "shooting-star", "hammer"],
    rows: [{ o: 0, h: 0.75, l: -0.7, c: 0.03 }],
  },
  {
    id: "hammer",
    name: "Hammer",
    size: 1,
    bias: "bullish",
    context: "downtrend",
    difficulty: 1,
    short: "After a fall: a long lower wick and a small body near the top.",
    structure: ["Small body at the top of the range.", "Lower wick at least twice the body.", "Little or no upper wick.", "Appears after a decline."],
    interpretation: "Sellers pushed price well down during the candle, but buyers pushed it back up before the close. The rejection of lower prices hints that selling may be tiring.",
    where: "At the end of a decline, ideally at a support level.",
    indicates: "A possible bullish reversal or bounce.",
    confirmation: "A bullish candle closing above the hammer's high on the next candle, ideally with rising volume.",
    mistakes: ["Calling it a hammer in an uptrend (that same shape is a hanging man).", "Buying before confirmation.", "Ignoring a lower wick that's barely longer than the body."],
    limitations: "In a strong downtrend, hammers often fail and price keeps falling. The pattern says more at a clear support level.",
    lookalikes: ["hanging-man", "inverted-hammer", "doji"],
    rows: [{ o: -0.15, h: 0.13, l: -1.45, c: 0.1, v: 1.4 }],
  },
  {
    id: "hanging-man",
    name: "Hanging Man",
    size: 1,
    bias: "bearish",
    context: "uptrend",
    difficulty: 2,
    short: "After a rise: the hammer shape — long lower wick, small body near the top.",
    structure: ["Same shape as a hammer: small body at the top, long lower wick (2× body or more), little upper wick.", "Appears after an advance."],
    interpretation: "During an uptrend, sellers managed to drive price sharply lower inside the candle. Buyers recovered, but the sell-off shows supply is appearing.",
    where: "Near the top of a rise, often at resistance.",
    indicates: "A possible bearish reversal — a warning, not a verdict.",
    confirmation: "A bearish candle closing below the hanging man's body on the next candle.",
    mistakes: ["Confusing it with a hammer — the shape is the same, the trend before it decides the name.", "Selling on the shape alone in a strong uptrend."],
    limitations: "One of the less reliable patterns without confirmation; strong uptrends shrug off many hanging men.",
    lookalikes: ["hammer", "shooting-star", "doji"],
    rows: [{ o: 0.15, h: 0.18, l: -1.3, c: -0.05, v: 1.3 }],
  },
  {
    id: "shooting-star",
    name: "Shooting Star",
    size: 1,
    bias: "bearish",
    context: "uptrend",
    difficulty: 1,
    short: "After a rise: a long upper wick and a small body near the low.",
    structure: ["Small body at the bottom of the range.", "Upper wick at least twice the body.", "Little or no lower wick.", "Appears after an advance."],
    interpretation: "Buyers pushed price well up, then sellers pushed it all the way back down before the close. Higher prices were rejected.",
    where: "After a rise, often at resistance.",
    indicates: "A possible bearish reversal or pullback.",
    confirmation: "A bearish candle closing below the shooting star's low.",
    mistakes: ["Calling it a shooting star after a decline (that's an inverted hammer).", "Ignoring the trend — in a strong uptrend one rejection may just be a pause."],
    limitations: "It shows one candle's rejection. Without a level and follow-through, price often resumes upward.",
    lookalikes: ["inverted-hammer", "doji", "hanging-man"],
    rows: [{ o: 0.1, h: 1.4, l: -0.13, c: -0.1, v: 1.4 }],
  },
  {
    id: "inverted-hammer",
    name: "Inverted Hammer",
    size: 1,
    bias: "bullish",
    context: "downtrend",
    difficulty: 2,
    short: "After a fall: a long upper wick and a small body near the low.",
    structure: ["Same shape as a shooting star: small body at the bottom, upper wick 2× body or more.", "Appears after a decline."],
    interpretation: "After a decline, buyers tried to push higher. They couldn't hold it, but the attempt shows buying interest appearing.",
    where: "At the end of a decline, often near support.",
    indicates: "A possible bullish reversal — weaker than a hammer, it needs confirmation.",
    confirmation: "A bullish candle the next day that closes above the inverted hammer's body.",
    mistakes: ["Confusing it with a shooting star — the trend before it decides the name.", "Acting without confirmation."],
    limitations: "Buyers were rejected inside the candle, so it is a tentative signal. Many fail in strong downtrends.",
    lookalikes: ["shooting-star", "hammer", "doji"],
    rows: [{ o: -0.1, h: 1.35, l: -0.13, c: 0.12, v: 1.2 }],
  },
  {
    id: "marubozu",
    name: "Marubozu",
    size: 1,
    bias: "bullish",
    context: "any",
    difficulty: 1,
    short: "A full body with almost no wicks: one side controlled the whole candle.",
    structure: ["Body is at least 90% of the range.", "Little or no wick at either end.", "Bullish marubozu: opens at the low, closes at the high (bearish: the reverse)."],
    interpretation: "One side was in control from open to close. A bullish marubozu shows strong buying; a bearish one strong selling.",
    where: "At the start of a breakout or in the middle of a strong trend.",
    indicates: "Strength and possible continuation in the candle's direction.",
    confirmation: "Follow-through in the same direction, and no immediate reversal of the whole body.",
    mistakes: ["Chasing after a very large marubozu far from any level — the risk to a sensible stop is large.", "Forgetting the bearish version exists."],
    limitations: "Big candles can come from news spikes that reverse quickly. Size relative to recent candles matters.",
    lookalikes: ["three-white-soldiers", "bullish-engulfing", "spinning-top"],
    rows: [{ o: 0, h: 1.62, l: -0.02, c: 1.6, v: 1.8 }],
  },
  {
    id: "spinning-top",
    name: "Spinning Top",
    size: 1,
    bias: "neutral",
    context: "any",
    difficulty: 1,
    short: "A small body with wicks on both sides: movement both ways, little net progress.",
    structure: ["Small body (more than a doji, at most about a third of the range).", "Upper and lower wicks both longer than the body."],
    interpretation: "Indecision: both buyers and sellers moved price but neither held control.",
    where: "Anywhere; meaningful after a strong move or at a level.",
    indicates: "Momentum pausing.",
    confirmation: "The next candle's direction.",
    mistakes: ["Treating it as a reversal signal by itself.", "Mixing it up with a doji (doji body is even smaller)."],
    limitations: "Very common; on its own it almost never decides a trade.",
    lookalikes: ["doji", "hammer", "shooting-star"],
    rows: [{ o: 0, h: 0.75, l: -0.5, c: 0.25 }],
  },
  {
    id: "bullish-engulfing",
    name: "Bullish Engulfing",
    size: 2,
    bias: "bullish",
    context: "downtrend",
    difficulty: 1,
    short: "A bearish candle followed by a bigger bullish body that covers it.",
    structure: ["Candle 1: bearish.", "Candle 2: bullish, opening at or below candle 1's close and closing at or above its open.", "Candle 2's body fully covers candle 1's body."],
    interpretation: "Buyers overpowered the previous candle's selling completely in one candle.",
    where: "After a decline, ideally at support.",
    indicates: "A possible bullish reversal.",
    confirmation: "Price holding above the engulfing candle's low and making a higher close next; stronger with high volume on candle 2.",
    mistakes: ["Counting wicks instead of bodies.", "Taking it in the middle of a choppy range where engulfing candles appear constantly."],
    limitations: "Common on short timeframes; context (trend + level) decides whether it means anything.",
    lookalikes: ["piercing", "outside-bar", "morning-star"],
    rows: [
      { o: 0, h: 0.1, l: -0.65, c: -0.55 },
      { o: -0.1, h: 0.95, l: -0.2, c: 0.85, v: 1.7 },
    ],
  },
  {
    id: "bearish-engulfing",
    name: "Bearish Engulfing",
    size: 2,
    bias: "bearish",
    context: "uptrend",
    difficulty: 1,
    short: "A bullish candle followed by a bigger bearish body that covers it.",
    structure: ["Candle 1: bullish.", "Candle 2: bearish, opening at or above candle 1's close and closing at or below its open.", "Candle 2's body fully covers candle 1's body."],
    interpretation: "Sellers overpowered the previous candle's buying completely.",
    where: "After a rise, ideally at resistance.",
    indicates: "A possible bearish reversal.",
    confirmation: "A lower close next, and price staying below the engulfing candle's high.",
    mistakes: ["Counting wicks instead of bodies.", "Shorting it in a strong uptrend with no resistance nearby."],
    limitations: "Like its bullish twin, it needs a trend before it and a level to matter.",
    lookalikes: ["dark-cloud", "outside-bar", "evening-star"],
    rows: [
      { o: 0, h: 0.65, l: -0.1, c: 0.55 },
      { o: 0.1, h: 0.2, l: -0.95, c: -0.85, v: 1.7 },
    ],
  },
  {
    id: "piercing",
    name: "Piercing Pattern",
    size: 2,
    bias: "bullish",
    context: "downtrend",
    difficulty: 2,
    short: "A big bearish candle, then a bullish one that opens lower and closes above its midpoint.",
    structure: ["Candle 1: strong bearish.", "Candle 2: opens below candle 1's close, closes above the middle of candle 1's body but below its open."],
    interpretation: "Sellers opened lower, but buyers recovered more than half of the previous candle's loss.",
    where: "After a decline, near support.",
    indicates: "A possible bullish reversal — a little weaker than a bullish engulfing.",
    confirmation: "A further bullish close above candle 2.",
    mistakes: ["Calling it piercing when candle 2 closes below the midpoint (that's much weaker).", "Calling it piercing when candle 2 closes above candle 1's open (that's engulfing)."],
    limitations: "Needs a gap or lower open, which is rare in markets that trade around the clock.",
    lookalikes: ["bullish-engulfing", "tweezer-bottom", "morning-star"],
    rows: [
      { o: 0, h: 0.1, l: -1.1, c: -1.0 },
      { o: -0.25, h: 0.7, l: -0.3, c: 0.65, v: 1.4 },
    ],
  },
  {
    id: "dark-cloud",
    name: "Dark Cloud Cover",
    size: 2,
    bias: "bearish",
    context: "uptrend",
    difficulty: 2,
    short: "A big bullish candle, then a bearish one that opens higher and closes below its midpoint.",
    structure: ["Candle 1: strong bullish.", "Candle 2: opens above candle 1's close, closes below the middle of candle 1's body but above its open."],
    interpretation: "Buyers opened higher, but sellers took back more than half of the previous candle's gain.",
    where: "After a rise, near resistance.",
    indicates: "A possible bearish reversal.",
    confirmation: "A further bearish close below candle 2.",
    mistakes: ["Calling it when candle 2 closes above the midpoint.", "Calling it when candle 2 closes below candle 1's open (that's bearish engulfing)."],
    limitations: "A weaker signal than bearish engulfing; context matters a lot.",
    lookalikes: ["bearish-engulfing", "tweezer-top", "evening-star"],
    rows: [
      { o: 0, h: 1.1, l: -0.1, c: 1.0 },
      { o: 0.25, h: 0.3, l: -0.7, c: -0.65, v: 1.4 },
    ],
  },
  {
    id: "morning-star",
    name: "Morning Star",
    size: 3,
    bias: "bullish",
    context: "downtrend",
    difficulty: 2,
    short: "Big bearish candle, a small 'star', then a strong bullish candle.",
    structure: ["Candle 1: long bearish.", "Candle 2: small body (a star), at or below candle 1's close.", "Candle 3: bullish, closing above the middle of candle 1."],
    interpretation: "Selling ran out (the small star shows indecision), then buyers took over.",
    where: "At the end of a decline, ideally at support.",
    indicates: "A possible bullish reversal.",
    confirmation: "Candle 3 itself is part of the confirmation; volume rising on candle 3 strengthens it.",
    mistakes: ["Accepting a candle 3 that closes only slightly up.", "Ignoring the size of the star — a big middle candle isn't a star."],
    limitations: "Takes three candles to form, so the entry often comes after a good part of the bounce.",
    lookalikes: ["bullish-engulfing", "piercing", "three-white-soldiers"],
    rows: [
      { o: 0, h: 0.1, l: -1.3, c: -1.2 },
      { o: -0.15, h: 0.15, l: -0.4, c: -0.05 },
      { o: 0.05, h: 1.1, l: -0.05, c: 1.0, v: 1.6 },
    ],
  },
  {
    id: "evening-star",
    name: "Evening Star",
    size: 3,
    bias: "bearish",
    context: "uptrend",
    difficulty: 2,
    short: "Big bullish candle, a small 'star', then a strong bearish candle.",
    structure: ["Candle 1: long bullish.", "Candle 2: small body at or above candle 1's close.", "Candle 3: bearish, closing below the middle of candle 1."],
    interpretation: "Buying ran out, indecision followed, then sellers took over.",
    where: "At the end of a rise, ideally at resistance.",
    indicates: "A possible bearish reversal.",
    confirmation: "Candle 3 closing well into candle 1; follow-through lower.",
    mistakes: ["Accepting a weak third candle.", "Forgetting the trend before it."],
    limitations: "Late entry, as with the morning star; strong uptrends can resume.",
    lookalikes: ["bearish-engulfing", "dark-cloud", "three-black-crows"],
    rows: [
      { o: 0, h: 1.3, l: -0.1, c: 1.2 },
      { o: 0.15, h: 0.4, l: -0.15, c: 0.05 },
      { o: -0.05, h: 0.05, l: -1.1, c: -1.0, v: 1.6 },
    ],
  },
  {
    id: "three-white-soldiers",
    name: "Three White Soldiers",
    size: 3,
    bias: "bullish",
    context: "downtrend",
    difficulty: 2,
    short: "Three strong bullish candles in a row, each opening inside the last and closing higher.",
    structure: ["Three bullish candles with real bodies (small wicks).", "Each opens inside the previous body.", "Each closes higher than the previous."],
    interpretation: "Steady, persistent buying over three candles.",
    where: "After a decline or a long base.",
    indicates: "A possible bullish reversal or a strong start to a rise.",
    confirmation: "Volume rising across the three; price not immediately falling back into the first candle.",
    mistakes: ["Buying after three very large candles far from support — price is often stretched.", "Accepting candles with long upper wicks (sellers pushing back)."],
    limitations: "After three big candles, a pullback is common before any continuation.",
    lookalikes: ["marubozu", "morning-star", "three-black-crows"],
    rows: [
      { o: 0, h: 1.0, l: -0.05, c: 0.9 },
      { o: -0.3, h: 0.8, l: -0.35, c: 0.7, v: 1.3 },
      { o: -0.3, h: 0.85, l: -0.35, c: 0.75, v: 1.5 },
    ],
  },
  {
    id: "three-black-crows",
    name: "Three Black Crows",
    size: 3,
    bias: "bearish",
    context: "uptrend",
    difficulty: 2,
    short: "Three strong bearish candles in a row, each opening inside the last and closing lower.",
    structure: ["Three bearish candles with real bodies.", "Each opens inside the previous body.", "Each closes lower than the previous."],
    interpretation: "Steady, persistent selling over three candles.",
    where: "After a rise or at the top of a range.",
    indicates: "A possible bearish reversal or the start of a decline.",
    confirmation: "No quick recovery back above the first crow.",
    mistakes: ["Selling after the third crow when price is already far below resistance.", "Ignoring long lower wicks (buyers pushing back)."],
    limitations: "Price is often oversold after three big down candles; bounces are common.",
    lookalikes: ["evening-star", "bearish-engulfing", "three-white-soldiers"],
    rows: [
      { o: 0, h: 0.05, l: -1.0, c: -0.9 },
      { o: 0.3, h: 0.35, l: -0.8, c: -0.7, v: 1.3 },
      { o: 0.3, h: 0.35, l: -0.85, c: -0.75, v: 1.5 },
    ],
  },
  {
    id: "tweezer-top",
    name: "Tweezer Top",
    size: 2,
    bias: "bearish",
    context: "uptrend",
    difficulty: 3,
    short: "Two candles with matching highs at the top of a rise: bullish, then bearish.",
    structure: ["Candle 1: bullish.", "Candle 2: bearish.", "Both highs (almost) exactly equal."],
    interpretation: "Price was rejected at the same price twice — a small resistance level formed.",
    where: "After a rise.",
    indicates: "A possible bearish reversal.",
    confirmation: "A close below candle 2's low.",
    mistakes: ["Accepting highs that are only roughly similar.", "Ignoring the bigger picture — many matching highs are just noise."],
    limitations: "Exact equality depends on the data feed and timeframe; better used as a marker of resistance than as a signal.",
    lookalikes: ["bearish-engulfing", "dark-cloud", "shooting-star"],
    rows: [
      { o: 0, h: 0.9, l: -0.1, c: 0.75 },
      { o: 0.05, h: 0.15, l: -0.75, c: -0.65, v: 1.3 },
    ],
  },
  {
    id: "tweezer-bottom",
    name: "Tweezer Bottom",
    size: 2,
    bias: "bullish",
    context: "downtrend",
    difficulty: 3,
    short: "Two candles with matching lows at the bottom of a fall: bearish, then bullish.",
    structure: ["Candle 1: bearish.", "Candle 2: bullish.", "Both lows (almost) exactly equal."],
    interpretation: "Price was rejected at the same low twice — a small support level formed.",
    where: "After a decline.",
    indicates: "A possible bullish reversal.",
    confirmation: "A close above candle 2's high.",
    mistakes: ["Accepting lows that are only roughly similar.", "Using it in the middle of a range."],
    limitations: "As with the tweezer top, best as a marker of support, not as a stand-alone signal.",
    lookalikes: ["bullish-engulfing", "piercing", "hammer"],
    rows: [
      { o: 0, h: 0.1, l: -0.9, c: -0.75 },
      { o: -0.05, h: 0.65, l: -0.15, c: 0.55, v: 1.3 },
    ],
  },
  {
    id: "inside-bar",
    name: "Inside Bar",
    size: 2,
    bias: "neutral",
    context: "any",
    difficulty: 2,
    short: "A candle whose whole range sits inside the previous candle's range.",
    structure: ["Candle 1: the 'mother bar' (often large).", "Candle 2: its high is lower and its low is higher than candle 1's."],
    interpretation: "Consolidation: the market is pausing and range is contracting.",
    where: "After a strong move (a pause before continuing) or at a key level.",
    indicates: "A coming expansion — the break of the mother bar's high or low shows the direction.",
    confirmation: "A close beyond the mother bar's high (bullish) or low (bearish).",
    mistakes: ["Guessing the breakout direction in advance.", "Using it on very low timeframes where inside bars are everywhere."],
    limitations: "False breaks of the mother bar are common; many traders wait for a close outside.",
    lookalikes: ["outside-bar", "spinning-top", "doji"],
    rows: [
      { o: 0, h: 1.2, l: -0.2, c: 1.0 },
      { o: -0.1, h: 0.1, l: -0.6, c: -0.3, v: 0.6 },
    ],
  },
  {
    id: "outside-bar",
    name: "Outside Bar",
    size: 2,
    bias: "neutral",
    context: "any",
    difficulty: 2,
    short: "A candle whose range goes beyond both the high and the low of the previous one.",
    structure: ["Candle 2's high is above candle 1's high.", "Candle 2's low is below candle 1's low.", "Its close shows who won: near the high is bullish, near the low bearish."],
    interpretation: "Volatility expanded: both sides were tested and one side finished in control.",
    where: "At turning points and around news.",
    indicates: "Direction of the close hints at the next move; a bearish outside bar after a rise is a warning.",
    confirmation: "Follow-through beyond the outside bar's high or low.",
    mistakes: ["Confusing it with engulfing (engulfing compares bodies, outside bar compares full ranges).", "Ignoring where it closed."],
    limitations: "Big range = big stop distance. Common around news, when moves can be erratic.",
    lookalikes: ["bearish-engulfing", "bullish-engulfing", "inside-bar"],
    rows: [
      { o: 0, h: 0.4, l: -0.3, c: 0.2 },
      { o: 0.1, h: 0.4, l: -0.7, c: -0.6, v: 1.6 },
    ],
  },
];

export const PATTERN_BY_ID: Record<string, PatternInfo> = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));

/** Price level and normal candle size the drawings use. */
export const BASE_PRICE = 240;
export const UNIT = 2;

function lead(seed: number, context: PatternInfo["context"], n: number): Candle[] {
  if (context === "downtrend") return walk(seed, BASE_PRICE + n * 1.1, UNIT, [{ n, drift: -0.55, noise: 0.45 }]);
  if (context === "uptrend") return walk(seed, BASE_PRICE - n * 1.1, UNIT, [{ n, drift: 0.55, noise: 0.45 }]);
  return walk(seed, BASE_PRICE, UNIT, [{ n: Math.ceil(n / 2), drift: 0.35, noise: 0.5 }, { n: Math.floor(n / 2), drift: 0, noise: 0.5 }]);
}

/** The pattern's candles appended to `before`. */
export function appendPattern(before: Candle[], p: PatternInfo, unit = UNIT): Candle[] {
  return shape(before, unit, p.rows.map((r) => [r.o, r.h, r.l, r.c, r.v]));
}

export interface PatternDrawing {
  chart: ChartSpec;
  /** Index of the pattern's first and last candle. */
  from: number;
  to: number;
}

/**
 * A chart of the pattern in its usual setting: a trend into it, the pattern, then one example of what came
 * next (when `after` > 0). The continuation is one possible outcome, never a promise; lessons say so.
 */
export function drawPattern(p: PatternInfo, opts: { seed?: number; before?: number; after?: number; tone?: Tone; label?: boolean } = {}): PatternDrawing {
  const seed = opts.seed ?? 11;
  const before = lead(seed, p.context, opts.before ?? 14);
  let candles = appendPattern(before, p);
  const from = before.length;
  const to = candles.length - 1;
  const after = opts.after ?? 0;
  if (after > 0) {
    const drift = p.bias === "bullish" ? 0.45 : p.bias === "bearish" ? -0.45 : p.id === "outside-bar" ? -0.3 : 0.3;
    candles = [...candles, ...walk(seed + 7, candles[to].c, UNIT, [{ n: after, drift, noise: 0.4 }])];
  }
  const tone: Tone = opts.tone ?? (p.bias === "bullish" ? "up" : p.bias === "bearish" ? "down" : "brand");
  return {
    from,
    to,
    chart: {
      candles,
      source: "simulated",
      timeframe: "1D",
      annotations: [{ kind: "zone", from, to, label: opts.label === false ? undefined : p.name, tone }],
      replay: after > 0,
    },
  };
}

/** Just the pattern's candles, starting from the base price (for small diagrams and ordering questions). */
export function patternCandles(p: PatternInfo): Candle[] {
  const seedCandle: Candle = { o: BASE_PRICE, h: BASE_PRICE, l: BASE_PRICE, c: BASE_PRICE, v: 0 };
  return appendPattern([seedCandle], p).slice(1);
}
