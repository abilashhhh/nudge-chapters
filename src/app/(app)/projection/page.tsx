"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ScenarioChart, TrendChart, type SeriesPoint } from "@/components/charts";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { AmountInput, DateInput, Field, Input, NumberInput, Select, Switch } from "@/components/ui/form";
import { Badge, KV, Panel, Segmented, Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { addDays, addMonths, endOfMonth, formatDate, yearsBetween } from "@/lib/dates";
import { DEFAULT_ASSUMPTIONS, resolveAssumptions } from "@/lib/engine/defaults";
import type { FinEvent } from "@/lib/engine/events";
import { affordability, project, type ProjectionPoint, type ProjectionResult, type PurchasePlan, type WhatIf } from "@/lib/engine/projection";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";
import type { Assumptions, ScenarioAssumptions, ScenarioKey } from "@/lib/types";

const TABS = ["projection", "compare", "whatif", "afford", "assumptions"] as const;
type Metric = "netWorth" | "cash" | "investments" | "liabilities";
const METRIC_LABEL: Record<Metric, string> = { netWorth: "Net worth", cash: "Cash", investments: "Investments", liabilities: "Liabilities" };

export default function ProjectionPage() {
  return (
    <Suspense>
      <Projection />
    </Suspense>
  );
}

function useTargetDate() {
  const { today, ds } = useFinance();
  const params = useSearchParams();
  const q = params.get("date");
  const saved = ds.profile.preferences?.projectionDate;
  const fallback = saved && saved > today ? saved : `${Number(today.slice(0, 4)) + 1}-12-31`;
  const [date, setDate] = useState(q && q > today ? q : fallback);
  return [date, setDate] as const;
}

function Projection() {
  const [tab, setTab] = useTab(TABS, "projection");
  const [date, setDate] = useTargetDate();
  const { today, advanced } = useFinance();
  return (
    <>
      <PageHeader
        title="Future"
        description="Where your money is heading. Every number here is an estimate built from your plans and the assumptions shown."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="proj-date" className="text-[13px] text-ink-2">
              Project to
            </label>
            <DateInput id="proj-date" className="w-44" min={addDays(today, 1)} value={date} onChange={(e) => e.target.value > today && setDate(e.target.value)} />
          </div>
        }
      />
      <div className="no-scrollbar -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">
        {[
          ["End of month", endOfMonth(today)],
          [`31 Dec ${today.slice(0, 4)}`, `${today.slice(0, 4)}-12-31`],
          ["31 Mar (FY end)", `${Number(today.slice(0, 4)) + (today.slice(5, 7) > "03" ? 1 : 0)}-03-31`],
          ["1 year", addMonths(today, 12)],
          ["3 years", addMonths(today, 36)],
          ["5 years", addMonths(today, 60)],
          ["10 years", addMonths(today, 120)],
        ]
          .filter(([, d]) => d > today)
          .map(([label, d]) => (
            <button
              key={label}
              type="button"
              onClick={() => setDate(d)}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-medium", d === date ? "border-future bg-future-soft text-future-ink" : "border-line text-ink-2 hover:border-line-strong")}
            >
              {label}
            </button>
          ))}
      </div>
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        hide={advanced ? [] : ["compare", "whatif", "assumptions"]}
        tabs={[
          { id: "projection", label: "Projection" },
          { id: "compare", label: "Compare scenarios" },
          { id: "whatif", label: "What if…" },
          { id: "afford", label: "Can I afford it?" },
          { id: "assumptions", label: "Assumptions" },
        ]}
      />
      {tab === "projection" && <ProjectionView date={date} />}
      {tab === "compare" && <Compare date={date} />}
      {tab === "whatif" && <WhatIfView date={date} />}
      {tab === "afford" && <Afford />}
      {tab === "assumptions" && <AssumptionsEditor />}
    </>
  );
}

function seriesPoints(res: ProjectionResult, metric: Metric, real: boolean, inflation: number): SeriesPoint[] {
  return res.series.map((p, i) => {
    const v = p[metric];
    const f = real ? Math.pow(1 + inflation / 100, Math.max(0, yearsBetween(res.today, p.date))) : 1;
    return i === 0 ? { date: p.date, actual: v, projected: v } : { date: p.date, projected: Math.round(v / f) };
  });
}

function ProjectionView({ date }: { date: string }) {
  const { ds, today, positions, assumptions, ctx } = useFinance();
  const [scenario, setScenario] = useState<ScenarioKey>("base");
  const [real, setReal] = useState(false);
  const [metric, setMetric] = useState<Metric>("netWorth");
  const [kind, setKind] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const d = useDeferredValue(date);
  const res = useMemo(() => project(ds, { today, to: d, positions, assumptions, scenario }), [ds, today, d, positions, assumptions, scenario]);
  const sc = assumptions.scenarios[scenario];
  const f = real ? res.inflationFactor : 1;
  const r = (n: number) => Math.round(n / f);
  const cb = res.cash;
  const events = res.events.filter((e) => e.kind !== "card_spend" || !e.estimated).filter((e) => kind === "all" || (kind === "in" ? e.flow === "in" : kind === "bills" ? e.flow === "out" : e.kind === kind));

  const lines: { label: string; amount: number; hint?: string }[] = [
    { label: "Cash today", amount: cb.startCash, hint: "Accounts counted as available cash" },
    { label: "Income received", amount: cb.income },
    { label: "Expenses paid from accounts", amount: -cb.expenses },
    { label: "Credit card bills paid", amount: -cb.cardBills, hint: "Settles card spending — not counted twice" },
    { label: "EMIs paid", amount: -cb.emis },
    { label: "SIPs & investments", amount: -cb.investments },
    { label: "Chit installments", amount: -cb.chitInstallments },
    { label: "Chit payouts", amount: cb.chitPayouts },
    { label: "Repayments received", amount: cb.repaymentsIn },
    { label: "Repayments you make", amount: -cb.repaymentsOut },
    { label: "Moved to/from savings not counted as cash", amount: cb.transfersNet },
    { label: "Future-dated transactions", amount: cb.otherActuals },
  ].filter((l, i) => i === 0 || Math.abs(l.amount) >= 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          options={[
            { id: "conservative", label: "Conservative" },
            { id: "base", label: "Base" },
            { id: "optimistic", label: "Optimistic" },
            { id: "custom", label: "Custom" },
          ]}
          value={scenario}
          onChange={setScenario}
        />
        <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-[var(--future)]" checked={real} onChange={(e) => setReal(e.target.checked)} />
          In today&apos;s money (inflation {formatPct(assumptions.inflation)})
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Cash", v: res.end.cash, sub: `lowest ${formatMoney(res.lowest.cash, ctx)} on ${formatDate(res.lowest.date, "short")}` },
          { label: "Investments", v: res.end.investments, sub: `${formatMoney(res.totals.invested + res.totals.retirementContributions, ctx)} added + ${formatMoney(res.totals.investmentGrowth, ctx)} growth` },
          { label: "Still owed", v: res.end.liabilities, sub: `${formatMoney(res.totals.debtReduced, ctx)} repaid by then` },
          { label: "Net worth", v: res.end.netWorth, sub: `${res.end.netWorth >= res.start.netWorth ? "+" : ""}${formatMoney(res.end.netWorth - res.start.netWorth, ctx)} from today` },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[12.5px] text-ink-3">
              {k.label} on {formatDate(date)}
            </p>
            <Money value={r(k.v)} projected className="display mt-0.5 block text-[24px] font-semibold" />
            <p className="num mt-1 text-[12px] text-ink-3">{k.sub}</p>
          </div>
        ))}
      </div>

      {(res.negativeOn || res.belowMin.length > 0) && (
        <div className="rounded-2xl border border-danger/40 bg-danger-soft p-4 text-[13.5px] text-danger">
          <p className="flex items-center gap-2 font-semibold">
            <TriangleAlert className="h-4 w-4" aria-hidden /> Watch out
          </p>
          {res.negativeOn && <p className="mt-1">Available cash goes below zero on {formatDate(res.negativeOn)}.</p>}
          {res.belowMin.map((b) => (
            <p key={b.accountId} className="mt-1">
              {b.name} drops to {formatMoney(b.balance, ctx)} on {formatDate(b.date)}, under its {formatMoney(b.min, ctx)} minimum.
            </p>
          ))}
        </div>
      )}

      {res.insights.length > 0 && (
        <Panel title="Why the numbers look like this" description="What drives this projection, in plain words. Estimates, not guarantees.">
          <ul className="flex flex-col gap-3">
            {res.insights.map((i) => (
              <li key={i.kind + (i.ruleId ?? "")} className="rounded-xl border border-line bg-surface-2 p-3 text-[13.5px]">
                <p className="font-semibold">
                  {i.kind === "income_ends" ? "💼 " : i.kind === "expense_growth" ? "📈 " : i.kind === "reimbursable" ? "🤝 " : "ℹ️ "}
                  {i.date ? i.title.replace(i.date, formatDate(i.date)) : i.title}
                </p>
                <p className="mt-0.5 text-ink-2">{i.amount && i.kind === "income_ends" ? i.detail.replace(String(Math.round(i.amount)), formatMoney(i.amount, ctx)) : i.detail}</p>
                {i.kind === "income_ends" && i.ruleId && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void useStore.getState().patch("recurring_rules", i.ruleId!, { end_date: null })}>
                      Keep it going (remove end date)
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => useUI.getState().openEditor("rule", i.ruleId)}>
                      Edit
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title={`${METRIC_LABEL[metric]} over time`}
        action={
          <Select aria-label="Measure" className="h-9 w-auto text-[13px]" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {Object.entries(METRIC_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        }
      >
        <TrendChart points={seriesPoints(res, metric, real, assumptions.inflation)} label={METRIC_LABEL[metric]} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="How the cash number is built" description="Every rupee in and out of your available cash between today and then.">
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.label} className="flex items-start justify-between gap-3 py-2">
                <span>
                  <span className="block text-[14px]">{l.label}</span>
                  {l.hint && <span className="block text-[12px] text-ink-3">{l.hint}</span>}
                </span>
                <Money value={l.amount} sign={l.label !== "Cash today"} projected={l.label !== "Cash today"} className="shrink-0 text-[14px] font-medium" />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink pt-2">
            <span className="font-semibold">Projected cash</span>
            <Money value={cb.endCash} projected className="display text-[20px] font-semibold" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 text-[13px]">
            <KV k="Income by then" v={formatMoney(res.totals.income, ctx)} />
            <KV k="Spending by then" v={formatMoney(res.totals.expenses, ctx)} />
            <KV k="Interest paid" v={formatMoney(res.totals.interest, ctx)} />
            <KV k="Invested" v={formatMoney(res.totals.invested, ctx)} />
          </div>
        </Panel>
        <Panel title="Assumptions used" description={`${sc === assumptions.scenarios.base ? "Base" : scenario} scenario`}>
          <div className="grid grid-cols-2 gap-x-6">
            <KV k="Salary growth" v={formatPct(sc.salaryGrowth)} />
            <KV k="Expense growth" v={formatPct(sc.expenseGrowth)} />
            <KV k="Income vs plan" v={formatPct(sc.incomeFactor * 100, 0)} />
            <KV k="Variable spending vs plan" v={formatPct(sc.variableExpenseFactor * 100, 0)} />
            <KV k="Equity returns" v={formatPct(sc.returns.equity)} />
            <KV k="Debt returns" v={formatPct(sc.returns.debt)} />
            <KV k="EPF" v={formatPct(sc.returns.epf)} />
            <KV k="Gold" v={formatPct(sc.returns.gold)} />
            <KV k="Real estate" v={formatPct(sc.returns.real_estate)} />
            <KV k="Uncertain items" v={sc.includeUncertain ? "Included" : "Left out"} />
          </div>
          <p className="mt-3 text-[12.5px] text-ink-3">
            Recurring items use their own yearly increase when set. Change these under the Assumptions tab. Projections are not guarantees.
          </p>
          {res.largeUpcoming.length > 0 && (
            <div className="mt-4">
              <p className="text-[13px] font-semibold text-ink-2">Largest payments before then</p>
              <ul className="mt-1 text-[13.5px]">
                {res.largeUpcoming.slice(0, 5).map((e) => (
                  <li key={e.key + e.date} className="flex justify-between gap-2 py-1">
                    <span className="truncate">
                      {e.title} <span className="text-ink-3">· {formatDate(e.date, "short")}</span>
                    </span>
                    <span className="num shrink-0">{formatMoney(e.remaining, ctx)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Accounts then">
          {res.accountsEnd.map((a) => (
            <KV key={a.id} k={<span>{a.name}{!a.included && <span className="text-ink-3"> (savings)</span>}</span>} v={<Money value={r(a.balance)} projected />} />
          ))}
        </Panel>
        <Panel title="Investments then">
          {res.investmentsEnd.length ? res.investmentsEnd.sort((a, b) => b.value - a.value).slice(0, 10).map((i) => <KV key={i.id} k={<span className="truncate">{i.name}</span>} v={<Money value={r(i.value)} projected />} />) : <p className="text-[13.5px] text-ink-3">None</p>}
        </Panel>
        <Panel title="Still owed then">
          {res.liabilitiesEnd.length ? res.liabilitiesEnd.map((l) => <KV key={l.id} k={l.name} v={<Money value={r(l.amount)} projected />} />) : <p className="text-[13.5px] text-ok">Debt-free by then 🎉</p>}
        </Panel>
      </div>

      <Panel
        title="Timeline of expected events"
        description={`${events.length} planned items between now and ${formatDate(date)}`}
        action={
          <Select aria-label="Filter events" className="h-9 w-auto text-[13px]" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="all">Everything</option>
            <option value="in">Money in</option>
            <option value="bills">Money out</option>
            <option value="card_bill">Card bills</option>
            <option value="emi">EMIs</option>
            <option value="sip">SIPs</option>
            <option value="chit">Chits</option>
          </Select>
        }
      >
        <EventTable events={showAll ? events : events.slice(0, 40)} />
        {events.length > 40 && (
          <Button size="sm" className="mt-3" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show fewer" : `Show all ${events.length}`}
          </Button>
        )}
      </Panel>
    </div>
  );
}

function EventTable({ events }: { events: FinEvent[] }) {
  const { ctx } = useFinance();
  return (
    <ul className="divide-y divide-line">
      {events.map((e) => (
        <li key={e.key + e.date}>
          <button type="button" className="flex w-full items-center gap-3 py-2 text-left hover:bg-surface-2" onClick={() => !e.key.startsWith("whatif") && useUI.getState().openEvent(e.key)}>
            <span className="num w-20 shrink-0 text-[12.5px] text-ink-3">{formatDate(e.date, "short")}</span>
            <span className="min-w-0 flex-1 truncate text-[14px]">
              {e.title}
              {e.estimated && <span className="text-ink-3"> · est.</span>}
            </span>
            <span className={cn("num shrink-0 text-[14px]", e.flow === "in" ? "text-ok" : "text-ink")}>{formatMoney(e.flow === "in" ? e.remaining : -e.remaining, ctx, { sign: e.flow === "in" })}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------

function Compare({ date }: { date: string }) {
  const { ds, today, positions, assumptions, ctx } = useFinance();
  const [metric, setMetric] = useState<Metric>("netWorth");
  const d = useDeferredValue(date);
  const results = useMemo(
    () => (["conservative", "base", "optimistic"] as const).map((key) => ({ key, res: project(ds, { today, to: d, positions, assumptions, scenario: key }) })),
    [ds, today, d, positions, assumptions],
  );
  const label = { conservative: "Conservative", base: "Base", optimistic: "Optimistic" };
  return (
    <div className="flex flex-col gap-4">
      <Panel
        title={`${METRIC_LABEL[metric]} under each scenario`}
        action={
          <Select aria-label="Measure" className="h-9 w-auto text-[13px]" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {Object.entries(METRIC_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        }
      >
        <ScenarioChart metricLabel={METRIC_LABEL[metric]} series={results.map((r) => ({ key: r.key, label: label[r.key], points: r.res.series.map((p: ProjectionPoint) => ({ date: p.date, value: p[metric] })) }))} />
      </Panel>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[560px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-left text-[12.5px] text-ink-3">
              <th className="px-4 py-3 font-medium">On {formatDate(date)}</th>
              {results.map((r) => (
                <th key={r.key} className="px-4 py-3 text-right font-medium">
                  {label[r.key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="num">
            {(
              [
                ["Cash", (x: ProjectionResult) => x.end.cash],
                ["Investments", (x: ProjectionResult) => x.end.investments],
                ["Still owed", (x: ProjectionResult) => x.end.liabilities],
                ["Net worth", (x: ProjectionResult) => x.end.netWorth],
                ["Lowest cash", (x: ProjectionResult) => x.lowest.cash],
                ["Income by then", (x: ProjectionResult) => x.totals.income],
                ["Spending by then", (x: ProjectionResult) => x.totals.expenses],
              ] as const
            ).map(([name, fn]) => (
              <tr key={name} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 font-sans text-ink-2">{name}</td>
                {results.map((r) => (
                  <td key={r.key} className="projected px-4 py-2.5 text-right">
                    {formatMoney(fn(r.res), ctx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const WHATIF_TEMPLATES: { type: WhatIf["type"]; label: string; make: (today: string) => WhatIf }[] = [
  { type: "income_change", label: "Salary changes by %", make: (t) => ({ id: crypto.randomUUID(), type: "income_change", pct: 10, from: addMonths(t, 3), label: "Salary hike" }) },
  { type: "income_stop", label: "Income stops for a while", make: (t) => ({ id: crypto.randomUUID(), type: "income_stop", from: t, months: 6, label: "No salary" }) },
  { type: "expense_change", label: "Spending changes by %", make: (t) => ({ id: crypto.randomUUID(), type: "expense_change", pct: 10, from: t, label: "Spending up" }) },
  { type: "recurring", label: "New monthly payment (EMI, rent…)", make: (t) => ({ id: crypto.randomUUID(), type: "recurring", from: addMonths(t, 1), months: 36, amount: 15000, direction: "out", label: "New EMI" }) },
  { type: "recurring", label: "Invest more each month", make: (t) => ({ id: crypto.randomUUID(), type: "recurring", from: addMonths(t, 1), months: null, amount: 10000, direction: "invest", assetClass: "equity", label: "Extra SIP" }) },
  { type: "one_time", label: "One-time expense (car, wedding…)", make: (t) => ({ id: crypto.randomUUID(), type: "one_time", date: addMonths(t, 4), amount: 200000, direction: "out", label: "Big purchase" }) },
  { type: "one_time", label: "One-time income (bonus…)", make: (t) => ({ id: crypto.randomUUID(), type: "one_time", date: addMonths(t, 6), amount: 100000, direction: "in", label: "Bonus" }) },
];

function WhatIfView({ date }: { date: string }) {
  const { ds, today, positions, assumptions, ctx } = useFinance();
  const params = useSearchParams();
  const [items, setItems] = useState<WhatIf[]>([]);
  useEffect(() => {
    if (params.get("preset") === "jobloss") setItems([{ id: "jobloss", type: "income_stop", from: params.get("from") ?? today, months: 6, label: "No salary for 6 months" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const d = useDeferredValue(date);
  const deferredItems = useDeferredValue(items);
  const base = useMemo(() => project(ds, { today, to: d, positions, assumptions }), [ds, today, d, positions, assumptions]);
  const alt = useMemo(() => project(ds, { today, to: d, positions, assumptions, whatIfs: deferredItems }), [ds, today, d, positions, assumptions, deferredItems]);
  const update = (id: string, patch: Partial<WhatIf>) => setItems(items.map((w) => (w.id === id ? { ...w, ...patch } : w)));

  const pts: SeriesPoint[] = alt.series.map((p, i) => ({ date: p.date, actual: i === 0 ? p.netWorth : null, projected: p.netWorth }));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Panel title="Your what-ifs" description="Stack as many as you like. Nothing here changes your real plans.">
        <div className="flex flex-col gap-3">
          {items.map((w) => (
            <div key={w.id} className="rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-center gap-2">
                <Input aria-label="Name" className="h-9 flex-1 bg-surface" value={w.label ?? ""} onChange={(e) => update(w.id, { label: e.target.value })} />
                <button type="button" aria-label="Remove" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-3 hover:text-danger" onClick={() => setItems(items.filter((x) => x.id !== w.id))}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(w.type === "income_change" || w.type === "expense_change") && (
                  <Field label="Change %" htmlFor={`p-${w.id}`}>
                    <NumberInput id={`p-${w.id}`} value={w.pct ?? 0} onChange={(e) => update(w.id, { pct: Number(e.target.value) })} />
                  </Field>
                )}
                {(w.type === "one_time" || w.type === "recurring") && (
                  <Field label={w.type === "recurring" ? "Each month" : "Amount"} htmlFor={`a-${w.id}`}>
                    <AmountInput id={`a-${w.id}`} value={w.amount ?? null} onChange={(v) => update(w.id, { amount: v ?? 0 })} />
                  </Field>
                )}
                {w.type === "one_time" ? (
                  <Field label="On" htmlFor={`d-${w.id}`}>
                    <DateInput id={`d-${w.id}`} value={w.date ?? today} onChange={(e) => update(w.id, { date: e.target.value })} />
                  </Field>
                ) : (
                  <Field label="From" htmlFor={`f-${w.id}`}>
                    <DateInput id={`f-${w.id}`} value={w.from ?? today} onChange={(e) => update(w.id, { from: e.target.value })} />
                  </Field>
                )}
                {(w.type === "income_stop" || w.type === "recurring") && (
                  <Field label="For months" htmlFor={`m-${w.id}`} help={w.type === "recurring" ? "Blank = ongoing" : undefined}>
                    <NumberInput id={`m-${w.id}`} value={w.months ?? ""} min={1} onChange={(e) => update(w.id, { months: e.target.value ? Number(e.target.value) : null })} />
                  </Field>
                )}
                {(w.type === "one_time" || w.type === "recurring") && (
                  <Field label="Type" htmlFor={`t-${w.id}`}>
                    <Select id={`t-${w.id}`} value={w.direction ?? "out"} onChange={(e) => update(w.id, { direction: e.target.value as WhatIf["direction"] })}>
                      <option value="out">Money out</option>
                      <option value="in">Money in</option>
                      <option value="invest">Investment</option>
                    </Select>
                  </Field>
                )}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {WHATIF_TEMPLATES.map((t) => (
              <Button key={t.label} size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setItems([...items, t.make(today)])}>
                {t.label}
              </Button>
            ))}
          </div>
        </div>
      </Panel>
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[440px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12.5px] text-ink-3">
                <th className="px-4 py-3 font-medium">On {formatDate(date)}</th>
                <th className="px-4 py-3 text-right font-medium">As planned</th>
                <th className="px-4 py-3 text-right font-medium">With what-ifs</th>
                <th className="px-4 py-3 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody className="num">
              {(
                [
                  ["Cash", (x: ProjectionResult) => x.end.cash],
                  ["Investments", (x: ProjectionResult) => x.end.investments],
                  ["Still owed", (x: ProjectionResult) => x.end.liabilities],
                  ["Net worth", (x: ProjectionResult) => x.end.netWorth],
                  ["Lowest cash", (x: ProjectionResult) => x.lowest.cash],
                ] as const
              ).map(([name, fn]) => {
                const diff = fn(alt) - fn(base);
                return (
                  <tr key={name} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-sans text-ink-2">{name}</td>
                    <td className="projected px-4 py-2.5 text-right">{formatMoney(fn(base), ctx)}</td>
                    <td className="projected px-4 py-2.5 text-right">{formatMoney(fn(alt), ctx)}</td>
                    <td className={cn("px-4 py-2.5 text-right", Math.abs(diff) < 1 ? "text-ink-3" : diff > 0 === (name !== "Still owed") ? "text-ok" : "text-danger")}>{formatMoney(diff, ctx, { sign: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {alt.negativeOn && !base.negativeOn && (
          <p className="flex items-center gap-2 rounded-xl bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
            <TriangleAlert className="h-4 w-4" /> With these changes your cash goes negative on {formatDate(alt.negativeOn)}.
          </p>
        )}
        <Panel title="Net worth with your what-ifs">
          <TrendChart points={pts} />
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Afford() {
  const { ds, today, ctx } = useFinance();
  const params = useSearchParams();
  const [plan, setPlan] = useState<PurchasePlan>({
    name: "New purchase",
    price: Number(params.get("amount")) || 200000,
    date: params.get("date") ?? addMonths(today, 1),
    financing: "cash",
    emiMonths: 12,
    emiRate: 12,
    downPayment: 0,
  });
  const [buffer, setBuffer] = useState<number | null>(10000);
  const d = useDeferredValue(plan);
  const res = useMemo(() => affordability(ds, today, d, buffer ?? 0), [ds, today, d, buffer]);
  const set = (p: Partial<PurchasePlan>) => setPlan({ ...plan, ...p });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Panel title="What do you want to buy?">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Item" htmlFor="af-name" className="col-span-2">
            <Input id="af-name" value={plan.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Price" htmlFor="af-price">
            <AmountInput id="af-price" value={plan.price} onChange={(v) => set({ price: v ?? 0 })} />
          </Field>
          <Field label="When" htmlFor="af-date">
            <DateInput id="af-date" value={plan.date} min={today} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <div className="col-span-2">
            <Segmented
              options={[
                { id: "cash", label: "Pay upfront" },
                { id: "emi", label: "EMI" },
                { id: "card", label: "Credit card" },
              ]}
              value={plan.financing}
              onChange={(v) => set({ financing: v })}
            />
          </div>
          {plan.financing === "emi" && (
            <>
              <Field label="Down payment" htmlFor="af-dp">
                <AmountInput id="af-dp" value={plan.downPayment ?? 0} onChange={(v) => set({ downPayment: v ?? 0 })} />
              </Field>
              <Field label="Months" htmlFor="af-m">
                <NumberInput id="af-m" value={plan.emiMonths ?? 12} min={1} onChange={(e) => set({ emiMonths: Number(e.target.value) || 1 })} />
              </Field>
              <Field label="Interest %" htmlFor="af-r">
                <NumberInput id="af-r" value={plan.emiRate ?? 0} step="0.5" onChange={(e) => set({ emiRate: Number(e.target.value) || 0 })} />
              </Field>
            </>
          )}
          <Field label="Keep at least this much cash" htmlFor="af-buf" help="Your safety buffer" className="col-span-2">
            <AmountInput id="af-buf" value={buffer} onChange={setBuffer} />
          </Field>
        </div>
      </Panel>
      <div className="flex flex-col gap-4">
        <div className={cn("rounded-2xl border p-5", res.safe ? "border-ok/40 bg-ok-soft" : "border-warn/40 bg-warn-soft")}>
          <p className={cn("display text-[26px] font-semibold", res.safe ? "text-ok" : "text-warn")}>{res.safe ? "Yes, it fits." : res.withPurchase.negativeOn ? "You'd run short of cash." : "It would squeeze your cash."}</p>
          <p className="mt-1 text-[14px] text-ink-2">
            {res.safe
              ? `Your cash stays above ${formatMoney(buffer ?? 0, ctx)} for the next year, even with this purchase.`
              : `Your lowest cash would be ${formatMoney(res.withPurchase.lowest.cash, ctx)} on ${formatDate(res.withPurchase.lowest.date)}.`}
            {!res.safe && (res.saferDate ? ` Buying on ${formatDate(res.saferDate)} or later keeps you above your buffer.` : " Within two years there's no date that keeps your buffer — consider an EMI or a smaller amount.")}
          </p>
        </div>
        <Panel title="Impact">
          <KV k="Lowest cash without it" v={<Money value={res.base.lowest.cash} projected />} />
          <KV k="Lowest cash with it" v={<Money value={res.withPurchase.lowest.cash} projected />} />
          <KV k="Cash a year after" v={<Money value={res.withPurchase.end.cash} projected />} />
          <KV k="Change in net worth by then" v={<span className={res.netWorthImpact < 0 ? "text-danger" : "text-ok"}>{formatMoney(res.netWorthImpact, ctx, { sign: true })}</span>} />
          {res.withPurchase.negativeOn && <KV k="Cash goes negative on" v={<Badge tone="danger">{formatDate(res.withPurchase.negativeOn)}</Badge>} />}
          <p className="mt-3 text-[12.5px] text-ink-3">
            Goals funded from your bank balances may slow down by the amount spent. Assets bought (like a car) aren&apos;t added to net worth here — add them under Assets if you buy.
          </p>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AssumptionsEditor() {
  const { ds } = useFinance();
  const updateProfile = useStore((s) => s.updateProfile);
  const [a, setA] = useState<Assumptions>(() => resolveAssumptions(ds.profile));
  const [key, setKey] = useState<ScenarioKey>("base");
  const [busy, setBusy] = useState(false);
  const sc = a.scenarios[key];
  const setSc = (p: Partial<ScenarioAssumptions>) => setA({ ...a, scenarios: { ...a.scenarios, [key]: { ...sc, ...p } } });
  const setRet = (k: keyof ScenarioAssumptions["returns"], v: number) => setSc({ returns: { ...sc.returns, [k]: v } });
  const num = (label: string, value: number, onChange: (v: number) => void, id: string, step = "0.5") => (
    <Field label={label} htmlFor={id}>
      <NumberInput id={id} value={value} step={step} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </Field>
  );
  return (
    <Panel title="Projection assumptions" description="Conservative, base and optimistic should bracket what you think is likely. Custom is yours to play with.">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            options={[
              { id: "conservative", label: "Conservative" },
              { id: "base", label: "Base" },
              { id: "optimistic", label: "Optimistic" },
              { id: "custom", label: "Custom" },
            ]}
            value={key}
            onChange={setKey}
          />
          <div className="w-40">{num("Inflation %", a.inflation, (v) => setA({ ...a, inflation: v }), "as-inf")}</div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {num("Salary growth %/yr", sc.salaryGrowth, (v) => setSc({ salaryGrowth: v }), "as-sg")}
          {num("Expense growth %/yr", sc.expenseGrowth, (v) => setSc({ expenseGrowth: v }), "as-eg")}
          {num("Income vs plan (×)", sc.incomeFactor, (v) => setSc({ incomeFactor: v }), "as-if", "0.05")}
          {num("Variable spending vs plan (×)", sc.variableExpenseFactor, (v) => setSc({ variableExpenseFactor: v }), "as-vf", "0.05")}
        </div>
        <p className="text-[13px] font-semibold text-ink-2">Expected yearly returns</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {num("Equity", sc.returns.equity, (v) => setRet("equity", v), "as-r-eq")}
          {num("Debt / FD", sc.returns.debt, (v) => setRet("debt", v), "as-r-debt")}
          {num("Hybrid", sc.returns.hybrid, (v) => setRet("hybrid", v), "as-r-hy")}
          {num("Gold", sc.returns.gold, (v) => setRet("gold", v), "as-r-gold")}
          {num("Real estate", sc.returns.real_estate, (v) => setRet("real_estate", v), "as-r-re")}
          {num("EPF", sc.returns.epf, (v) => setRet("epf", v), "as-r-epf", "0.05")}
          {num("Cash / savings", sc.returns.cash, (v) => setRet("cash", v), "as-r-cash")}
          {num("Other", sc.returns.other, (v) => setRet("other", v), "as-r-oth")}
        </div>
        <Switch checked={sc.includeUncertain} onChange={(v) => setSc({ includeUncertain: v })} label="Include uncertain items" help="Bonuses, repayments you're unsure about and other items marked uncertain." />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await updateProfile({ assumptions: a });
              } finally {
                setBusy(false);
              }
            }}
          >
            Save assumptions
          </Button>
          <Button variant="ghost" onClick={() => setA({ ...a, scenarios: { ...a.scenarios, [key]: DEFAULT_ASSUMPTIONS.scenarios[key] } })}>
            Reset {key} to defaults
          </Button>
        </div>
      </div>
    </Panel>
  );
}
