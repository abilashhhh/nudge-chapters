import { describe, expect, it } from "vitest";
import { byStock, closedTrades, maxDrawdown, realizedByPeriod, tradeStats, type SimFill } from "./analytics";

let n = 0;
const f = (side: "buy" | "sell", qty: number, price: number, at: string, realized: number | null = null, symbol = "TCS.NS", charges = 0): SimFill => ({
  id: `f${++n}`, order_id: `o${n}`, symbol, name: symbol, side, product: "delivery", qty, ref_price: price, price, value: qty * price, charges, charges_detail: {}, realized_pnl: realized, quote_time: null, executed_at: at,
});

describe("closed trades", () => {
  it("one per sale, FIFO holding period", () => {
    const fills = [f("buy", 10, 100, "2026-10-01T05:00:00Z"), f("buy", 10, 110, "2026-10-03T05:00:00Z"), f("sell", 15, 120, "2026-10-05T05:00:00Z", 200)];
    const ct = closedTrades(fills);
    expect(ct).toHaveLength(1);
    // 10 shares held 4 days, 5 held 2 days → 3.33 days
    expect(ct[0].holdDays).toBeCloseTo(10 / 3, 5);
  });
});

describe("stats", () => {
  const fills = [
    f("buy", 10, 100, "2026-10-01T05:00:00Z", null, "A.NS", 2),
    f("sell", 10, 120, "2026-10-02T05:00:00Z", 190, "A.NS", 8),
    f("buy", 10, 100, "2026-10-05T05:00:00Z", null, "B.NS", 2),
    f("sell", 5, 90, "2026-10-06T05:00:00Z", -60, "B.NS", 1),
    f("sell", 5, 130, "2026-10-07T05:00:00Z", 140, "B.NS", 1),
  ];
  it("win rate, averages, reward:risk, best/worst", () => {
    const s = tradeStats(fills, Date.parse("2026-10-15T05:00:00Z"));
    expect(s).toMatchObject({ trades: 3, wins: 2, losses: 1, avgWin: 165, avgLoss: -60, rewardRisk: 2.75, realized: 270, charges: 14 });
    expect(s.winRate).toBeCloseTo(66.67, 1);
    expect(s.best?.pnl).toBe(190);
    expect(s.worst?.pnl).toBe(-60);
    expect(s.perWeek).toBeCloseTo(5 / 2, 5);
  });
  it("per stock", () => {
    expect(byStock(fills).map((x) => [x.symbol, x.realized, x.trades])).toEqual([["A.NS", 190, 2], ["B.NS", 80, 3]]);
  });
  it("periods use India time and only sales", () => {
    // 2026-10-07T20:00Z is already 8 Oct 01:30 in India.
    const late = [f("sell", 1, 1, "2026-10-07T20:00:00Z", 50), f("sell", 1, 1, "2026-10-07T05:00:00Z", 10), f("buy", 1, 1, "2026-10-08T04:00:00Z")];
    expect(realizedByPeriod(late, Date.parse("2026-10-08T06:00:00Z"))).toEqual({ day: 50, week: 60, month: 60, all: 60 });
  });
  it("empty", () => expect(tradeStats([])).toMatchObject({ trades: 0, winRate: null, rewardRisk: null, best: null }));
});

describe("drawdown", () => {
  it("largest fall from a peak", () => {
    const s = (date: string, equity: number) => ({ date, equity, cash: 0, holdings_value: 0, realized_pnl: 0 });
    expect(maxDrawdown([s("2026-10-01", 100000), s("2026-10-02", 110000), s("2026-10-03", 99000), s("2026-10-04", 120000), s("2026-10-05", 115000)])).toEqual({ amount: 11000, pct: 10 });
  });
});
