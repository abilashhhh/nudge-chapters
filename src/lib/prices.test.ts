import { describe, expect, it } from "vitest";
import { codeFromIdentifier, newCodes, priceItems, priceUpdates } from "./prices";
import type { Investment } from "./types";

const inv = (o: Partial<Investment>): Investment =>
  ({ id: "x", type: "stock", name: "X", asset_class: "equity", units: 10, current_price: 1, invested_amount: 10, sip_amount: 0, sip_active: false, track_from: "2026-01-01", employee_contribution: 0, employer_contribution: 0, pension_contribution: 0, is_international: false, currency: "INR", archived: false, ...o }) as Investment;

describe("codeFromIdentifier", () => {
  it("accepts NSE/BSE symbols for stocks", () => {
    expect(codeFromIdentifier("stock", "idea")).toBe("IDEA");
    expect(codeFromIdentifier("stock", "M&M")).toBe("M&M");
    expect(codeFromIdentifier("stock", "BAJAJ-AUTO")).toBe("BAJAJ-AUTO");
    expect(codeFromIdentifier("stock", "500325.BO")).toBe("500325.BO");
  });
  it("accepts AMFI scheme codes for funds", () => {
    expect(codeFromIdentifier("fund", "147946")).toBe("147946");
  });
  it("ignores folios and account numbers", () => {
    expect(codeFromIdentifier("fund", "Folio 1029384/71")).toBeNull();
    expect(codeFromIdentifier("fund", "IDEA")).toBeNull();
    expect(codeFromIdentifier("stock", "1234567890")).toBeNull();
    expect(codeFromIdentifier("stock", "Folio 12/3")).toBeNull();
    expect(codeFromIdentifier("stock", null)).toBeNull();
  });
});

describe("priceItems", () => {
  it("picks stocks, ETFs and funds with units; prefers a typed code over a remembered match", () => {
    const list = [
      inv({ id: "a", identifier: "IDEA" }),
      inv({ id: "b", type: "mutual_fund", identifier: "Folio 1" }),
      inv({ id: "c", type: "etf" }),
      inv({ id: "d", type: "epf", units: null }),
      inv({ id: "e", archived: true }),
      inv({ id: "f", units: null }),
      inv({ id: "g", currency: "USD" }),
    ];
    const items = priceItems(list, { a: { code: "OLD" }, b: { code: "147946" } });
    expect(items.map((i) => [i.id, i.kind, i.code])).toEqual([
      ["a", "stock", "IDEA"],
      ["b", "fund", "147946"],
      ["c", "stock", null],
    ]);
  });
});

describe("priceUpdates", () => {
  const list = [inv({ id: "a", current_price: 12.8, value_as_of: "2026-10-09" }), inv({ id: "b", current_price: 5, value_as_of: "2026-10-17" }), inv({ id: "c", current_price: 2, value_as_of: "2026-10-16" })];
  it("saves newer prices, keeps a value typed in later, skips no-ops and failures", () => {
    const up = priceUpdates(list, [
      { id: "a", ok: true, price: 12.59, date: "2026-10-16" },
      { id: "b", ok: true, price: 4.9, date: "2026-10-16" },
      { id: "c", ok: true, price: 2, date: "2026-10-16" },
      { id: "z", ok: true, price: 1, date: "2026-10-16" },
      { id: "a", ok: false, error: "x" },
    ]);
    expect(up).toEqual([{ id: "a", patch: { current_price: 12.59, value_as_of: "2026-10-16" } }]);
  });
});

describe("newCodes", () => {
  it("remembers name matches only", () => {
    const items = [
      { id: "a", kind: "stock" as const, code: "IDEA", name: "Vodafone Idea" },
      { id: "b", kind: "stock" as const, code: null, name: "GTL" },
    ];
    const res = [
      { id: "a", ok: true, code: "IDEA" },
      { id: "b", ok: true, code: "GTLINFRA", matched: "GTL Infrastructure Limited" },
    ];
    expect(newCodes(items, res, {})).toEqual({ b: { code: "GTLINFRA", matched: "GTL Infrastructure Limited" } });
    expect(newCodes(items, res, { b: { code: "GTLINFRA" } })).toBeNull();
  });
});
