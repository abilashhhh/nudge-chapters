// Indian income tax for an individual (resident, under 60), FY 2026-27 — same slabs as FY 2025-26; Budget 2026
// made no change. An estimate for planning: it ignores capital-gains rates, agricultural income and the marginal
// relief on surcharge.

export type Regime = "new" | "old";

export interface TaxInput {
  /** Gross salary for the year (before tax and deductions, not take-home). */
  salary: number;
  /** Interest, rent, freelance and other income. */
  other: number;
  /** Old regime only. */
  deductions: {
    c80: number; // EPF, PPF, ELSS, life insurance, home-loan principal, tuition — capped at 1.5 L
    d80: number; // health insurance — capped at 25,000 (self, family)
    d80Parents: number; // parents' health insurance — capped at 25,000 (50,000 if they're senior citizens; enter what applies)
    nps80ccd1b: number; // extra NPS — capped at 50,000
    homeLoanInterest: number; // section 24(b) — capped at 2 L
    hra: number; // HRA exemption you've worked out
    other: number; // anything else allowed (80E, 80G…)
    professionalTax: number;
  };
  /** Employer's NPS contribution (80CCD(2)): allowed in both regimes. */
  employerNps: number;
}

export interface TaxResult {
  regime: Regime;
  gross: number;
  standardDeduction: number;
  deductions: number;
  taxable: number;
  slabTax: number;
  rebate: number;
  surcharge: number;
  cess: number;
  total: number;
  monthly: number;
  /** Tax as a share of gross income. */
  effective: number;
  slabs: { from: number; to: number | null; rate: number; tax: number }[];
}

const L = 1_00_000;
const NEW_SLABS: [number, number | null, number][] = [
  [0, 4 * L, 0],
  [4 * L, 8 * L, 5],
  [8 * L, 12 * L, 10],
  [12 * L, 16 * L, 15],
  [16 * L, 20 * L, 20],
  [20 * L, 24 * L, 25],
  [24 * L, null, 30],
];
const OLD_SLABS: [number, number | null, number][] = [
  [0, 2.5 * L, 0],
  [2.5 * L, 5 * L, 5],
  [5 * L, 10 * L, 20],
  [10 * L, null, 30],
];

const r0 = (n: number) => Math.round(n);

function slabTax(taxable: number, slabs: [number, number | null, number][]) {
  const out: TaxResult["slabs"] = [];
  let tax = 0;
  for (const [from, to, rate] of slabs) {
    if (taxable <= from) break;
    const part = Math.min(taxable, to ?? Infinity) - from;
    const t = (part * rate) / 100;
    tax += t;
    out.push({ from, to, rate, tax: r0(t) });
  }
  return { tax, slabs: out };
}

function surchargeRate(taxable: number, regime: Regime): number {
  if (taxable > 5 * 100 * L) return regime === "new" ? 25 : 37;
  if (taxable > 2 * 100 * L) return 25;
  if (taxable > 100 * L) return 15;
  if (taxable > 50 * L) return 10;
  return 0;
}

export function computeTax(input: TaxInput, regime: Regime): TaxResult {
  const gross = Math.max(0, input.salary) + Math.max(0, input.other);
  const std = input.salary > 0 ? Math.min(input.salary, regime === "new" ? 75_000 : 50_000) : 0;
  const d = input.deductions;
  const ded =
    regime === "new"
      ? Math.max(0, input.employerNps)
      : Math.min(d.c80, 1.5 * L) + Math.min(d.d80, 25_000) + Math.min(d.d80Parents, 50_000) + Math.min(d.nps80ccd1b, 50_000) + Math.min(d.homeLoanInterest, 2 * L) + Math.max(0, d.hra) + Math.max(0, d.other) + Math.min(Math.max(0, d.professionalTax), 2_500) + Math.max(0, input.employerNps);
  const taxable = Math.max(0, gross - std - ded);
  const { tax, slabs } = slabTax(taxable, regime === "new" ? NEW_SLABS : OLD_SLABS);
  // Section 87A: no tax up to ₹12 L taxable (new) / ₹5 L (old); just above ₹12 L, tax can't exceed the income over it.
  let rebate = 0;
  if (regime === "new") {
    if (taxable <= 12 * L) rebate = Math.min(tax, 60_000);
    else if (tax > taxable - 12 * L) rebate = tax - (taxable - 12 * L);
  } else if (taxable <= 5 * L) rebate = Math.min(tax, 12_500);
  const afterRebate = Math.max(0, tax - rebate);
  const surcharge = (afterRebate * surchargeRate(taxable, regime)) / 100;
  const cess = ((afterRebate + surcharge) * 4) / 100;
  const total = r0(afterRebate + surcharge + cess);
  return {
    regime,
    gross: r0(gross),
    standardDeduction: r0(std),
    deductions: r0(ded),
    taxable: r0(taxable),
    slabTax: r0(tax),
    rebate: r0(rebate),
    surcharge: r0(surcharge),
    cess: r0(cess),
    total,
    monthly: r0(total / 12),
    effective: gross > 0 ? total / gross : 0,
    slabs,
  };
}

/** The financial year (Apr–Mar) a date falls in: "2026-10-17" → { start: "2026-04-01", end: "2027-03-31", label: "2026-27" }. */
export function financialYear(date: string) {
  const y = Number(date.slice(0, 4));
  const startY = Number(date.slice(5, 7)) >= 4 ? y : y - 1;
  return { start: `${startY}-04-01`, end: `${startY + 1}-03-31`, label: `${startY}-${String((startY + 1) % 100).padStart(2, "0")}` };
}
