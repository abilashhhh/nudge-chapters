// The curriculum: modules, lessons (Levels 1–5), topics and every question, in one place.
// Seed content only — nothing here is user data.

import { hashSeed, rng, shuffle } from "./candles";
import { match, multi, single, tf, calc, type LessonDef } from "./build";
import { LEVEL_1, LEVEL_2 } from "./lessons-basics";
import { LEVEL_4 } from "./lessons-charts";
import { LEVEL_5 } from "./lessons-advanced";
import { drawPattern, PATTERN_BY_ID, PATTERNS, patternCandles, UNIT, type PatternInfo } from "./patterns";
import { SCENARIOS } from "./scenarios";
import type { Difficulty, Lesson, Module, Question, Topic } from "./types";
import { rangeChart, structureChart, trendChart, breakoutChart, tradePlanChart } from "./visuals";

export const MODULES: Module[] = [
  { id: "m1-fundamentals", level: 1, title: "Stock market fundamentals", description: "What a market is, how prices move, OHLC, volume, trends and timeframes.", prerequisites: [], status: "published" },
  { id: "m2-candles", level: 2, title: "Candlestick fundamentals", description: "Bodies, wicks, strong and weak candles, and reading candles in context.", prerequisites: ["m1-fundamentals"], status: "published" },
  { id: "m3-patterns", level: 3, title: "Candlestick patterns", description: "Nineteen single- and multi-candle patterns: structure, meaning, confirmation and limits.", prerequisites: ["m2-candles"], status: "published" },
  { id: "m4-chart-analysis", level: 4, title: "Chart analysis", description: "Support and resistance, trends, breakouts, ranges, gaps, volume and multiple timeframes.", prerequisites: ["m3-patterns"], status: "published" },
  { id: "m5-advanced", level: 5, title: "Advanced technical analysis", description: "Indicators, setups, risk management and trading psychology.", prerequisites: ["m4-chart-analysis"], status: "published" },
];

// ---------------------------------------------------------------------------
// Level 3: one lesson per pattern, written from the pattern's data
// ---------------------------------------------------------------------------

const opposite = (p: PatternInfo) => PATTERNS.filter((x) => x.bias !== p.bias && x.bias !== "neutral" && x.id !== p.id);

function patternLesson(p: PatternInfo): LessonDef {
  const topic = `pattern:${p.id}`;
  const look = PATTERN_BY_ID[p.lookalikes[0]];
  const drawing = drawPattern(p, { after: 5 });
  const other = opposite(p);
  const pick = (k: number) => other[(hashSeed(p.id) + k) % other.length];
  const wrong1 = pick(0);
  const wrong2 = pick(3).id === wrong1.id ? pick(5) : pick(3);
  const quizChart = drawPattern(p, { seed: 23, label: false, tone: "neutral" }).chart;
  return {
    id: `pattern-${p.id}`,
    moduleId: "m3-patterns",
    level: 3,
    title: p.name,
    summary: p.short,
    topic,
    difficulty: p.difficulty,
    minutes: p.size === 1 ? 4 : 5,
    objectives: [`Recognise a ${p.name}`, "Know what it may indicate — and what confirms it", "Avoid the common mistakes"],
    sections: [
      { kind: "visual", title: p.name, body: `${p.short} Press Replay to watch it form, then see one example of what came next — one possible outcome, not a rule.`, chart: drawing.chart },
      { kind: "intro", body: p.interpretation },
      { kind: "breakdown", bullets: p.structure, anatomy: { candles: patternCandles(p).map((c, i) => ({ ...c, label: p.size > 1 ? `Candle ${i + 1}` : undefined })), labels: p.size === 1 } },
      { kind: "example", title: "Where it shows up", body: `${p.where} ${p.indicates}`, chart: drawPattern(p, { seed: 37 }).chart },
      p.bias === "neutral"
        ? { kind: "interpret", bull: `If the next candle breaks up and closes strongly, buyers have taken control. ${p.confirmation}`, bear: "If the next candle breaks down and closes weakly, sellers have taken control." }
        : p.bias === "bullish"
          ? { kind: "interpret", bull: `${p.indicates} ${p.confirmation}`, bear: `When it fails: ${p.limitations}` }
          : { kind: "interpret", bull: `When it fails: ${p.limitations}`, bear: `${p.indicates} ${p.confirmation}` },
      { kind: "mistakes", bullets: [...p.mistakes, `Limitation: ${p.limitations}`] },
      {
        kind: "scenario",
        title: `Don't confuse it with a ${look.name}`,
        compare: [
          { title: p.name, caption: p.short, chart: drawPattern(p, { seed: 41 }).chart },
          { title: look.name, caption: look.short, chart: drawPattern(look, { seed: 41 }).chart },
        ],
        ask: { question: `How do you tell a ${p.name} from a ${look.name}?`, answer: `${p.name}: ${p.structure.join(" ")} ${look.name}: ${look.structure.join(" ")}` },
      },
      { kind: "summary", bullets: [p.short, `Confirmation: ${p.confirmation}`, "Patterns describe what happened; they don't guarantee what happens next."] },
    ],
    questions: [
      single(
        `pat-${p.id}-id`,
        topic,
        p.difficulty,
        `Which pattern is highlighted${p.size > 1 ? ` (the last ${p.size} candles)` : ""}?`,
        [[p.id, p.name], ...p.lookalikes.slice(0, 3).map((id) => [id, PATTERN_BY_ID[id].name, `A ${PATTERN_BY_ID[id].name}: ${PATTERN_BY_ID[id].short}`] as [string, string, string])],
        p.id,
        `${p.name}: ${p.structure.join(" ")}`,
        { type: "pattern", chart: quizChart, hint: p.context === "any" ? "Look at the body compared with the wicks." : `Look at the trend before it — it's a ${p.context}.` },
      ),
      single(
        `pat-${p.id}-confirm`,
        topic,
        Math.min(3, p.difficulty + 1) as Difficulty,
        `What would confirm a ${p.name}?`,
        [["a", p.confirmation], ["b", "Nothing — the pattern alone is enough", "No candlestick pattern is reliable without confirmation and context."], ["c", "Any next candle, whatever its direction", "Confirmation needs follow-through in the pattern's direction."]],
        "a",
        p.confirmation,
      ),
      single(
        `pat-${p.id}-meaning`,
        topic,
        p.difficulty,
        `What does a ${p.name} most often suggest?`,
        [["a", p.indicates], ["b", wrong1.indicates, `That describes a ${wrong1.name}.`], ["c", wrong2.indicates, `That describes a ${wrong2.name}.`]],
        "a",
        `${p.interpretation} It suggests — it never guarantees.`,
      ),
    ],
  };
}

const LEVEL_3 = PATTERNS.map(patternLesson);

const DEFS: LessonDef[] = [...LEVEL_1, ...LEVEL_2, ...LEVEL_3, ...LEVEL_4, ...LEVEL_5];

export const LESSONS: Lesson[] = DEFS.map(({ questions, ...l }) => ({ ...l, quiz: questions.map((q) => q.id) }));
export const LESSON_BY_ID: Record<string, Lesson> = Object.fromEntries(LESSONS.map((l) => [l.id, l]));

export const TOPICS: Topic[] = DEFS.map((l) => ({ id: l.topic, label: l.level === 3 ? l.title : l.title.replace(/:.*$/, ""), level: l.level, lesson: l.id }));
export const TOPIC_BY_ID: Record<string, Topic> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
export const topicLabel = (id: string) => TOPIC_BY_ID[id]?.label ?? id;
export const PATTERN_TOPICS = TOPICS.filter((t) => t.id.startsWith("pattern:"));

// ---------------------------------------------------------------------------
// Practice questions (beyond the lessons' knowledge checks)
// ---------------------------------------------------------------------------

/** Name the pattern: several drawings per pattern; harder ones without the highlight. */
const recognition: Question[] = PATTERNS.flatMap((p) =>
  [0, 1, 2].map((k) => {
    const d = drawPattern(p, { seed: 300 + k * 17 + hashSeed(p.id) % 50, label: false, tone: "neutral" });
    const hidden = k === 2;
    const chart = hidden ? { ...d.chart, annotations: [] } : d.chart;
    const difficulty = Math.min(3, p.difficulty + (hidden ? 1 : 0)) as Difficulty;
    return single(
      `rec-${p.id}-${k}`,
      `pattern:${p.id}`,
      difficulty,
      hidden ? `The last ${p.size === 1 ? "candle forms" : `${p.size} candles form`} a pattern. Which one?` : "Which pattern is highlighted?",
      [[p.id, p.name], ...p.lookalikes.slice(0, 3).map((id) => [id, PATTERN_BY_ID[id].name, `${PATTERN_BY_ID[id].name}: ${PATTERN_BY_ID[id].short}`] as [string, string, string])],
      p.id,
      `${p.name}: ${p.structure.join(" ")}`,
      { type: "pattern", chart, hint: p.context === "any" ? "Compare the body with the wicks." : `The trend before it was a ${p.context}.` },
    );
  }),
);

/** Put the candles of a three-candle pattern in order. */
const ordering: Question[] = PATTERNS.filter((p) => p.size === 3).map((p) => {
  const cs = patternCandles(p);
  const items = cs.map((c, i) => ({ id: String(i + 1), label: `Candle ${i + 1}`, candle: c }));
  return {
    id: `ord-${p.id}`,
    topic: `pattern:${p.id}`,
    difficulty: 2 as Difficulty,
    type: "order" as const,
    prompt: `Arrange these candles to form a ${p.name}.`,
    items,
    answer: ["1", "2", "3"],
    unit: UNIT,
    explanation: `${p.name}: ${p.structure.join(" ")}`,
    hint: p.structure[0],
  };
});

/** Match patterns to explanations. */
const matching: Question[] = [0, 1, 2, 3].map((k) => {
  const pool = shuffle(PATTERNS, 900 + k).slice(0, 4);
  return match(`match-patterns-${k}`, "pattern:matching", 2, "Match each pattern to its description.", pool.map((p) => [p.name, p.short]), "Each description is the pattern's defining feature.");
});

/** Chart analysis: trend, levels, breakouts, scenarios. */
const analysis: Question[] = [
  ...[1, 2, 3].flatMap((k) => [
    single(`an-trend-up-${k}`, "trends", 1, "What is the trend on this chart?", [["up", "Uptrend"], ["down", "Downtrend", "The swings are rising."], ["side", "Sideways", "Highs and lows keep climbing."]], "up", "Higher highs and higher lows make an uptrend.", { chart: trendChart("up", 400 + k, 36) }),
    single(`an-trend-down-${k}`, "trends", 1, "What is the trend on this chart?", [["up", "Uptrend", "The swings are falling."], ["down", "Downtrend"], ["side", "Sideways", "Highs and lows keep falling."]], "down", "Lower highs and lower lows make a downtrend.", { chart: trendChart("down", 410 + k, 36) }),
    single(`an-trend-side-${k}`, "ranges", 2, "What is this market doing?", [["up", "Trending up", "Highs aren't rising."], ["down", "Trending down", "Lows aren't falling."], ["side", "Moving sideways in a range"]], "side", "Highs and lows repeat at similar prices.", { chart: trendChart("sideways", 420 + k, 36) }),
  ]),
  ...[1, 2, 3].map((k) => {
    const rc = rangeChart(430 + k, false);
    const mid = Math.round((rc.support + rc.resistance) / 2);
    return single(
      `an-support-${k}`,
      "support-resistance",
      2,
      "Which line is support?",
      [["a", "Line A", "Line A is where rallies stopped — resistance."], ["b", "Line B"], ["c", "Line C", "Price didn't turn consistently there."]],
      "b",
      "Support is where falls repeatedly stopped — the bottom of the range.",
      { type: "level", chart: { ...rc, annotations: [{ kind: "hline", price: rc.resistance, label: "A", tone: "neutral", dashed: true }, { kind: "hline", price: rc.support, label: "B", tone: "neutral", dashed: true }, { kind: "hline", price: mid, label: "C", tone: "neutral", dashed: true }] } },
    );
  }),
  single("an-breakout-1", "breakouts", 2, "What does the arrow mark?", [["a", "A breakout with volume"], ["b", "A false breakout", "Price kept going above the level."], ["c", "A breakdown", "Price moved up, not down."]], "a", "A close above resistance on a volume spike, followed by more gains.", { chart: breakoutChart("breakout", 440) }),
  single("an-breakout-2", "breakouts", 2, "What does the arrow mark?", [["a", "A breakdown below support"], ["b", "A breakout", "Price broke down, not up."], ["c", "A retest", "No pullback to the level is shown."]], "a", "A close below support with high volume.", { chart: breakoutChart("breakdown", 441) }),
  single("an-retest-1", "breakouts", 3, "After the breakout, what did the old resistance do?", [["a", "Acted as support on the pullback"], ["b", "Stopped mattering", "Price reacted to it on the pullback."], ["c", "Broke down", "The pullback held above it."]], "a", "Role reversal: broken resistance often becomes support.", { chart: breakoutChart("retest", 442) }),
  multi("an-hhhl-1", "trends", 2, "Which labels are on this chart? (Choose all that apply.)", [["hh", "Higher highs (HH)"], ["hl", "Higher lows (HL)"], ["ll", "Lower lows (LL)", "There are none."]], ["hh", "hl"], "An uptrend's swings: HH and HL.", { chart: structureChart("up", 450) }),
  multi(
    "an-scenarios-1",
    "structure",
    3,
    "Price is in an uptrend and pulling back toward a rising support. Which are reasonable plans? (Choose all that apply.)",
    [["a", "Wait for a bullish reaction at support before buying"], ["b", "Plan a stop below the support zone"], ["c", "Buy now with no stop because the trend is up", "A trend is never a guarantee; always define risk."], ["d", "Be ready for the trend to fail if support breaks"]],
    ["a", "b", "d"],
    "Good plans wait for a reaction, define risk, and accept that any setup can fail.",
    { chart: structureChart("up", 451) },
  ),
  tf("an-tf-1", "structure", 2, "A bullish 5-minute signal right under major daily resistance is a high-quality setup.", false, "The higher timeframe's resistance works against it."),
];

/** Risk and reward arithmetic, with numbers that differ per question but never per attempt. */
const riskCalcs: Question[] = [1, 2, 3, 4, 5].flatMap((k) => {
  const r = rng(700 + k);
  const entry = 100 + Math.round(r() * 400);
  const riskPer = 2 + Math.round(r() * 8);
  const mult = [1.5, 2, 2.5, 3][Math.floor(r() * 4)];
  const stop = entry - riskPer;
  const target = entry + riskPer * mult;
  const account = [50000, 100000, 200000, 500000][Math.floor(r() * 4)];
  const pct = [0.5, 1, 2][Math.floor(r() * 3)];
  const money = (account * pct) / 100;
  return [
    calc(`rr-${k}`, "risk", 2, `Entry ₹${entry}, stop ₹${stop}, target ₹${target}. What is the reward-to-risk ratio?`, mult, 0.05, `Risk = ${entry} − ${stop} = ${riskPer}. Reward = ${target} − ${entry} = ${riskPer * mult}. ${riskPer * mult} ÷ ${riskPer} = ${mult}.`),
    calc(`size-${k}`, "risk", 3, `Account ₹${account.toLocaleString("en-IN")}, risking ${pct}% per trade. Entry ₹${entry}, stop ₹${stop}. How many whole shares can you buy?`, Math.floor(money / riskPer), 0, `${pct}% of ₹${account.toLocaleString("en-IN")} = ₹${money.toLocaleString("en-IN")}. Risk per share = ₹${riskPer}. ${money} ÷ ${riskPer} = ${(money / riskPer).toFixed(2)} → ${Math.floor(money / riskPer)} shares.`, { unit: "shares" }),
  ];
});

const plan = tradePlanChart(710);
const setupErrors: Question[] = [
  multi(
    "err-plan-1",
    "risk",
    3,
    "A trader's plan for this chart: 'Buy at the entry line, put the stop 0.2 above the pullback low, risk 8% of my account, and add more if it falls.' What's wrong? (Choose all that apply.)",
    [["a", "The stop sits inside normal noise, above the low that would prove the idea wrong"], ["b", "8% of the account is far too much risk on one trade"], ["c", "Adding to a losing trade breaks the original risk plan"], ["d", "Buying a pullback in an uptrend is always wrong", "Pullbacks in uptrends are a classic, reasonable entry."]],
    ["a", "b", "c"],
    "Stops go beyond the level that invalidates the idea; risk per trade stays small (often ≤1%); averaging down on a loser enlarges risk.",
    { type: "errors", chart: plan },
  ),
  multi(
    "err-plan-2",
    "setups",
    3,
    "'RSI is over 70, so I'll short this strong uptrend with no stop — it has to come down.' Which mistakes are in that reasoning? (Choose all that apply.)",
    [["a", "Treating overbought RSI as a sell signal on its own"], ["b", "Trading with no stop"], ["c", "Assuming price 'has to' do anything"], ["d", "Looking at RSI at all", "RSI is a useful tool — the mistake is how it's used here."]],
    ["a", "b", "c"],
    "Overbought can stay overbought; every trade needs a stop; nothing in markets 'has to' happen.",
    { type: "errors" },
  ),
];

/** Predict-the-next-move questions, one per scenario. */
const predictions: Question[] = SCENARIOS.map((s) => ({
  id: s.id,
  topic: s.topic,
  difficulty: s.difficulty,
  type: "predict" as const,
  prompt: s.setup,
  scenario: s,
  explanation: s.outcomeNote,
}));

const lessonQuestions = DEFS.flatMap((l) => l.questions);

export const QUESTIONS: Question[] = [...lessonQuestions, ...recognition, ...ordering, ...matching, ...analysis, ...riskCalcs, ...setupErrors, ...predictions];
export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

/** Question pools per practice mode. */
export const POOLS = {
  pattern: [...recognition, ...ordering, ...matching],
  predict: predictions,
  analysis: [...analysis, ...setupErrors],
  quiz: [...lessonQuestions, ...recognition, ...analysis, ...riskCalcs, ...ordering, ...matching],
  challenge: [...recognition.filter((q) => q.difficulty >= 2), ...analysis.filter((q) => q.difficulty >= 2), ...riskCalcs, ...setupErrors, ...predictions.filter((q) => q.difficulty >= 2)],
};

/** The topic "pattern:matching" isn't a lesson; give it a label and point it at the first pattern lesson. */
TOPIC_BY_ID["pattern:matching"] = { id: "pattern:matching", label: "Pattern descriptions", level: 3, lesson: "pattern-doji" };
