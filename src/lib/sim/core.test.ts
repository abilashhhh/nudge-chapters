import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, applyFill, charges, checkOrder, fillPrice, ist, limitReached, marketStatus, readSettings, unrealized, type AccountState } from "./core";

const S = DEFAULT_SETTINGS;
const acct = (o: Partial<AccountState> = {}): AccountState => ({ cash: 100000, held: {}, reservedSell: {}, openPositions: 0, todayPnl: 0, ...o });
// 2026-10-21 (Wednesday) 11:00 IST = 05:30 UTC
const WED_11 = Date.UTC(2026, 9, 21, 5, 30);

describe("charges", () => {
  it("delivery buy: STT 0.1%, stamp 0.015%, exchange + SEBI + GST, no brokerage", () => {
    const c = charges("buy", "delivery", 100000, S);
    expect(c.brokerage).toBe(0);
    expect(c.stt).toBe(100);
    expect(c.stamp).toBe(15);
    expect(c.exchange).toBe(2.97);
    expect(c.sebi).toBe(0.1);
    expect(c.gst).toBe(0.55);
    expect(c.total).toBe(118.62);
  });
  it("intraday: brokerage 0.03% capped at ₹20, STT only on the sell side", () => {
    const buy = charges("buy", "intraday", 200000, S);
    expect(buy.brokerage).toBe(20);
    expect(buy.stt).toBe(0);
    const sell = charges("sell", "intraday", 10000, S);
    expect(sell.brokerage).toBe(3);
    expect(sell.stt).toBe(2.5);
    expect(sell.stamp).toBe(0);
  });
  it("can be turned off", () => expect(charges("buy", "delivery", 5000, { ...S, chargesOn: false }).total).toBe(0));
});

describe("fill price", () => {
  it("market orders slip against you, rounded to 5 paise", () => {
    expect(fillPrice("buy", "market", 1000, null, 5)).toBe(1000.5);
    expect(fillPrice("sell", "market", 1000, null, 5)).toBe(999.5);
  });
  it("limit orders never fill worse than the limit, and take a better quote", () => {
    expect(fillPrice("buy", "limit", 98, 100, 5)).toBe(98);
    expect(fillPrice("buy", "limit", 101, 100, 5)).toBe(100);
    expect(fillPrice("sell", "limit", 103, 100, 5)).toBe(103);
  });
  it("limit reached only when the quote crosses it", () => {
    expect(limitReached("buy", 100, 100)).toBe(true);
    expect(limitReached("buy", 100, 100.05)).toBe(false);
    expect(limitReached("sell", 100, 99.95)).toBe(false);
    expect(limitReached("sell", 100, 100)).toBe(true);
  });
});

describe("market hours", () => {
  it("IST conversion", () => expect(ist(WED_11)).toEqual({ date: "2026-10-21", time: "11:00", weekday: 3 }));
  it("timetable: open, pre-open, closed, weekend", () => {
    expect(marketStatus(WED_11)).toBe("open");
    expect(marketStatus(Date.UTC(2026, 9, 21, 3, 35))).toBe("pre_open"); // 09:05
    expect(marketStatus(Date.UTC(2026, 9, 21, 10, 0))).toBe("closed"); // 15:30
    expect(marketStatus(Date.UTC(2026, 9, 24, 5, 30))).toBe("closed"); // Saturday
  });
  it("uses the exchange's session when given (holidays)", () => {
    // Session that ended yesterday → closed today even at 11:00 on a weekday.
    const yStart = Date.UTC(2026, 9, 20, 3, 45) / 1000;
    expect(marketStatus(WED_11, { start: yStart, end: yStart + 6.25 * 3600 })).toBe("closed");
    const tStart = Date.UTC(2026, 9, 21, 3, 45) / 1000;
    expect(marketStatus(WED_11, { start: tStart, end: tStart + 6.25 * 3600 })).toBe("open");
  });
});

describe("order checks", () => {
  const buy = { symbol: "TCS.NS", side: "buy" as const, product: "delivery" as const, type: "market" as const, qty: 10 };
  it("accepts a normal order", () => expect(checkOrder(buy, 3000, "open", acct(), S, "11:00")).toBeNull());
  it("rejects bad quantities and missing limits", () => {
    expect(checkOrder({ ...buy, qty: 1.5 }, 3000, "open", acct(), S, "11:00")).toMatch(/whole number/);
    expect(checkOrder({ ...buy, qty: 0 }, 3000, "open", acct(), S, "11:00")).toMatch(/whole number/);
    expect(checkOrder({ ...buy, type: "limit", limit: null }, 3000, "open", acct(), S, "11:00")).toMatch(/limit price/);
    expect(checkOrder({ ...buy, type: "limit", limit: 5000 }, 3000, "open", acct(), S, "11:00")).toMatch(/20%/);
  });
  it("insufficient funds includes charges", () => {
    expect(checkOrder({ ...buy, qty: 33 }, 3000, "open", acct(), S, "11:00")).toBeNull();
    expect(checkOrder({ ...buy, qty: 34 }, 3000, "open", acct({ cash: 102000 }), S, "11:00")).toMatch(/cash/);
  });
  it("market closed: market orders refused, limit orders allowed", () => {
    expect(checkOrder(buy, 3000, "closed", acct(), S, "18:00")).toMatch(/closed/);
    expect(checkOrder({ ...buy, type: "limit", limit: 2950 }, 3000, "closed", acct(), S, "18:00")).toBeNull();
  });
  it("intraday stops at square-off time", () => {
    expect(checkOrder({ ...buy, product: "intraday" }, 3000, "open", acct(), S, "15:21")).toMatch(/15:20/);
  });
  it("sells limited to free quantity in the same product", () => {
    const sell = { ...buy, side: "sell" as const, qty: 6 };
    expect(checkOrder(sell, 3000, "open", acct(), S, "11:00")).toMatch(/don't hold/);
    expect(checkOrder(sell, 3000, "open", acct({ held: { "TCS.NS|delivery": 10 }, reservedSell: { "TCS.NS|delivery": 5 } }), S, "11:00")).toMatch(/up to 5/);
    expect(checkOrder({ ...sell, product: "intraday" }, 3000, "open", acct({ held: { "TCS.NS|delivery": 10 } }), S, "11:00")).toMatch(/don't hold/);
  });
  it("risk limits", () => {
    const s = { ...S, maxOrderValue: 20000, maxOpenPositions: 2, dailyLossLimit: 1000 };
    expect(checkOrder(buy, 3000, "open", acct(), s, "11:00")).toMatch(/limit of/);
    expect(checkOrder({ ...buy, qty: 5 }, 3000, "open", acct({ openPositions: 2 }), s, "11:00")).toMatch(/limit is 2/);
    expect(checkOrder({ ...buy, qty: 5 }, 3000, "open", acct({ openPositions: 2, held: { "TCS.NS|delivery": 1 } }), s, "11:00")).toBeNull();
    expect(checkOrder({ ...buy, qty: 5 }, 3000, "open", acct({ todayPnl: -1200 }), s, "11:00")).toMatch(/loss limit/);
  });
  it("refuses indices and odd symbols", () => expect(checkOrder({ ...buy, symbol: "bad sym" }, 3000, "open", acct(), S, "11:00")).toMatch(/symbol/));
});

describe("positions (same arithmetic as sim_fill in the database)", () => {
  it("average cost, partial sale, realized after charges, unrealized", () => {
    let p = { qty: 0, avg: 0, buyCharges: 0, realized: 0 };
    p = applyFill(p, "buy", 10, 3000, 3.5).pos;
    p = applyFill(p, "buy", 10, 3200, 4.5).pos;
    expect(p.avg).toBe(3100);
    const s = applyFill(p, "sell", 5, 3300, 20);
    expect(s.realized).toBe(978); // (3300−3100)×5 − 20 − 8×5/20
    expect(s.pos).toMatchObject({ qty: 15, avg: 3100, buyCharges: 6, realized: 978 });
    expect(unrealized(s.pos, 3000)).toBe(-1506);
    const all = applyFill(s.pos, "sell", 15, 3100, 0);
    expect(all.pos.qty).toBe(0);
    expect(all.realized).toBe(-6);
  });
});

describe("settings", () => {
  it("fills in defaults and clamps nonsense", () => {
    const s = readSettings({ slippageBps: 9999, squareOffAt: "17:00", maxOrderValue: -5, rates: { sttDelivery: 3 } });
    expect(s.slippageBps).toBe(200);
    expect(s.squareOffAt).toBe("15:20");
    expect(s.maxOrderValue).toBeNull();
    expect(s.rates.sttDelivery).toBe(0.5);
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
