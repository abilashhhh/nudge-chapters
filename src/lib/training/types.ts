// Content shapes for Trading Training. The content itself (lessons, questions, chart scenarios) lives in this
// folder and ships with the app; what you do with it is stored in the training_* tables.

import type { Candle, DataSource, Direction } from "./candles";

export type Difficulty = 1 | 2 | 3;
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: "Beginner", 2: "Intermediate", 3: "Advanced" };

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "1D" | "1W";
export const TIMEFRAME_LABEL: Record<Timeframe, string> = { "1m": "1-minute", "5m": "5-minute", "15m": "15-minute", "1h": "Hourly", "1D": "Daily", "1W": "Weekly" };

export type Tone = "up" | "down" | "neutral" | "brand" | "future";

export type Annotation =
  /** A horizontal price line (support, resistance, a level to watch). */
  | { kind: "hline"; price: number; label?: string; tone?: Tone; dashed?: boolean }
  /** A price band (a support / resistance zone). */
  | { kind: "band"; low: number; high: number; label?: string; tone?: Tone }
  /** Shade a run of candles (where a pattern is). Indexes are inclusive. */
  | { kind: "zone"; from: number; to: number; label?: string; tone?: Tone }
  /** A straight line between two candles' prices (trendline). */
  | { kind: "line"; a: [number, number]; b: [number, number]; label?: string; tone?: Tone; extend?: boolean }
  /** An arrow pointing at a candle's high or low. */
  | { kind: "arrow"; i: number; dir: "up" | "down"; label?: string; tone?: Tone }
  /** A small text tag above a candle's high or below its low (HH, HL, gap…). */
  | { kind: "mark"; i: number; at: "high" | "low"; label: string; tone?: Tone };

export type Overlay = { kind: "sma"; period: number } | { kind: "ema"; period: number } | { kind: "vwap" } | { kind: "bb"; period?: number; k?: number };

export interface ChartSpec {
  candles: Candle[];
  source: DataSource;
  timeframe: Timeframe;
  title?: string;
  /** Candles from this index on stay hidden until revealed. */
  hideFrom?: number;
  annotations?: Annotation[];
  overlays?: Overlay[];
  /** A lower panel. */
  panel?: "volume" | "rsi" | "macd";
  /** Let the reader switch to a higher timeframe made from the same candles. */
  timeframes?: boolean;
  /** Let the reader step through the candles one by one ("how it formed"). */
  replay?: boolean;
  /** Annotations that only appear once hidden candles are revealed. */
  afterReveal?: Annotation[];
}

/** One drawn candle with labelled parts (anatomy diagrams). */
export interface AnatomySpec {
  candles: { o: number; h: number; l: number; c: number; label?: string }[];
  /** Label open, high, low, close, body and wicks. */
  labels?: boolean;
}

export interface Option {
  id: string;
  label: string;
  /** Why this answer is wrong (shown when it was picked and it isn't right). */
  why?: string;
}

/** Signals a reader can tick to explain a prediction. `valid` = really present and relevant on this chart. */
export interface Signal {
  id: string;
  label: string;
  valid: boolean;
  why: string;
}

export interface PredictScenario {
  candles: Candle[];
  /** How many candles are shown before the answer. */
  visible: number;
  horizon: number;
  threshold: number;
  source: DataSource;
  timeframe: Timeframe;
  setup: string;
  /** Teaching note shown after the reveal (written to match the actual outcome; a test checks it). */
  outcomeNote: string;
  /** The direction the author expects the rule to give; tests make sure the data agrees. */
  expected: Direction;
  /** Competing signals: "uncertain" is an accepted answer too. */
  ambiguous?: boolean;
  signals: Signal[];
  annotations?: Annotation[];
  afterReveal?: Annotation[];
  overlays?: Overlay[];
  panel?: ChartSpec["panel"];
  /** Advanced: the same market on a higher timeframe, for context. */
  higher?: ChartSpec;
}

export type PredictChoice = Direction | "uncertain";
export const PREDICT_LABEL: Record<PredictChoice, string> = {
  bullish: "Bullish move",
  bearish: "Bearish move",
  sideways: "Sideways / consolidation",
  uncertain: "Uncertain / not enough information",
};

export type QuestionType = "single" | "multi" | "truefalse" | "pattern" | "chart" | "level" | "match" | "order" | "errors" | "calc" | "predict";

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: "Choose one",
  multi: "Choose all that apply",
  truefalse: "True or false",
  pattern: "Name the pattern",
  chart: "Read the chart",
  level: "Find the level",
  match: "Match them up",
  order: "Put the candles in order",
  errors: "Spot the mistakes",
  calc: "Work it out",
  predict: "Predict the next move",
};

interface QBase {
  id: string;
  topic: string;
  difficulty: Difficulty;
  prompt: string;
  chart?: ChartSpec;
  hint?: string;
  /** Why the right answer is right. */
  explanation: string;
}

export type Question = QBase &
  (
    | { type: "single" | "pattern" | "chart" | "level"; options: Option[]; answer: string }
    | { type: "multi" | "errors"; options: Option[]; answer: string[] }
    | { type: "truefalse"; answer: boolean }
    | { type: "match"; pairs: { left: string; right: string }[] }
    | { type: "order"; items: { id: string; label: string; candle: Candle }[]; answer: string[]; unit: number }
    | { type: "calc"; answer: number; tolerance: number; unit?: string }
    | { type: "predict"; scenario: PredictScenario }
  );

export type SectionKind = "intro" | "visual" | "breakdown" | "example" | "interpret" | "mistakes" | "scenario" | "summary";

export const SECTION_LABEL: Record<SectionKind, string> = {
  intro: "The idea",
  visual: "See it",
  breakdown: "Break it down",
  example: "Example",
  interpret: "Bullish or bearish?",
  mistakes: "Common mistakes",
  scenario: "Try a scenario",
  summary: "Summary",
};

export interface Section {
  kind: SectionKind;
  title?: string;
  body?: string;
  bullets?: string[];
  chart?: ChartSpec;
  anatomy?: AnatomySpec;
  /** Side-by-side charts (look-alikes, before vs after). */
  compare?: { title: string; caption?: string; chart: ChartSpec }[];
  bull?: string;
  bear?: string;
  /** A practical "what would you do" question with its answer folded away. */
  ask?: { question: string; answer: string };
}

export interface Lesson {
  id: string;
  moduleId: string;
  level: number;
  title: string;
  /** One line under the title. */
  summary: string;
  topic: string;
  difficulty: Difficulty;
  minutes: number;
  objectives: string[];
  sections: Section[];
  /** Knowledge-check question ids. */
  quiz: string[];
}

export interface Module {
  id: string;
  level: number;
  title: string;
  description: string;
  prerequisites: string[];
  status: "published" | "draft";
}

export interface Topic {
  id: string;
  label: string;
  level: number;
  /** The lesson that teaches it. */
  lesson: string;
}
