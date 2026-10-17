"use client";

import { Fragment, useState, type ReactNode } from "react";

/** Short definitions shown when you tap an unfamiliar word in a lesson. */
export const GLOSSARY: Record<string, string> = {
  OHLC: "Open, high, low, close — the four prices that sum up a period.",
  ATR: "Average true range: how far price usually moves in one candle. Used to judge whether a move is big.",
  wick: "The thin line above or below a candle's body, reaching to the high or low. Also called a shadow.",
  wicks: "The thin lines above and below a candle's body, reaching to the high and low.",
  body: "The thick part of a candle, from the open to the close.",
  support: "A price area where falling prices have stopped before, because buyers stepped in.",
  resistance: "A price area where rising prices have stopped before, because sellers stepped in.",
  volume: "How many shares traded in the period.",
  liquidity: "How easily you can buy or sell without moving the price.",
  spread: "The gap between the best bid and the best ask.",
  volatility: "How much price moves around. Bigger candles = more volatile.",
  timeframe: "How much time each candle covers (1-minute, daily, weekly…).",
  breakout: "A close above resistance (or out of a range).",
  breakdown: "A close below support.",
  retest: "Price coming back to a level it just broke, to see if it holds from the other side.",
  pullback: "A move against the trend that pauses it before it (maybe) continues.",
  confluence: "Several separate reasons pointing at the same price area.",
  divergence: "Price and an indicator disagree, e.g. price makes a higher high while RSI makes a lower high.",
  VWAP: "Volume-weighted average price for the session.",
  RSI: "Relative Strength Index: a 0–100 momentum gauge.",
  MACD: "Moving Average Convergence Divergence: the gap between a 12 and a 26 EMA, with a 9 EMA signal line.",
  EMA: "Exponential moving average — reacts faster to recent prices than a simple one.",
  SMA: "Simple moving average — the plain average of the last N closes.",
  doji: "A candle whose open and close are almost equal.",
  marubozu: "A candle with a full body and almost no wicks.",
  "stop-loss": "A pre-set price where you exit if the trade goes against you.",
  stop: "Short for stop-loss: where you exit if you're wrong.",
  consolidation: "A sideways pause where price builds up before its next move.",
  "higher high": "A swing high above the previous swing high (part of an uptrend).",
  "higher low": "A swing low above the previous swing low (part of an uptrend).",
  "lower high": "A swing high below the previous swing high (part of a downtrend).",
  "lower low": "A swing low below the previous swing low (part of a downtrend).",
  gap: "A jump between one candle's close and the next one's open.",
  "overbought": "An indicator reading that says price rose fast. Not a sell signal by itself.",
  "oversold": "An indicator reading that says price fell fast. Not a buy signal by itself.",
};

const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const RE = new RegExp(`\\b(${TERMS.map((t) => t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`, "gi");
const lookup = (w: string) => GLOSSARY[w] ?? GLOSSARY[w.toLowerCase()] ?? GLOSSARY[w.toUpperCase()] ?? Object.entries(GLOSSARY).find(([k]) => k.toLowerCase() === w.toLowerCase())?.[1];

export function Gloss({ word, children }: { word: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const def = lookup(word);
  if (!def) return <>{children}</>;
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} aria-expanded={open} className="cursor-help border-b border-dotted border-future text-inherit">
        {children}
      </button>
      {open && (
        <span role="tooltip" className="anim-fade absolute bottom-full left-1/2 z-20 mb-1.5 w-60 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-[12.5px] font-normal leading-snug text-ink shadow-panel">
          <span className="font-semibold">{word}: </span>
          {def}
        </span>
      )}
    </span>
  );
}

/** Text with glossary words made tappable (each word once per block, so it doesn't get noisy). */
export function Rich({ text, seen }: { text: string; seen?: Set<string> }) {
  const used = seen ?? new Set<string>();
  const parts = text.split(RE);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 1) {
          const key = p.toLowerCase();
          if (!used.has(key)) {
            used.add(key);
            return (
              <Gloss key={i} word={p}>
                {p}
              </Gloss>
            );
          }
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
