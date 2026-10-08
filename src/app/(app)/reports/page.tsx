"use client";

import { Download, Printer } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { AllocationBar, CashFlowChart, RankedBars, TrendChart, type SeriesPoint } from "@/components/charts";
import { useNetWorthSeries } from "@/components/dashboard";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { KV, Panel, Progress, Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { downloadCSV } from "@/lib/data/io";
import { addMonths, endOfMonth, formatDate, formatMonth, startOfMonth, yearsBetween } from "@/lib/dates";
import { INVESTMENT_TYPE_LABEL } from "@/lib/engine/defaults";
import { retirementPlan } from "@/lib/engine/goals";
import { classify, isOpening } from "@/lib/engine/ledger";
import { allocation, annualSummary, categoryBreakdown, fixedVsVariable, healthScore, monthlySeries } from "@/lib/engine/reports";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/money";
import { useTab } from "@/lib/use-tab";

const TABS = ["overview", "spending", "networth", "investments", "debt", "annual", "health"] as const;

export default function ReportsPage() {
  return (
    <Suspense>
      <Reports />
    </Suspense>
  );
}

function Reports() {
  const [tab, setTab] = useTab(TABS, "overview");
  const { ds, today, advanced } = useFinance();
  return (
    <>
      <PageHeader
        title="Reports"
        description="Where your money went, how your net worth is moving, and how healthy your finances are."
        actions={
          <>
            <Button
              icon={<Download className="h-4 w-4" />}
              onClick={() =>
                downloadCSV(
                  ds.transactions.filter((t) => t.date >= `${today.slice(0, 4)}-01-01`) as unknown as Record<string, unknown>[],
                  `kosh-transactions-${today.slice(0, 4)}.csv`,
                )
              }
            >
              <span className="hidden sm:inline">This year&apos;s transactions</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              <span className="hidden sm:inline">Print / PDF</span>
            </Button>
          </>
        }
      />
      <Tabs
        className="no-print mb-5"
        value={tab}
        onChange={setTab}
        hide={advanced ? [] : ["investments", "debt"]}
        tabs={[
          { id: "overview", label: "Income & expenses" },
          { id: "spending", label: "Spending" },
          { id: "networth", label: "Net worth" },
          { id: "investments", label: "Investments" },
          { id: "debt", label: "Debt & credit" },
          { id: "annual", label: "Annual review" },
          { id: "health", label: "Health score" },
        ]}
      />
      <div className="print-only mb-4 text-[13px] text-ink-3">Kosh report · generated {formatDate(today, "long")}</div>
      {tab === "overview" && <Overview />}
      {tab === "spending" && <Spending />}
      {tab === "networth" && <NetWorth />}
      {tab === "investments" && <InvestmentReport />}
      {tab === "debt" && <DebtReport />}
      {tab === "annual" && <Annual />}
      {tab === "health" && <Health />}
    </>
  );
}

function Overview() {
  const { ds, positions, today, ctx } = useFinance();
  const rows = useMemo(() => monthlySeries(ds, positions, today, 11, 3), [ds, positions, today]);
  const actual = rows.filter((r) => !r.projected && (r.income || r.expenses));
  const avg = (k: "income" | "expenses" | "invested") => (actual.length ? actual.reduce((s, r) => s + r[k], 0) / actual.length : 0);
  const avgInc = avg("income");
  const avgExp = avg("expenses");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Avg monthly income", v: avgInc },
          { label: "Avg monthly spending", v: avgExp },
          { label: "Avg savings rate", text: avgInc ? formatPct(((avgInc - avgExp) / avgInc) * 100, 0) : "—" },
          { label: "Invested of income", text: avgInc ? formatPct((avg("invested") / avgInc) * 100, 0) : "—" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[12.5px] text-ink-3">{k.label}</p>
            {"v" in k ? <Money value={k.v ?? 0} className="text-[20px] font-semibold" /> : <p className="num text-[20px] font-semibold">{k.text}</p>}
          </div>
        ))}
      </div>
      <Panel title="Income vs expenses" description="Last 12 months, then 3 projected">
        <CashFlowChart rows={rows} height={280} />
      </Panel>
      <Panel title="Month by month" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-3">
                <th className="px-4 py-2 font-medium">Month</th>
                <th className="px-4 py-2 text-right font-medium">Income</th>
                <th className="px-4 py-2 text-right font-medium">Spending</th>
                <th className="px-4 py-2 text-right font-medium">Left over</th>
                <th className="px-4 py-2 text-right font-medium">Savings rate</th>
                <th className="px-4 py-2 text-right font-medium">Invested</th>
                <th className="px-4 py-2 text-right font-medium">Debt repaid</th>
              </tr>
            </thead>
            <tbody className="num">
              {[...rows].reverse().map((r) => (
                <tr key={r.month} className={cn("border-b border-line last:border-0", r.projected && "text-future-ink")}>
                  <td className="px-4 py-2 font-sans">
                    {formatMonth(r.month)}
                    {r.projected ? " (plan)" : ""}
                  </td>
                  <td className="px-4 py-2 text-right">{formatMoney(r.income, ctx)}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(r.expenses, ctx)}</td>
                  <td className={cn("px-4 py-2 text-right", r.net < 0 && "text-danger")}>{formatMoney(r.net, ctx)}</td>
                  <td className="px-4 py-2 text-right">{r.savingsRate == null ? "—" : formatPct(r.savingsRate, 0)}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(r.invested, ctx)}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(r.debtPaid, ctx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

const PERIODS = [
  { id: "this", label: "This month" },
  { id: "last", label: "Last month" },
  { id: "3m", label: "Last 3 months" },
  { id: "6m", label: "Last 6 months" },
  { id: "ytd", label: "This year" },
  { id: "12m", label: "Last 12 months" },
];

function periodRange(id: string, today: string): [string, string] {
  switch (id) {
    case "last":
      return [startOfMonth(addMonths(today, -1)), endOfMonth(addMonths(today, -1))];
    case "3m":
      return [startOfMonth(addMonths(today, -2)), today];
    case "6m":
      return [startOfMonth(addMonths(today, -5)), today];
    case "ytd":
      return [`${today.slice(0, 4)}-01-01`, today];
    case "12m":
      return [startOfMonth(addMonths(today, -11)), today];
    default:
      return [startOfMonth(today), today];
  }
}

function Spending() {
  const { ds, today, ctx } = useFinance();
  const [period, setPeriod] = useState("3m");
  const [from, to] = periodRange(period, today);
  const cats = useMemo(() => categoryBreakdown(ds, from, to), [ds, from, to]);
  const fv = useMemo(() => fixedVsVariable(ds, from, to), [ds, from, to]);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const merchants = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of ds.transactions) {
      if (t.date < from || t.date > to || isOpening(t)) continue;
      const c = classify(t);
      if (!c.expense || !t.description) continue;
      m.set(t.description, (m.get(t.description) ?? 0) + c.expense);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [ds.transactions, from, to]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select aria-label="Period" className="w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
        <p className="text-[13.5px] text-ink-2">
          {formatDate(from)} – {formatDate(to)} · <Money value={total} className="font-semibold text-ink" /> spent
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="By category">
          {cats.length ? <RankedBars items={cats.map((c) => ({ name: c.name, amount: c.amount, hint: `${formatPct(c.share * 100, 0)} of spending` }))} /> : <p className="text-[13.5px] text-ink-3">No spending in this period.</p>}
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Fixed vs variable" description="Fixed = bills and EMIs that don't change much">
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
              <div style={{ width: `${(fv.fixed / Math.max(1, fv.fixed + fv.variable)) * 100}%`, background: "var(--chart-in)" }} />
              <div style={{ width: `${(fv.variable / Math.max(1, fv.fixed + fv.variable)) * 100}%`, background: "var(--chart-out)" }} />
            </div>
            <div className="mt-3">
              <KV k={<span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-in)" }} />Fixed</span>} v={formatMoney(fv.fixed, ctx)} />
              <KV k={<span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-out)" }} />Variable</span>} v={formatMoney(fv.variable, ctx)} />
            </div>
          </Panel>
          <Panel title="Top merchants & payees">
            {merchants.length ? merchants.map(([name, amt]) => <KV key={name} k={<span className="truncate">{name}</span>} v={formatMoney(amt, ctx)} />) : <p className="text-[13.5px] text-ink-3">Add descriptions to transactions to see this.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function NetWorth() {
  const { ds, positions, today, assumptions, ctx } = useFinance();
  const pts = useNetWorthSeries(24);
  const [real, setReal] = useState(false);
  const shown: SeriesPoint[] = real
    ? pts.map((p) => {
        const f = Math.pow(1 + assumptions.inflation / 100, yearsBetween(today, p.date));
        return { date: p.date, actual: p.actual == null ? p.actual : p.actual / (p.date < today ? 1 : f), projected: p.projected == null ? p.projected : p.projected / f };
      })
    : pts;
  const snaps = [...ds.net_worth_snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
  const t = positions.totals;
  const ytdStart = snaps.find((s) => s.date >= `${today.slice(0, 4)}-01-01`) ?? snaps[0];
  const first = snaps[0];
  const monthEnds = snaps.filter((s, i) => i === snaps.length - 1 || s.date.slice(0, 7) !== snaps[i + 1]?.date.slice(0, 7)).slice(-12);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Net worth today</p>
          <Money value={t.netWorth} className="text-[20px] font-semibold" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">This year</p>
          <Money value={ytdStart ? t.netWorth - ytdStart.net_worth : 0} sign className="text-[20px] font-semibold" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Since tracking began</p>
          <Money value={first ? t.netWorth - first.net_worth : 0} sign className="text-[20px] font-semibold" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Assets / liabilities</p>
          <p className="num text-[15px] font-semibold">
            {formatMoney(t.totalAssets, ctx)} / {formatMoney(t.totalLiabilities, ctx)}
          </p>
        </div>
      </div>
      <Panel
        title="Net worth over time"
        description="Recorded each day you open Kosh; projection for the next 2 years"
        action={
          <label className="flex items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--future)]" checked={real} onChange={(e) => setReal(e.target.checked)} />
            Inflation-adjusted
          </label>
        }
      >
        <TrendChart points={shown} today={today} height={300} />
      </Panel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="What makes it up">
          <KV k="Bank & cash" v={formatMoney(t.allAccounts, ctx)} />
          <KV k="Investments (market)" v={formatMoney(t.marketInvestments, ctx)} />
          <KV k="Retirement (EPF, PPF, NPS)" v={formatMoney(t.retirement, ctx)} />
          <KV k="Property & vehicles" v={formatMoney(t.physical, ctx)} />
          <KV k="Owed to you (lending, chits)" v={formatMoney(t.receivables + t.chitAssets, ctx)} />
          <KV k="Credit cards" v={formatMoney(-t.cardDebt, ctx)} />
          <KV k="Loans" v={formatMoney(-t.loanDebt, ctx)} />
          <KV k="Borrowed & chit dues" v={formatMoney(-(t.borrowed + t.chitLiability), ctx)} />
          <div className="mt-2 flex justify-between border-t-2 border-ink pt-2 font-semibold">
            <span>Net worth</span>
            <Money value={t.netWorth} />
          </div>
        </Panel>
        <Panel title="Monthly change">
          {monthEnds.length > 1 ? (
            <ul className="divide-y divide-line text-[13.5px]">
              {monthEnds
                .map((s, i) => ({ s, prev: monthEnds[i - 1] }))
                .filter((x) => x.prev)
                .reverse()
                .map(({ s, prev }) => {
                  const d = s.net_worth - prev!.net_worth;
                  const di = s.investments - prev!.investments;
                  const dc = s.cash - prev!.cash;
                  const dl = s.liabilities - prev!.liabilities;
                  const driver = [
                    { n: "investments", v: di },
                    { n: "cash", v: dc },
                    { n: "debt", v: -dl },
                  ].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
                  return (
                    <li key={s.date} className="flex items-baseline justify-between gap-3 py-2">
                      <span>
                        {formatMonth(s.date.slice(0, 7))}
                        <span className="block text-[12px] text-ink-3">
                          Mostly {driver.n} ({formatMoney(driver.v, ctx, { sign: true })})
                        </span>
                      </span>
                      <span className={cn("num font-medium", d >= 0 ? "text-ok" : "text-danger")}>{formatMoney(d, ctx, { sign: true })}</span>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="text-[13.5px] text-ink-3">Kosh records your net worth each day you open it. Come back next month to see the change.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function InvestmentReport() {
  const { positions, ds, today, ctx } = useFinance();
  const alloc = allocation(positions);
  const list = [...positions.investments.values()].filter((p) => !p.investment.archived && p.investment.type !== "vehicle").sort((a, b) => b.valueBase - a.valueBase);
  const dividends = ds.transactions.filter((t) => t.type === "income" && (t.investment_id || t.category === "Interest & dividends") && t.date >= `${today.slice(0, 4)}-01-01`).reduce((s, t) => s + t.amount, 0);
  const contributions = ds.transactions.filter((t) => t.type === "invest_buy" && t.date >= startOfMonth(addMonths(today, -11))).reduce((s, t) => s + t.amount, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Panel title="Allocation">
          <AllocationBar items={alloc} />
          <div className="mt-4 border-t border-line pt-3">
            <KV k="Dividends & interest this year" v={formatMoney(dividends, ctx)} />
            <KV k="Invested in the last 12 months" v={formatMoney(contributions, ctx)} />
          </div>
        </Panel>
        <Panel title="Performance by holding" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th className="px-4 py-2 font-medium">Holding</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 text-right font-medium">Invested</th>
                  <th className="px-4 py-2 text-right font-medium">Return</th>
                  <th className="px-4 py-2 text-right font-medium">XIRR</th>
                </tr>
              </thead>
              <tbody className="num">
                {list.map((p) => (
                  <tr key={p.investment.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-sans">
                      <span className="block max-w-[220px] truncate">{p.investment.name}</span>
                      <span className="text-[11.5px] text-ink-3">{INVESTMENT_TYPE_LABEL[p.investment.type]}</span>
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(p.valueBase, ctx)}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(p.invested, ctx)}</td>
                    <td className={cn("px-4 py-2 text-right", p.gain >= 0 ? "text-ok" : "text-danger")}>{formatPct(p.gainPct)}</td>
                    <td className="px-4 py-2 text-right">{p.xirr == null ? "—" : formatPct(p.xirr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function DebtReport() {
  const { positions, norms, ds, today, ctx } = useFinance();
  const interestYear = ds.transactions.filter((t) => t.type === "loan_emi" && t.date >= `${today.slice(0, 4)}-01-01`).reduce((s, t) => s + (t.interest_part ?? 0), 0);
  const cards = [...positions.cards.values()].filter((c) => !c.card.archived);
  const loans = [...positions.loans.values()].filter((l) => l.loan.status === "active");
  const t = positions.totals;
  const burden = norms.income > 0 ? (norms.emis / norms.income) * 100 : 0;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="EMI burden">
        <p className={cn("display text-[40px] font-semibold", burden > 40 ? "text-danger" : burden > 30 ? "text-warn" : "text-ink")}>{formatPct(burden, 0)}</p>
        <p className="text-[13.5px] text-ink-2">of monthly income goes to EMIs ({formatMoney(norms.emis, ctx)} of {formatMoney(norms.income, ctx)}). Lenders like this under 40%; under 30% is comfortable.</p>
        <div className="mt-3 border-t border-line pt-2">
          <KV k="Interest paid this year" v={formatMoney(interestYear, ctx)} />
          <KV k="Interest still to pay on loans" v={formatMoney(loans.reduce((s, l) => s + l.state.interestRemaining, 0), ctx)} />
          <KV k="Debt-free by" v={loans.length ? formatDate(loans.map((l) => l.state.endDate ?? today).sort().at(-1)) : "No loans"} />
        </div>
      </Panel>
      <Panel title="Credit utilisation" description={`${formatPct(t.creditLimit ? (t.cardDebt / t.creditLimit) * 100 : 0, 0)} of ${formatMoney(t.creditLimit, ctx)} total limit`}>
        <ul className="flex flex-col gap-3">
          {cards.map((c) => (
            <li key={c.card.id}>
              <div className="flex justify-between text-[13.5px]">
                <span>{c.card.name}</span>
                <span className="num text-ink-2">
                  {formatMoney(c.outstanding, ctx)} / {formatMoney(c.card.credit_limit, ctx)}
                </span>
              </div>
              <Progress className="mt-1" value={c.utilization} tone={c.utilization > 0.7 ? "danger" : c.utilization > 0.3 ? "warn" : "brand"} label={`${c.card.name} utilisation`} />
            </li>
          ))}
          {!cards.length && <p className="text-[13.5px] text-ink-3">No cards.</p>}
        </ul>
        <p className="mt-3 text-[12.5px] text-ink-3">Keeping each card under 30% helps your credit score. Paying in full by the due date avoids interest entirely.</p>
      </Panel>
    </div>
  );
}

function Annual() {
  const { ds, positions, today, goals, ctx } = useFinance();
  const years = Array.from(new Set([today.slice(0, 4), ...ds.transactions.map((t) => t.date.slice(0, 4))])).sort().reverse();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const s = useMemo(() => annualSummary(ds, positions, year), [ds, positions, year]);
  const recs: string[] = [];
  if (s.savingsRate != null && s.savingsRate < 20) recs.push("Aim to save at least 20% of income — review your top spending categories below.");
  const topCat = s.categories[0];
  if (topCat && topCat.share > 0.3) recs.push(`${topCat.name} was ${formatPct(topCat.share * 100, 0)} of spending — set a budget for it.`);
  if (positions.totals.cardDebt > 0 && positions.totals.creditLimit && positions.totals.cardDebt / positions.totals.creditLimit > 0.3) recs.push("Bring credit-card utilisation under 30%.");
  const offTrack = goals.filter((g) => g.status === "off_track");
  if (offTrack.length) recs.push(`Revisit ${offTrack.map((g) => g.goal.name).join(", ")} — raise the monthly amount or move the date.`);
  if (!recs.length) recs.push("You're in good shape — consider raising SIPs by your salary hike percentage this year.");
  return (
    <div className="flex flex-col gap-4">
      <Select aria-label="Year" className="w-32" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Income", s.income],
          ["Spending", s.expenses],
          ["Saved", s.savings],
          ["Invested", s.invested],
          ["Debt repaid", s.debtPaid],
          ["Net worth change", s.netWorthChange],
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[12.5px] text-ink-3">{label}</p>
            {v == null ? <p className="text-[18px] font-semibold">—</p> : <Money value={v as number} sign={label === "Net worth change"} className="text-[18px] font-semibold" />}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Largest expenses">
          {s.largest.length ? s.largest.map((t) => <KV key={t.id} k={<span className="truncate">{t.description} <span className="text-ink-3">· {formatDate(t.date, "short")}</span></span>} v={formatMoney(t.amount, ctx)} />) : <p className="text-[13.5px] text-ink-3">No expenses recorded.</p>}
        </Panel>
        <Panel title="Where it went">
          <RankedBars items={s.categories.slice(0, 8).map((c) => ({ name: c.name, amount: c.amount }))} />
        </Panel>
        <Panel title="Goal progress">
          {goals.map((g) => (
            <div key={g.goal.id} className="mb-3">
              <div className="flex justify-between text-[13.5px]">
                <span>{g.goal.name}</span>
                <span className="num text-ink-2">{formatPct(g.progress * 100, 0)}</span>
              </div>
              <Progress className="mt-1" value={g.progress} label={`${g.goal.name}`} />
            </div>
          ))}
          {!goals.length && <p className="text-[13.5px] text-ink-3">No goals.</p>}
        </Panel>
        <Panel title={`For ${year + 1}`}>
          <ul className="list-disc space-y-1.5 pl-5 text-[14px] text-ink-2">
            {recs.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-ink-3">Tax figures aren&apos;t calculated here — export this year&apos;s transactions for your tax filing.</p>
        </Panel>
      </div>
    </div>
  );
}

function Health() {
  const { positions, norms, ef, goals, ds, today, month } = useFinance();
  const retirement = useMemo(() => retirementPlan(ds, positions, norms, today), [ds, positions, norms, today]);
  const h = healthScore({ positions, norms, ef, goals, retirement, savingsRate: month.savingsRate });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <Panel title="Financial health">
        <p className={cn("display text-[72px] font-semibold leading-none", h.overall >= 75 ? "text-ok" : h.overall >= 50 ? "text-future-ink" : "text-warn")}>{h.overall}</p>
        <p className="mt-1 text-[14px] text-ink-2">out of 100 — {h.overall >= 75 ? "strong" : h.overall >= 50 ? "decent, with room to improve" : "needs attention"}.</p>
        <p className="mt-3 text-[12.5px] text-ink-3">A weighted mix of the eight measures on the right. Each explains exactly why it scored what it did.</p>
      </Panel>
      <Panel title="What it's made of">
        <ul className="flex flex-col gap-4">
          {h.parts.map((p) => (
            <li key={p.key}>
              <div className="flex items-baseline justify-between text-[14px]">
                <span className="font-medium">{p.label}</span>
                <span className="num font-semibold">{p.score}</span>
              </div>
              <Progress className="mt-1" value={p.score / 100} tone={p.score >= 70 ? "brand" : p.score >= 40 ? "future" : "warn"} label={p.label} />
              <p className="mt-1 text-[12.5px] text-ink-3">{p.detail}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
