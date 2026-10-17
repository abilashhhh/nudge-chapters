import { describe, expect, it } from "vitest";
import * as K from "./candles";
import { PATTERNS, UNIT, drawPattern, patternCandles } from "./patterns";

const CHECK: Record<string, (cs: K.Candle[]) => boolean> = {
  doji: ([a]) => K.isDoji(a),
  hammer: ([a]) => K.isHammerShape(a),
  "hanging-man": ([a]) => K.isHammerShape(a),
  "shooting-star": ([a]) => K.isInvertedShape(a),
  "inverted-hammer": ([a]) => K.isInvertedShape(a),
  marubozu: ([a]) => K.isMarubozu(a),
  "spinning-top": ([a]) => K.isSpinningTop(a),
  "bullish-engulfing": ([a, b]) => K.isBullishEngulfing(a, b),
  "bearish-engulfing": ([a, b]) => K.isBearishEngulfing(a, b),
  piercing: ([a, b]) => K.isPiercing(a, b),
  "dark-cloud": ([a, b]) => K.isDarkCloud(a, b),
  "morning-star": ([a, b, c]) => K.isMorningStar(a, b, c),
  "evening-star": ([a, b, c]) => K.isEveningStar(a, b, c),
  "three-white-soldiers": ([a, b, c]) => K.isThreeWhiteSoldiers(a, b, c),
  "three-black-crows": ([a, b, c]) => K.isThreeBlackCrows(a, b, c),
  "tweezer-top": ([a, b]) => K.isTweezerTop(a, b, UNIT),
  "tweezer-bottom": ([a, b]) => K.isTweezerBottom(a, b, UNIT),
  "inside-bar": ([a, b]) => K.isInsideBar(a, b),
  "outside-bar": ([a, b]) => K.isOutsideBar(a, b),
};

describe("pattern drawings", () => {
  it("every pattern has a check", () => {
    expect(PATTERNS.map((p) => p.id).sort()).toEqual(Object.keys(CHECK).sort());
  });
  for (const p of PATTERNS) {
    it(`${p.name} matches its definition`, () => {
      expect(CHECK[p.id](patternCandles(p))).toBe(true);
      const d = drawPattern(p, { after: 4 });
      expect(CHECK[p.id](d.chart.candles.slice(d.from, d.to + 1))).toBe(true);
      expect(d.to - d.from + 1).toBe(p.size);
    });
  }
  it("reversal patterns are drawn after the trend they reverse", () => {
    for (const p of PATTERNS.filter((x) => x.context !== "any")) {
      const d = drawPattern(p);
      const lead = d.chart.candles.slice(0, d.from);
      const move = lead.at(-1)!.c - lead[0].o;
      if (p.context === "downtrend") expect(move).toBeLessThan(0);
      else expect(move).toBeGreaterThan(0);
    }
  });
});
