import { describe, expect, it } from "vitest";
import { computeTax, financialYear, type TaxInput } from "./tax";

const none: TaxInput["deductions"] = { c80: 0, d80: 0, d80Parents: 0, nps80ccd1b: 0, homeLoanInterest: 0, hra: 0, other: 0, professionalTax: 0 };
const inp = (salary: number, deductions: Partial<TaxInput["deductions"]> = {}): TaxInput => ({ salary, other: 0, deductions: { ...none, ...deductions }, employerNps: 0 });

describe("income tax FY 2026-27", () => {
  it("new regime: no tax up to ₹12.75 L salary", () => {
    expect(computeTax(inp(12_75_000), "new").total).toBe(0);
  });
  it("new regime: ₹15 L salary", () => {
    // taxable 14.25 L: 4L×0 + 4L×5% + 4L×10% + 2.25L×15% = 20,000 + 40,000 + 33,750 = 93,750 + 4% cess
    const r = computeTax(inp(15_00_000), "new");
    expect(r.taxable).toBe(14_25_000);
    expect(r.slabTax).toBe(93_750);
    expect(r.total).toBe(97_500);
  });
  it("new regime: marginal relief just above ₹12 L taxable", () => {
    const r = computeTax(inp(12_85_000), "new"); // taxable 12.1 L: tax capped at the 10,000 above 12 L
    expect(r.taxable).toBe(12_10_000);
    expect(r.total).toBe(10_400);
  });
  it("old regime with 80C and 80D", () => {
    // 10 L − 50k std − 1.5 L − 25k = 7.75 L: 12,500 + 2.75L×20% = 67,500 → +4% = 70,200
    const r = computeTax(inp(10_00_000, { c80: 2_00_000, d80: 30_000 }), "old");
    expect(r.deductions).toBe(1_75_000);
    expect(r.taxable).toBe(7_75_000);
    expect(r.total).toBe(70_200);
  });
  it("old regime rebate up to ₹5 L taxable", () => {
    expect(computeTax(inp(5_50_000), "old").total).toBe(0);
  });
  it("financial year", () => {
    expect(financialYear("2026-10-17")).toEqual({ start: "2026-04-01", end: "2027-03-31", label: "2026-27" });
    expect(financialYear("2027-02-01").label).toBe("2026-27");
  });
});
