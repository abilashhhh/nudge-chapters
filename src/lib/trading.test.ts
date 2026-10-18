import { describe, expect, it } from "vitest";
import type { IpoApplication, Trade } from "./types";
import { dayStreaks, holdingTerm, importTrades, ipoListingGain, ipoRealised, ipoStats, pnlByDay, tradePnl, tradeStats } from "./trading";

const t = (p: Partial<Trade>): Trade => ({
  id: Math.random().toString(36), symbol: "INFY", segment: "intraday", side: "long", quantity: 10, entry_date: "2026-10-01", entry_price: 100,
  exit_date: "2026-10-01", exit_price: 110, charges: 10, tags: [], ...p,
});

describe("trade journal", () => {
  it("works out profit for long, short and open trades", () => {
    expect(tradePnl(t({}))).toBe(90);
    expect(tradePnl(t({ side: "short", exit_price: 90 }))).toBe(90);
    expect(tradePnl(t({ side: "short", exit_price: 105 }))).toBe(-60);
    expect(tradePnl(t({ exit_price: null, exit_date: null }))).toBeNull();
  });

  it("summarises wins, losses and days", () => {
    const list = [t({}), t({ exit_price: 95 }), t({ entry_date: "2026-10-02", exit_date: "2026-10-02" }), t({ exit_price: null, exit_date: null })];
    const s = tradeStats(list);
    expect(s.count).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.net).toBe(90 - 60 + 90);
    expect(s.profitFactor).toBeCloseTo(180 / 60);
    const days = pnlByDay(list);
    expect(days).toEqual([{ day: "2026-10-01", pnl: 30, trades: 2 }, { day: "2026-10-02", pnl: 90, trades: 1 }]);
    expect(dayStreaks(days)).toMatchObject({ current: 2, currentGreen: true, bestGreen: 2 });
  });
});

describe("IPOs", () => {
  const ipo = (p: Partial<IpoApplication>): IpoApplication => ({ id: "i", name: "X", category: "retail", apply_date: "2026-09-01", price: 100, lot_size: 50, lots: 1, status: "applied", allotted_shares: 0, ...p });
  it("listing gain, booked profit and allotment rate", () => {
    const a = ipo({ status: "listed", allotted_shares: 50, listing_price: 130 });
    const b = ipo({ status: "sold", allotted_shares: 50, listing_price: 90, sold_price: 120 });
    const c = ipo({ status: "not_allotted" });
    expect(ipoListingGain(a)).toBe(1500);
    expect(ipoRealised(b)).toBe(1000);
    const s = ipoStats([a, b, c, ipo({})]);
    expect(s.allotmentRate).toBeCloseTo(2 / 3);
    expect(s.gains).toBe(2500);
    expect(s.blocked).toBe(5000);
  });
});

describe("broker imports", () => {
  it("matches a tradebook into intraday, swing and open trades", () => {
    const csv = `Client ID,AB1234
symbol,isin,trade_date,exchange,segment,series,trade_type,quantity,price
INFY,INE009A01021,2026-10-01,NSE,EQ,EQ,buy,10,1800
INFY,INE009A01021,2026-10-01,NSE,EQ,EQ,buy,5,1802
INFY,INE009A01021,2026-10-01,NSE,EQ,EQ,sell,15,1810
SBIN,INE062A01020,2026-10-02,NSE,EQ,EQ,sell,20,800
SBIN,INE062A01020,2026-10-02,NSE,EQ,EQ,buy,20,795
ITC,INE154A01025,2026-09-01,NSE,EQ,EQ,buy,100,450
ITC,INE154A01025,2026-09-20,NSE,EQ,EQ,sell,60,470`;
    const r = importTrades(csv);
    expect(r.format).toBe("tradebook");
    const by = (s: string, open = false) => r.trades.filter((x) => x.symbol === s && (x.exit_date == null) === open);
    expect(by("INFY")).toHaveLength(1);
    expect(by("INFY")[0]).toMatchObject({ segment: "intraday", quantity: 15, exit_price: 1810 });
    expect(by("INFY")[0].entry_price).toBeCloseTo(1800.67, 1);
    expect(by("SBIN")[0]).toMatchObject({ side: "short", entry_price: 800, exit_price: 795, segment: "intraday" });
    expect(by("ITC")[0]).toMatchObject({ segment: "swing", quantity: 60 });
    expect(by("ITC", true)[0]).toMatchObject({ quantity: 40, exit_price: null });
  });

  it("reads a P&L sheet", () => {
    const csv = `Stock name,Quantity,Buy date,Buy price,Sell date,Sell price
Tata Motors,30,03-08-2026,905,15-08-2026,962`;
    const r = importTrades(csv);
    expect(r.format).toBe("pnl");
    expect(r.trades[0]).toMatchObject({ symbol: "TATA MOTORS", quantity: 30, entry_date: "2026-08-03", exit_date: "2026-08-15", segment: "swing" });
  });
});

describe("holding term", () => {
  it("is long term after a year", () => {
    expect(holdingTerm("2025-10-01", "2026-10-18")).toBe("long");
    expect(holdingTerm("2026-01-01", "2026-10-18")).toBe("short");
    expect(holdingTerm(null, "2026-10-18")).toBe("unknown");
  });
});
