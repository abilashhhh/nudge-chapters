"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, Landmark, PiggyBank, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Money } from "@/components/money";
import { cn } from "@/lib/cn";
import { addMonths, formatDate, formatMonthLong, monthKey, relativeDays, startOfMonth } from "@/lib/dates";
import { classify, isOpening } from "@/lib/engine/ledger";
import { agenda } from "@/lib/engine/life";
import { monthMetrics, type MonthMetrics } from "@/lib/engine/metrics";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useUI } from "@/lib/ui";

export type Period = "this" | "next" | "all";
type Stat = { label: string; value: number; icon: typeof Wallet; href: string; note?: ReactNode; tone?: "auto"; strong?: boolean };
type Row = { key: string; title: string; date: string; amount?: number; overdue: boolean; open: () => void };

/** Month figures for the selected period: this month, next month, or null for all time. */
export function usePeriodMetrics(period: Period): MonthMetrics | null {
  const { ds, today, positions, month } = useFinance();
  const nextStart = addMonths(startOfMonth(today), 1);
  const next = useMemo(() => (period === "next" ? monthMetrics(ds, positions, today, undefined, nextStart) : null), [period, ds, positions, today, nextStart]);
  return period === "this" ? month : period === "next" ? next : null;
}

export function PeriodTabs({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const tabs: { id: Period; label: string }[] = [
    { id: "this", label: "This month" },
    { id: "next", label: "Next month" },
    { id: "all", label: "All time" },
  ];
  return (
    <div role="tablist" aria-label="Period" className="inline-flex rounded-xl bg-surface-3 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={period === t.id}
          onClick={() => onChange(t.id)}
          className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200", period === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** The figures for the selected period. Every tile opens the section behind it. */
export function PeriodSummary({ period, metrics }: { period: Period; metrics: MonthMetrics | null }) {
  const { ds, today, ctx } = useFinance();

  const allTime = useMemo(() => {
    if (period !== "all") return null;
    const reimbLoans = new Set(ds.loans.filter((l) => l.reimbursable_person).map((l) => l.id));
    let earned = 0, spent = 0, invested = 0, debtPaid = 0;
    let first: string | null = null;
    for (const t of ds.transactions) {
      if (isOpening(t) || t.date > today) continue;
      if (t.loan_id && reimbLoans.has(t.loan_id)) continue;
      const c = classify(t);
      earned += c.income;
      spent += c.expense;
      invested += c.invested;
      debtPaid += c.debtPaid;
      if (!first || t.date < first) first = t.date;
    }
    return { earned, spent, invested, debtPaid, first };
  }, [period, ds.transactions, ds.loans, today]);

  let stats: Stat[] = [];
  let caption = "";
  let rows: Row[] = [];
  let listTitle = "";
  const m = metrics;
  if (period === "this" && m) {
    caption = formatMonthLong(monthKey(today));
    stats = [
      { label: "Money in", value: m.incomeTotal, icon: ArrowDownLeft, href: "/cash-flow?tab=transactions", note: m.incomeExpected > 0 ? `${formatMoney(m.incomeExpected, ctx)} still to come` : "All received" },
      { label: "Spent", value: m.spentThisMonth, icon: ArrowUpRight, href: "/cash-flow?tab=transactions" },
      { label: "Bills & EMIs", value: m.committedTotal, icon: Receipt, href: "/cash-flow?tab=bills", note: m.unpaidAmount > 0 ? `${formatMoney(m.unpaidAmount, ctx)} still to pay` : "All paid" },
      { label: "Safe to spend", value: m.spendable, icon: Wallet, href: "/money", tone: "auto", strong: true, note: "After bills, budgets and reserves" },
    ];
    const ag = agenda(ds.life_items, today);
    rows = [
      ...m.unpaid.map((e) => ({ key: "e:" + e.key, title: e.title, date: e.date, amount: e.remaining, overdue: e.date < today, open: () => useUI.getState().openEvent(e.key) })),
      ...[...ag.overdue, ...ag.today, ...ag.upcoming].map((t) => ({ key: "t:" + t.id, title: t.title, date: t.due_date!, overdue: t.due_date! < today, open: () => useUI.getState().openLife(t.kind, t.id) })),
    ]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 5);
    listTitle = "Coming up";
  } else if (period === "next" && m) {
    caption = formatMonthLong(m.month) + " · planned";
    stats = [
      { label: "Money in", value: m.incomeTotal, icon: ArrowDownLeft, href: "/cash-flow?tab=recurring", note: "Expected income" },
      { label: "Bills & EMIs", value: m.committedTotal, icon: Receipt, href: "/calendar", note: `${m.committedItems.length} payments` },
      { label: "Budgets", value: m.budgetLimit, icon: PiggyBank, href: "/budgets", note: "Planned spending" },
      { label: "Left to spend", value: m.spendable, icon: Wallet, href: "/projection", tone: "auto", strong: true, note: "Estimate" },
    ];
    rows = [...m.committedItems]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 5)
      .map((e) => ({ key: e.key, title: e.title, date: e.date, amount: e.remaining || e.amount, overdue: false, open: () => useUI.getState().openEvent(e.key) }));
    listTitle = "Due next month";
  } else if (period === "all" && allTime) {
    caption = allTime.first ? `Since ${formatDate(allTime.first)}` : "Nothing recorded yet";
    stats = [
      { label: "Earned", value: allTime.earned, icon: ArrowDownLeft, href: "/reports?tab=annual" },
      { label: "Spent", value: allTime.spent, icon: ArrowUpRight, href: "/reports?tab=spending" },
      { label: "Invested", value: allTime.invested, icon: PiggyBank, href: "/assets?tab=investments" },
      { label: "Debt repaid", value: allTime.debtPaid, icon: Landmark, href: "/reports?tab=debt" },
    ];
  }

  return (
    <section aria-label="Money by period" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-[12.5px] text-ink-3">{caption}</p>
      <div key={period} className="animate-fade">
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={cn(
                "group rounded-xl p-3 transition-all hover:-translate-y-0.5 active:scale-[0.98]",
                s.strong ? "bg-ink text-paper" : "bg-surface-3/60 hover:bg-surface-3",
              )}
            >
              <p className={cn("flex items-center gap-1.5 text-[12.5px]", s.strong ? "opacity-70" : "text-ink-3")}>
                <s.icon className="h-3.5 w-3.5" aria-hidden />
                <span className="flex-1">{s.label}</span>
                <ChevronRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </p>
              <Money value={s.value} tone={s.strong ? undefined : s.tone} className="display mt-1 block text-[20px] font-semibold leading-tight sm:text-[22px]" />
              {s.note && <p className={cn("mt-0.5 text-[11.5px]", s.strong ? "opacity-60" : "text-ink-3")}>{s.note}</p>}
            </Link>
          ))}
        </div>

        {period !== "all" && (
          <div className="mt-4">
            <h3 className="text-[13px] font-semibold">{listTitle}</h3>
            {rows.length === 0 ? (
              <p className="mt-1 text-[13.5px] text-ink-2">Nothing due — all clear.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.key}>
                    <button type="button" onClick={r.open} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-surface-3/60">
                      <CalendarClock className={cn("h-4 w-4 shrink-0", r.overdue ? "text-danger" : "text-ink-3")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{r.title}</span>
                        <span className={cn("block text-[12px]", r.overdue ? "text-danger" : "text-ink-3")}>
                          {r.overdue ? "Overdue · " : ""}
                          {period === "next" ? formatDate(r.date) : relativeDays(today, r.date)}
                        </span>
                      </span>
                      {r.amount != null && <Money value={r.amount} className="shrink-0 text-[14px] font-semibold" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
