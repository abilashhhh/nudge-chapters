"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useFinance } from "@/lib/finance";
import { annualPremium } from "@/lib/insurance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { computeTax, financialYear, type TaxInput } from "@/lib/tax";
import type { Preferences } from "@/lib/types";
import { Money } from "../money";
import { AmountInput, Field } from "../ui/form";
import { V2PageHeader } from "./ui";

type TaxPrefs = NonNullable<Preferences["tax"]>;
type Key = keyof TaxPrefs;

/** What your data already says, for the year: salary, EPF/PPF/ELSS, insurance, NPS, home-loan principal and interest. */
function useFromData() {
  const { ds, positions, today } = useFinance();
  return useMemo(() => {
    const fy = financialYear(today);
    const inFy = (d: string) => d >= fy.start && d <= fy.end;
    const perYear: Record<string, number> = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, half_yearly: 2, yearly: 1 };
    const salary = ds.recurring_rules
      .filter((r) => r.active && r.kind === "income" && (/salary/i.test(r.category ?? "") || /salary|pay/i.test(r.name)))
      .reduce((s, r) => s + r.amount * (perYear[r.frequency] ?? 0), 0);
    const invs = ds.investments.filter((i) => !i.archived);
    const epf = invs.filter((i) => i.type === "epf").reduce((s, i) => s + (i.employee_contribution || 0) * 12, 0);
    const ppf = invs.filter((i) => i.type === "ppf" && i.sip_active).reduce((s, i) => s + i.sip_amount * 12, 0);
    const elss = invs.filter((i) => i.type === "mutual_fund" && i.sip_active && /elss|tax ?saver|long term equity/i.test(i.name)).reduce((s, i) => s + i.sip_amount * 12, 0);
    const nps = invs.filter((i) => i.type === "nps" && i.sip_active).reduce((s, i) => s + i.sip_amount * 12, 0);
    const pol = (ds.insurance_policies ?? []).filter((p) => p.status === "active");
    const life = pol.filter((p) => p.type === "life" || p.type === "term").reduce((s, p) => s + annualPremium(p), 0);
    const health = pol.filter((p) => p.type === "health" || p.type === "critical_illness").reduce((s, p) => s + annualPremium(p), 0);
    let homePrincipal = 0;
    let homeInterest = 0;
    for (const l of positions.loans.values()) {
      if (l.loan.type !== "home") continue;
      for (const i of l.state.schedule) if (inFy(i.date)) {
        homePrincipal += i.principal;
        homeInterest += i.interest;
      }
    }
    return {
      fy,
      salary: Math.round(salary),
      c80: Math.round(epf + ppf + elss + life + homePrincipal),
      c80Parts: [
        ["EPF (your share)", epf],
        ["PPF", ppf],
        ["ELSS funds", elss],
        ["Life insurance", life],
        ["Home loan principal", homePrincipal],
      ].filter(([, v]) => (v as number) > 0) as [string, number][],
      d80: Math.round(health),
      nps: Math.round(nps),
      homeLoanInterest: Math.round(homeInterest),
    };
  }, [ds, positions, today]);
}

export function TaxScreen() {
  const { ds, ctx } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const stored: TaxPrefs = ds.profile.preferences?.tax ?? {};
  // Edits show straight away and are saved a moment after you stop typing.
  const [edits, setEdits] = useState<TaxPrefs>({});
  const timer = useRef<number | undefined>(undefined);
  const saved: TaxPrefs = { ...stored, ...edits };
  const auto = useFromData();
  const val = (k: Key, fallback: number) => (saved[k] as number | undefined) ?? fallback;
  const set = (k: Key, v: number | null) => {
    const next = { ...edits, [k]: v ?? undefined };
    setEdits(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void updatePrefs({ tax: { ...stored, ...next } }), 700);
  };

  const input: TaxInput = {
    salary: val("salary", auto.salary),
    other: val("other", 0),
    employerNps: val("employerNps", 0),
    deductions: {
      c80: val("c80", auto.c80),
      d80: val("d80", auto.d80),
      d80Parents: val("d80Parents", 0),
      nps80ccd1b: val("nps", auto.nps),
      homeLoanInterest: val("homeLoanInterest", auto.homeLoanInterest),
      hra: val("hra", 0),
      other: val("otherDeductions", 0),
      professionalTax: val("professionalTax", 0),
    },
  };
  const nw = computeTax(input, "new");
  const old = computeTax(input, "old");
  const best = nw.total <= old.total ? nw : old;
  const saving = Math.abs(nw.total - old.total);
  const m = (n: number) => formatMoney(n, ctx);

  const field = (k: Key, label: string, fallback: number, help?: string) => (
    <Field label={label} htmlFor={`tax-${k}`} help={help} optional>
      <AmountInput id={`tax-${k}`} value={val(k, fallback)} onChange={(v) => set(k, v)} currency={ctx.currency} />
    </Field>
  );
  const c80Left = Math.max(0, 1_50_000 - input.deductions.c80);

  return (
    <>
      <V2PageHeader title="Tax estimate" />
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <p className="text-[13.5px] text-ink-2">
          Income tax for FY {auto.fy.label} (April to March), under 60, using this year&apos;s slabs. Figures from your data are filled in — change any of them. An estimate for planning, not tax advice.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[nw, old].map((r) => (
            <div key={r.regime} className={cn("rounded-2xl border p-4 sm:p-5", r === best ? "border-ok bg-ok/5" : "border-line bg-surface")}>
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold">{r.regime === "new" ? "New regime" : "Old regime"}</p>
                {r === best && saving >= 1 && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[12px] font-medium text-ok">Lower by {m(saving)}</span>}
              </div>
              <Money value={r.total} className="display mt-1 block text-[30px] font-semibold leading-tight" />
              <p className="text-[12.5px] text-ink-3">
                {m(r.monthly)} a month · {(r.effective * 100).toFixed(1)}% of income
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
                <dt className="text-ink-3">Income</dt>
                <dd className="num text-right">{m(r.gross)}</dd>
                <dt className="text-ink-3">Standard deduction</dt>
                <dd className="num text-right">−{m(r.standardDeduction)}</dd>
                <dt className="text-ink-3">Deductions</dt>
                <dd className="num text-right">−{m(r.deductions)}</dd>
                <dt className="font-medium">Taxable</dt>
                <dd className="num text-right font-medium">{m(r.taxable)}</dd>
                <dt className="text-ink-3">Tax on slabs</dt>
                <dd className="num text-right">{m(r.slabTax)}</dd>
                {r.rebate > 0 && (
                  <>
                    <dt className="text-ink-3">Rebate (87A)</dt>
                    <dd className="num text-right text-ok">−{m(r.rebate)}</dd>
                  </>
                )}
                {r.surcharge > 0 && (
                  <>
                    <dt className="text-ink-3">Surcharge</dt>
                    <dd className="num text-right">{m(r.surcharge)}</dd>
                  </>
                )}
                <dt className="text-ink-3">Cess 4%</dt>
                <dd className="num text-right">{m(r.cess)}</dd>
              </dl>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold">Income</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("salary", "Gross salary for the year", auto.salary, auto.salary ? "Filled in from your salary entries — those may be take-home pay; use the gross (before tax and PF) from your payslip." : "Gross pay before tax and PF, from your payslip or Form 16.")}
            {field("other", "Other income", 0, "Savings and FD interest, rent, freelance work.")}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold">Deductions (old regime)</h2>
          <p className="mt-1 text-[12.5px] text-ink-3">The new regime ignores these, except your employer&apos;s NPS contribution.</p>
          <div className="mt-3 rounded-xl bg-surface-2 p-3 text-[13px]">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Section 80C used</span>
              <span className="num font-semibold">
                {m(Math.min(input.deductions.c80, 1_50_000))} <span className="font-normal text-ink-3">of {m(1_50_000)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (input.deductions.c80 / 1_50_000) * 100)}%` }} />
            </div>
            {auto.c80Parts.length > 0 && <p className="mt-1.5 text-[12px] text-ink-3">From your data: {auto.c80Parts.map(([k, v]) => `${k} ${m(v)}`).join(" · ")}</p>}
            {c80Left > 0 && <p className="mt-1 text-[12px] text-ink-2">{m(c80Left)} of 80C room left this year (ELSS, PPF, life insurance or tuition fees).</p>}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("c80", "80C total", auto.c80, "EPF, PPF, ELSS, life insurance, home-loan principal, tuition. Up to ₹1.5 L.")}
            {field("d80", "80D health insurance (you & family)", auto.d80, "Up to ₹25,000.")}
            {field("d80Parents", "80D for parents", 0, "Up to ₹25,000, or ₹50,000 if they're senior citizens.")}
            {field("nps", "NPS, extra (80CCD(1B))", auto.nps, "Up to ₹50,000, on top of 80C.")}
            {field("homeLoanInterest", "Home-loan interest (24(b))", auto.homeLoanInterest, "Self-occupied home: up to ₹2 L.")}
            {field("hra", "HRA exemption", 0, "If you pay rent and get HRA: the exempt part from your payslip.")}
            {field("professionalTax", "Professional tax", 0, "Usually ₹2,400–2,500 a year.")}
            {field("otherDeductions", "Other deductions", 0, "Education loan interest (80E), donations (80G)…")}
            {field("employerNps", "Employer's NPS contribution", 0, "80CCD(2) — counts in both regimes.")}
          </div>
        </section>
        <p className="text-[12px] text-ink-3">Doesn&apos;t include capital gains (taxed at their own rates), surcharge relief, or rules for senior citizens. Check with Form 16 or a tax professional before filing.</p>
      </div>
    </>
  );
}
