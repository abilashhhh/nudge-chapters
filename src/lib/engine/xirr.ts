import { diffDays } from "../dates";
import type { ISODate } from "../types";

/**
 * Annualised internal rate of return for irregular cash flows (negative = money
 * invested, positive = money received / current value). Returns a percentage,
 * or null when it cannot be determined.
 */
export function xirr(flows: { date: ISODate; amount: number }[]): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const t0 = sorted[0].date;
  const hasNeg = sorted.some((f) => f.amount < 0);
  const hasPos = sorted.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const span = diffDays(t0, sorted[sorted.length - 1].date);
  if (span < 30) return null; // too short to annualise meaningfully

  const yrs = sorted.map((f) => diffDays(t0, f.date) / 365);
  const npv = (r: number) => sorted.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, yrs[i]), 0);
  const dnpv = (r: number) => sorted.reduce((s, f, i) => s - (yrs[i] * f.amount) / Math.pow(1 + r, yrs[i] + 1), 0);

  // Newton–Raphson, falling back to bisection.
  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    const f = npv(r);
    const d = dnpv(r);
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) break;
    const next = r - f / d;
    if (!Number.isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-8) return next * 100;
    r = next;
  }
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid * 100;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return ((lo + hi) / 2) * 100;
}
