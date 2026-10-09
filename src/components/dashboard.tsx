"use client";

import { ArrowDown, ArrowRight, ArrowUp, Eye, EyeOff, Info, Settings2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addDays, addMonths, diffMonths, endOfMonth, formatDate, startOfMonth } from "@/lib/dates";
import { isPending } from "@/lib/engine/events";
import { project } from "@/lib/engine/projection";
import { allocation, monthlySeries } from "@/lib/engine/reports";
import { useFinance, useMonthMetrics } from "@/lib/finance";
import { MonthPicker } from "./ui/month-picker";
import { SalaryPlanPanel } from "./salary-plan";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import type { DashboardWidgetPref } from "@/lib/types";
import { AllocationBar, CashFlowChart, TrendChart, type SeriesPoint } from "./charts";
import { EventRow } from "./event-row";
import { useExplain, type ExplainLine } from "./explain";
import { Money } from "./money";
import { AlertRow, useAlertActions } from "./shell/alerts-panel";
import { Button, IconButton } from "./ui/button";
import { DateInput } from "./ui/form";
import { EmptyState, Panel, Progress } from "./ui/misc";
import { Sheet } from "./ui/sheet";

// ---------------------------------------------------------------------------
// Widget registry & layout
// ---------------------------------------------------------------------------

const WIDGETS: Record<string, { label: string; span: string }> = {
  hero: { label: "Spendable, net worth & key numbers", span: "lg:col-span-12" },
  ribbon: { label: "Future date projection", span: "lg:col-span-12" },
  upcoming: { label: "Upcoming bills", span: "lg:col-span-6 xl:col-span-4" },
  income: { label: "Upcoming income", span: "lg:col-span-6 xl:col-span-4" },
  alerts: { label: "Alerts", span: "lg:col-span-6 xl:col-span-4" },
  cashflow: { label: "Cash flow chart", span: "lg:col-span-7" },
  networth: { label: "Net worth chart", span: "lg:col-span-5" },
  goals: { label: "Goals", span: "lg:col-span-6" },
  budgets: { label: "This month's budgets", span: "lg:col-span-6" },
  timeline: { label: "Next 90 days", span: "lg:col-span-7" },
  investments: { label: "Investments", span: "lg:col-span-5" },
};

/** A widget disappears with its section (Settings → Sections). */
const WIDGET_SECTION: Record<string, string> = { goals: "goals", budgets: "budgets", investments: "investments", ribbon: "projections", networth: "reports", cashflow: "reports", upcoming: "bills" };

const DEFAULT_DESKTOP = ["hero", "ribbon", "upcoming", "income", "alerts", "cashflow", "networth", "timeline", "investments", "goals", "budgets"];
const DEFAULT_MOBILE = ["hero", "ribbon", "upcoming", "timeline", "investments", "goals", "alerts", "budgets", "income", "cashflow", "networth"];

function useIsDesktop() {
  const [desk, setDesk] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesk(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desk;
}

function resolveLayout(saved: DashboardWidgetPref[] | undefined, fallback: string[]): DashboardWidgetPref[] {
  const known = new Set(Object.keys(WIDGETS));
  const list = (saved ?? []).filter((w) => known.has(w.id));
  for (const id of fallback) if (!list.find((w) => w.id === id)) list.push({ id });
  return list;
}

export function Dashboard() {
  const { ds } = useFinance();
  const desktop = useIsDesktop();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const [customize, setCustomize] = useState(false);
  const key = desktop ? "desktop" : "mobile";
  const layout = resolveLayout(ds.profile.preferences?.dashboard?.[key], desktop ? DEFAULT_DESKTOP : DEFAULT_MOBILE);
  const name = ds.profile.name?.split(" ")[0];
  const { today } = useFinance();

  const save = (next: DashboardWidgetPref[] | undefined) =>
    updatePrefs({ dashboard: { ...(ds.profile.preferences?.dashboard ?? {}), [key]: next } });

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="display text-[26px] font-semibold leading-tight sm:text-[30px]">{greeting()}{name ? `, ${name}` : ""}</h1>
        <MonthPicker today={today} className="ml-auto hidden md:flex" />
        <Button size="sm" variant="ghost" icon={<Settings2 className="h-4 w-4" />} onClick={() => setCustomize(true)}>
          <span className="hidden sm:inline">Customise</span>
        </Button>
      </div>
      <MonthPicker today={today} className="mb-3 md:hidden" />
      <div className="mb-4 empty:hidden">
        <SalaryPlanPanel />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {layout
          .filter((w) => !w.hidden && !(ds.profile.preferences?.hidden?.widgets ?? []).includes(w.id))
          .filter((w) => !(ds.profile.preferences?.hidden?.sections ?? []).includes(WIDGET_SECTION[w.id] ?? "-"))
          .map((w) => (
            <div key={w.id} className={cn("min-w-0", WIDGETS[w.id].span)}>
              <Widget id={w.id} />
            </div>
          ))}
      </div>
      <Sheet
        open={customize}
        onClose={() => setCustomize(false)}
        title="Customise dashboard"
        description={`Changes apply to the ${desktop ? "desktop" : "phone"} layout only.`}
        size="sm"
        footer={
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => save(undefined)}>
              Reset to default
            </Button>
            <Button variant="primary" onClick={() => setCustomize(false)}>
              Done
            </Button>
          </div>
        }
      >
        <ul className="divide-y divide-line">
          {layout.map((w, i) => (
            <li key={w.id} className="flex items-center gap-2 py-2">
              <span className={cn("flex-1 text-[14px]", w.hidden && "text-ink-3 line-through")}>{WIDGETS[w.id].label}</span>
              <IconButton
                label={w.hidden ? `Show ${WIDGETS[w.id].label}` : `Hide ${WIDGETS[w.id].label}`}
                onClick={() => save(layout.map((x) => (x.id === w.id ? { ...x, hidden: !x.hidden } : x)))}
              >
                {w.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </IconButton>
              <IconButton
                label="Move up"
                disabled={i === 0}
                className="disabled:opacity-30"
                onClick={() => {
                  const next = [...layout];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  save(next);
                }}
              >
                <ArrowUp className="h-4 w-4" />
              </IconButton>
              <IconButton
                label="Move down"
                disabled={i === layout.length - 1}
                className="disabled:opacity-30"
                onClick={() => {
                  const next = [...layout];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  save(next);
                }}
              >
                <ArrowDown className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Widget({ id }: { id: string }) {
  switch (id) {
    case "hero":
      return <Hero />;
    case "ribbon":
      return <ProjectionRibbon />;
    case "upcoming":
      return <UpcomingBills />;
    case "income":
      return <UpcomingIncome />;
    case "alerts":
      return <AlertsWidget />;
    case "cashflow":
      return <CashFlowWidget />;
    case "networth":
      return <NetWorthWidget />;
    case "goals":
      return <GoalsWidget />;
    case "budgets":
      return <BudgetsWidget />;
    case "timeline":
      return <TimelineWidget />;
    case "investments":
      return <InvestmentsWidget />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Hero: safe to spend + net worth + key numbers
// ---------------------------------------------------------------------------

function Hero() {
  const f = useFinance();
  const { positions, ds, today, ctx } = f;
  const month = useMonthMetrics();
  const router = useRouter();
  const t = positions.totals;
  const explain = useExplain((s) => s.show);
  const prevSnap = [...ds.net_worth_snapshots].filter((s) => s.date <= addDays(startOfMonth(today), -1)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const nwDelta = prevSnap ? t.netWorth - prevSnap.net_worth : null;

  const showSpendable = () =>
    explain({
      title: month.period === "current" ? "Safe to spend this month" : month.period === "future" ? `Safe to spend in ${formatDate(month.from, "medium").slice(3)}` : "That month",
      intro:
        month.period === "future"
          ? `Starts from the cash projected for ${formatDate(month.from)} and uses only that month's own income, bills and budgets.`
          : `What's left until ${formatDate(month.to)} after everything you've committed to.`,
      lines: month.spendableLines.map((l) => ({ label: l.label, amount: l.amount, hint: l.hint })),
      total: { label: "Safe to spend", amount: month.spendable },
      footnote: "Uncertain income (like a bonus) isn't counted. Tap Cash flow to see each bill.",
    });

  const listOf = (items: typeof month.committedItems, sign = -1): ExplainLine[] =>
    items.map((e) => ({
      label: e.title,
      amount: sign * (isPending(e) ? e.remaining : e.paid || e.amount),
      hint: `${formatDate(e.date, "short")} · ${isPending(e) ? (e.status === "overdue" ? "overdue" : "to pay") : "paid"}`,
      onClick: () => useUI.getState().openEvent(e.key),
    }));

  const kpis: { label: string; value: number; sub?: ReactNode; tone?: "in" | "warn"; onClick: () => void; projected?: boolean }[] = [
    {
      label: "Income this month",
      value: month.incomeTotal,
      sub: `${formatMoney(month.incomeReceived, ctx)} received`,
      onClick: () =>
        explain({
          title: "Income this month",
          lines: [
            { label: "Received so far", amount: month.incomeReceived },
            ...month.events.filter((e) => e.kind === "income" && isPending(e)).map((e) => ({ label: e.title, amount: e.remaining, hint: `Expected ${formatDate(e.date, "short")}${e.excluded ? " · uncertain" : ""}`, projected: true, indent: true })),
          ],
          total: { label: "Total", amount: month.incomeTotal },
        }),
    },
    {
      label: "Committed this month",
      value: month.committedTotal,
      sub: `${formatMoney(month.committedPending, ctx)} still to pay`,
      onClick: () => explain({ title: "Committed this month", intro: "Bills, EMIs, card bills, SIPs, chits and transfers out.", lines: listOf(month.committedItems), total: { label: "Total committed", amount: -month.committedTotal } }),
    },
    {
      label: "Unpaid bills",
      value: month.unpaidAmount,
      sub: month.overdue.length ? `${month.overdue.length} overdue` : `${month.unpaid.length} left this month`,
      tone: month.overdue.length ? "warn" : undefined,
      onClick: () => explain({ title: "Unpaid bills", lines: listOf(month.unpaid), total: { label: "Total unpaid", amount: -month.unpaidAmount } }),
    },
    {
      label: "Investments",
      value: t.investments,
      sub: `${formatMoney(t.retirement, ctx)} retirement`,
      onClick: () =>
        explain({
          title: "Investments",
          lines: [...positions.investments.values()].filter((p) => !p.investment.archived && p.investment.type !== "vehicle" && p.investment.type !== "real_estate").sort((a, b) => b.valueBase - a.valueBase).map((p) => ({ label: p.investment.name, amount: p.valueBase, hint: `${p.gain >= 0 ? "+" : ""}${formatMoney(p.gain, ctx)} gain` })),
          total: { label: "Total", amount: t.investments },
        }),
    },
    {
      label: "Liabilities",
      value: t.totalLiabilities,
      sub: `${formatMoney(t.cardDebt, ctx)} on cards`,
      onClick: () =>
        explain({
          title: "What you owe",
          lines: [
            ...[...positions.cards.values()].filter((c) => c.outstanding > 0).map((c) => ({ label: c.card.name, amount: -c.outstanding, hint: "Credit card" })),
            ...[...positions.loans.values()].filter((l) => l.loan.status === "active").map((l) => ({ label: l.loan.name, amount: -l.state.outstanding, hint: `${l.state.remainingInstallments} EMIs left` })),
            ...[...positions.lendings.values()].filter((l) => l.lending.direction === "borrowed" && l.outstanding > 0).map((l) => ({ label: `Owed to ${l.lending.person}`, amount: -l.outstanding })),
            ...[...positions.chits.values()].filter((c) => c.liability > 0).map((c) => ({ label: c.chit.name, amount: -c.liability, hint: "Chit installments after payout" })),
          ],
          total: { label: "Total liabilities", amount: -t.totalLiabilities },
        }),
    },
    {
      label: "Owed to you",
      value: t.receivables,
      sub: (() => {
        const lent = [...positions.lendings.values()].filter((l) => l.lending.direction === "lent" && l.outstanding > 0);
        const dueNow = lent.filter((l) => (l.lending.expected_date ?? l.lending.date) < today).reduce((s, l) => s + l.outstanding, 0);
        const people = new Set(lent.map((l) => l.lending.person.split(/\s+[—–-]\s+/)[0].trim().toLowerCase())).size;
        return `${people === 1 ? "1 person" : `${people} people`}${dueNow > 0 ? ` · ${formatMoney(dueNow, ctx)} due` : ""}`;
      })(),
      tone: "in",
      onClick: () => router.push("/owed"),
    },
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="grid grid-cols-1 gap-0 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <button type="button" onClick={showSpendable} className="group p-5 text-left sm:p-6">
          <p className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink-2">
            {month.period === "past" ? `Spent in ${formatDate(month.from, "medium").slice(3)}` : `Safe to spend until ${formatDate(month.to, "short")}`}
            <Info className="h-3.5 w-3.5 text-ink-3 group-hover:text-ink" aria-hidden />
          </p>
          <p className={cn("display anim-count mt-1 text-[44px] font-semibold leading-none tracking-tight sm:text-[56px]", month.spendable < 0 && month.period !== "past" && "text-danger")}>
            <Money value={month.period === "past" ? month.spentThisMonth : month.spendable} projected={month.period === "future"} />
          </p>
          <p className="mt-2 text-[13.5px] text-ink-2">
            From <Money value={month.availableCash} className="font-medium text-ink" /> {month.period === "future" ? "projected at the start of the month" : "in your accounts"}, after{" "}
            <Money value={month.committedPending} className="font-medium text-ink" /> of bills
            {month.budgetRemaining > 0 && (
              <>
                {" "}
                and <Money value={month.budgetRemaining} className="font-medium text-ink" /> of budgets
              </>
            )}
            .
          </p>
          {month.overdue.length > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-1 text-[12.5px] font-medium text-danger">
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
              {month.overdue.length} overdue · {formatMoney(month.overdueAmount, ctx)}
            </p>
          )}
        </button>
        <div className="flex flex-col justify-center gap-4 border-t border-line bg-surface-2 p-5 sm:p-6 md:border-l md:border-t-0">
          <Link href="/reports?tab=networth" className="group">
            <p className="text-[13.5px] font-medium text-ink-2">Net worth</p>
            <p className="display mt-0.5 text-[32px] font-semibold leading-none">
              <Money value={t.netWorth} />
            </p>
            {nwDelta != null && (
              <p className={cn("mt-1 text-[12.5px]", nwDelta >= 0 ? "text-ok" : "text-danger")}>
                {nwDelta >= 0 ? "▲" : "▼"} <Money value={Math.abs(nwDelta)} className="font-medium" /> since {formatDate(prevSnap!.date, "short")}
              </p>
            )}
          </Link>
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <p className="text-ink-3">Available cash</p>
              <Money value={t.cash} className="text-[16px] font-semibold" />
            </div>
            <div>
              <p className="text-ink-3">Runway if income stops</p>
              <p className="num text-[16px] font-semibold">{f.runway == null ? "—" : `${f.runway.toFixed(1)} months`}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-line sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k, i) => (
          <button
            key={k.label}
            type="button"
            onClick={k.onClick}
            className={cn(
              "border-line p-4 text-left transition-colors hover:bg-surface-2",
              i % 2 === 0 ? "border-r" : "",
              "sm:border-r xl:[&:nth-child(6)]:border-r-0",
              i < 4 ? "border-b sm:border-b-0" : "",
              i < 3 ? "sm:border-b xl:border-b-0" : "",
            )}
          >
            <p className="text-[12.5px] text-ink-3">{k.label}</p>
            <Money value={k.value} className={cn("mt-0.5 block text-[18px] font-semibold", k.tone === "warn" && k.value > 0 && "text-warn", k.tone === "in" && "text-ok")} />
            {k.sub && <p className="num mt-0.5 truncate text-[12px] text-ink-3">{k.sub}</p>}
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The projection ribbon: pick any future date, see where you'll be.
// ---------------------------------------------------------------------------

function ProjectionRibbon() {
  const f = useFinance();
  const { today, ds, positions, assumptions } = f;
  const updatePrefs = useStore((s) => s.updatePrefs);
  const saved = ds.profile.preferences?.projectionDate;
  const defaultDate = saved && saved > today ? saved : diffMonths(today, `${today.slice(0, 4)}-12-31`) >= 2 ? `${today.slice(0, 4)}-12-31` : `${Number(today.slice(0, 4)) + 1}-12-31`;
  const [date, setDate] = useState(defaultDate);
  const deferred = useDeferredValue(date);
  const months = Math.max(0, diffMonths(today, date));
  const res = useMemo(() => project(ds, { today, to: deferred, positions, assumptions, scenario: "base" }), [ds, today, deferred, positions, assumptions]);
  const yEnd = `${today.slice(0, 4)}-12-31`;
  const chips = [
    { label: "Month end", date: endOfMonth(today) },
    ...(yEnd > addDays(today, 20) ? [{ label: `31 Dec ${today.slice(2, 4)}`, date: yEnd }] : []),
    { label: "1 year", date: addMonths(today, 12) },
    { label: "3 years", date: addMonths(today, 36) },
    { label: "5 years", date: addMonths(today, 60) },
    { label: "10 years", date: addMonths(today, 120) },
  ];
  const choose = (d: string) => {
    setDate(d);
    void updatePrefs({ projectionDate: d });
  };
  const growth = res.end.netWorth - res.start.netWorth;
  return (
    <section className="rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="ribbon-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ribbon-title" className="text-[15px] font-semibold">
          Where you&apos;ll be on <span className="text-future-ink">{formatDate(date, "long")}</span>
        </h2>
        <Link href={`/projection?date=${date}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-future-ink hover:underline">
          See how it&apos;s calculated <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-3">
        <input
          type="range"
          className="ribbon w-full"
          min={0}
          max={120}
          step={1}
          value={Math.min(120, months)}
          aria-label="Projection date"
          aria-valuetext={formatDate(date)}
          onChange={(e) => {
            const m = Number(e.target.value);
            setDate(m === 0 ? endOfMonth(today) : endOfMonth(addMonths(today, m)));
          }}
          onPointerUp={() => void updatePrefs({ projectionDate: date })}
          onKeyUp={() => void updatePrefs({ projectionDate: date })}
        />
        <div className="flex justify-between text-[11.5px] text-ink-3">
          <span>Today</span>
          <span>+5 yrs</span>
          <span>+10 yrs</span>
        </div>
      </div>
      <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => choose(c.date)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-medium",
              c.date === date ? "border-future bg-future-soft text-future-ink" : "border-line text-ink-2 hover:border-line-strong",
            )}
          >
            {c.label}
          </button>
        ))}
        <DateInput aria-label="Pick a date" className="h-8 w-auto shrink-0 rounded-full px-3 text-[12.5px]" min={addDays(today, 1)} value={date} onChange={(e) => e.target.value > today && choose(e.target.value)} />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-[12.5px] text-ink-3">Cash</dt>
          <dd className="display text-[24px] font-semibold leading-tight">
            <Money value={res.end.cash} projected />
          </dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-ink-3">Net worth</dt>
          <dd className="display text-[24px] font-semibold leading-tight">
            <Money value={res.end.netWorth} projected />
          </dd>
          <dd className={cn("text-[12px]", growth >= 0 ? "text-ok" : "text-danger")}>
            {growth >= 0 ? "+" : "−"}
            <Money value={Math.abs(growth)} compact /> from today
          </dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-ink-3">Investments</dt>
          <dd className="text-[17px] font-semibold">
            <Money value={res.end.investments} projected />
          </dd>
        </div>
        <div>
          <dt className="text-[12.5px] text-ink-3">Still owed</dt>
          <dd className="text-[17px] font-semibold">
            <Money value={res.end.liabilities} projected />
          </dd>
        </div>
      </dl>
      {res.negativeOn ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Cash dips below zero on {formatDate(res.negativeOn)} (lowest <Money value={res.lowest.cash} className="font-semibold" /> on {formatDate(res.lowest.date, "short")}).
        </p>
      ) : (
        <p className="mt-4 text-[12.5px] text-ink-3">
          Base case: {assumptions.scenarios.base.salaryGrowth}% salary growth, {assumptions.scenarios.base.expenseGrowth}% expense growth, equity at{" "}
          {assumptions.scenarios.base.returns.equity}%/yr. Lowest cash before then: <Money value={res.lowest.cash} /> on {formatDate(res.lowest.date, "short")}.
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

function UpcomingBills() {
  const { events, today, ctx } = useFinance();
  const items = events
    .filter((e) => isPending(e) && !e.excluded && e.date <= addDays(today, 30) && (e.flow === "out" || (e.kind === "emi" && e.flow === "none")) && !e.budget)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const total = items.filter((e) => !(e.kind === "emi" && e.flow === "none")).reduce((s, e) => s + e.remaining, 0);
  return (
    <Panel
      title="Upcoming bills"
      description={`${formatMoney(total, ctx)} in the next 30 days, incl. overdue. Card EMIs are inside the card bill.`}
      action={
        <Link href="/cash-flow?tab=bills" className="text-[13px] font-medium text-ink-2 hover:text-ink">
          All bills
        </Link>
      }
      className="h-full"
    >
      {items.length ? (
        <div className="-mx-2 sm:-mx-3">
          {items.slice(0, 6).map((e) => (
            <EventRow key={e.key} e={e} compact />
          ))}
          {items.length > 6 && <p className="px-3 pt-1 text-[12.5px] text-ink-3">+{items.length - 6} more</p>}
        </div>
      ) : (
        <EmptyState title="No bills in the next 30 days" body="Add rent, subscriptions or EMIs as recurring items and they'll show up here." action={<Button size="sm" onClick={() => useUI.getState().openEditor("rule")}>Add a recurring bill</Button>} />
      )}
    </Panel>
  );
}

function UpcomingIncome() {
  const { events, today } = useFinance();
  const items = events.filter((e) => isPending(e) && e.flow === "in" && e.date <= addDays(today, 45)).sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <Panel title="Money coming in" description="Next 45 days" className="h-full">
      {items.length ? (
        <div className="-mx-2 sm:-mx-3">
          {items.slice(0, 5).map((e) => (
            <EventRow key={e.key} e={e} compact />
          ))}
        </div>
      ) : (
        <EmptyState title="No income expected yet" body="Add your salary as recurring income to see it here." action={<Button size="sm" onClick={() => useUI.getState().openEditor("rule", undefined, { kind: "income", category: "Salary" })}>Add income</Button>} />
      )}
    </Panel>
  );
}

function AlertsWidget() {
  const { alerts } = useFinance();
  const actions = useAlertActions();
  return (
    <Panel
      title="Needs attention"
      action={
        alerts.length > 4 ? (
          <button type="button" onClick={() => useUI.getState().setAlerts(true)} className="text-[13px] font-medium text-ink-2 hover:text-ink">
            All {alerts.length}
          </button>
        ) : undefined
      }
      className="h-full"
    >
      {alerts.length ? (
        <div className="divide-y divide-line">
          {alerts.slice(0, 4).map((a) => (
            <AlertRow key={a.key} a={a} onOpen={() => actions.open(a)} onDismiss={() => actions.dismiss(a)} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-[14px] text-ink-2">Nothing needs you right now.</p>
      )}
    </Panel>
  );
}

function CashFlowWidget() {
  const { ds, positions, today } = useFinance();
  const rows = useMemo(() => monthlySeries(ds, positions, today, 5, 6), [ds, positions, today]);
  return (
    <Panel title="Cash flow" description="Last 6 months and the next 6" className="h-full">
      <CashFlowChart rows={rows} />
    </Panel>
  );
}

export function useNetWorthSeries(monthsAhead = 12): SeriesPoint[] {
  const { ds, positions, today, assumptions } = useFinance();
  return useMemo(() => {
    const hist = [...ds.net_worth_snapshots].filter((s) => s.date < today).sort((a, b) => (a.date < b.date ? -1 : 1));
    const pts: SeriesPoint[] = hist.map((s) => ({ date: s.date, actual: s.net_worth }));
    pts.push({ date: today, actual: positions.totals.netWorth, projected: positions.totals.netWorth });
    if (monthsAhead > 0) {
      const res = project(ds, { today, to: endOfMonth(addMonths(today, monthsAhead)), positions, assumptions });
      for (const p of res.series) if (p.date > today && p.date.slice(8) !== "01") pts.push({ date: p.date, projected: p.netWorth });
    }
    return pts;
  }, [ds, positions, today, assumptions, monthsAhead]);
}

function NetWorthWidget() {
  const { today } = useFinance();
  const pts = useNetWorthSeries(12);
  return (
    <Panel title="Net worth" description="History and the next 12 months" className="h-full">
      <TrendChart points={pts} today={today} />
    </Panel>
  );
}

function GoalsWidget() {
  const { goals, ctx } = useFinance();
  return (
    <Panel
      title="Goals"
      action={
        <Link href="/goals" className="text-[13px] font-medium text-ink-2 hover:text-ink">
          All goals
        </Link>
      }
      className="h-full"
    >
      {goals.length ? (
        <ul className="flex flex-col gap-4">
          {goals.slice(0, 4).map((g) => (
            <li key={g.goal.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[14.5px] font-medium">{g.goal.name}</p>
                <p className="num shrink-0 text-[13px] text-ink-2">
                  <Money value={g.value} compact /> / <Money value={g.goal.target_amount} compact />
                </p>
              </div>
              <Progress className="mt-1.5" value={g.progress} tone={g.status === "off_track" ? "warn" : g.status === "done" ? "brand" : "future"} label={`${g.goal.name} progress`} />
              <p className="mt-1 text-[12px] text-ink-3">
                {g.status === "done"
                  ? "Reached 🎉"
                  : g.status === "on_track"
                    ? `On track — about ${g.projectedDate ? formatDate(g.projectedDate, "medium") : "—"}`
                    : g.status === "off_track"
                      ? `Off track — needs ${formatMoney(g.requiredMonthly ?? 0, ctx)}/month`
                      : g.projectedDate
                        ? `Reached around ${formatDate(g.projectedDate)}`
                        : "Set a monthly contribution to see when you'll get there"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No goals yet" body="An emergency fund is a good first one." action={<Button size="sm" onClick={() => useUI.getState().openEditor("goal", undefined, { kind: "emergency", name: "Emergency fund" })}>Create a goal</Button>} />
      )}
    </Panel>
  );
}

function BudgetsWidget() {
  const { ctx } = useFinance();
  const month = useMonthMetrics();
  const budgets = month.budgets;
  return (
    <Panel title="Spending budgets" description={`${formatMoney(month.budgetSpent, ctx)} of ${formatMoney(month.budgetLimit, ctx)} used`} className="h-full">
      {budgets.length ? (
        <ul className="flex flex-col gap-3.5">
          {budgets.map((b) => {
            const used = b.budget ? b.budget.spent / Math.max(1, b.budget.limit) : 0;
            return (
              <li key={b.key}>
                <button type="button" className="w-full text-left" onClick={() => useUI.getState().openEvent(b.key)}>
                  <div className="flex items-baseline justify-between gap-2 text-[14px]">
                    <span className="truncate font-medium">{b.title}</span>
                    <span className="num shrink-0 text-[13px] text-ink-2">
                      {formatMoney(b.budget?.spent ?? 0, ctx)} / {formatMoney(b.budget?.limit ?? 0, ctx)}
                    </span>
                  </div>
                  <Progress className="mt-1.5" value={used} tone={used > 1 ? "danger" : used > 0.85 ? "warn" : "brand"} label={`${b.title} budget used`} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No budgets" body="Create a recurring expense tracked as a spending budget (e.g. Groceries ₹7,000/month)." action={<Button size="sm" onClick={() => useUI.getState().openEditor("rule", undefined, { kind: "expense", is_fixed: false, name: "Groceries", category: "Groceries" })}>Add a budget</Button>} />
      )}
    </Panel>
  );
}

function TimelineWidget() {
  const { ds, today, positions, assumptions } = useFinance();
  const res = useMemo(() => project(ds, { today, to: addDays(today, 90), positions, assumptions }), [ds, today, positions, assumptions]);
  const items = res.timeline.filter((t) => !(t.event.kind === "card_spend") && !t.event.budget).slice(0, 14);
  return (
    <Panel title="Next 90 days" description="Planned money in and out, with your projected cash after each" className="h-full">
      {items.length ? (
        <ol className="relative ml-2 border-l-2 border-dashed border-future/40 pl-4">
          {items.map(({ event: e, cashAfter }) => (
            <li key={e.key + e.date} className="relative py-1.5">
              <span className={cn("absolute -left-[23px] top-3 h-3 w-3 rounded-full border-2 border-surface", e.flow === "in" ? "bg-ok" : "bg-future")} aria-hidden />
              <button type="button" onClick={() => useUI.getState().openEvent(e.key)} className="flex w-full items-baseline gap-3 text-left">
                <span className="num w-14 shrink-0 text-[12.5px] text-ink-3">{formatDate(e.date, "short")}</span>
                <span className="min-w-0 flex-1 truncate text-[14px]">{e.title}</span>
                <Money value={e.flow === "in" ? e.remaining : -e.remaining} sign className={cn("shrink-0 text-[13.5px] font-medium", e.flow === "in" ? "text-ok" : "text-ink")} />
                <Money value={cashAfter} projected className={cn("hidden w-24 shrink-0 text-right text-[12.5px] sm:inline", cashAfter < 0 && "text-danger")} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-6 text-center text-[14px] text-ink-2">Nothing planned in the next 90 days.</p>
      )}
    </Panel>
  );
}

function InvestmentsWidget() {
  const { positions, ctx } = useFinance();
  const alloc = allocation(positions);
  const inv = [...positions.investments.values()].filter((p) => !p.investment.archived && p.investment.type !== "vehicle" && p.investment.type !== "real_estate");
  const invested = inv.reduce((s, p) => s + p.invested, 0);
  const value = inv.reduce((s, p) => s + p.valueBase, 0);
  const gain = value - invested;
  return (
    <Panel
      title="Investments"
      action={
        <Link href="/assets?tab=investments" className="text-[13px] font-medium text-ink-2 hover:text-ink">
          Details
        </Link>
      }
      className="h-full"
    >
      {inv.length ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Money value={value} className="display text-[28px] font-semibold" />
            <span className={cn("text-[13.5px] font-medium", gain >= 0 ? "text-ok" : "text-danger")}>
              {gain >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(gain), ctx)} ({invested > 0 ? ((gain / invested) * 100).toFixed(1) : "0"}%)
            </span>
          </div>
          <p className="mb-4 text-[12.5px] text-ink-3">Invested {formatMoney(invested, ctx)} · prices as last updated</p>
          <AllocationBar items={alloc} />
        </>
      ) : (
        <EmptyState title="No investments yet" body="Add mutual funds, stocks, EPF, PPF, FDs or gold." action={<Button size="sm" onClick={() => useUI.getState().openEditor("investment")}>Add investment</Button>} />
      )}
    </Panel>
  );
}
