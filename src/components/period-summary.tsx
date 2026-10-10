"use client";

import { ArrowDownLeft, ArrowUpRight, CalendarClock, Landmark, PiggyBank, Receipt, Wallet } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Money } from "@/components/money";
import { cn } from "@/lib/cn";
import { addMonths, formatDate, formatMonthLong, monthKey, relativeDays, startOfMonth } from "@/lib/dates";
import { classify, isOpening } from "@/lib/engine/ledger";
import { agenda } from "@/lib/engine/life";
import { monthMetrics } from "@/lib/engine/metrics";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useUI } from "@/lib/ui";

type Period = "this" | "next" | "all";
type Stat = { label: string; value: number; icon: typeof Wallet; note?: ReactNode; tone?: "in" | "out" | "auto"; strong?: boolean };
type Row = { key: string; title: string; date: string; amount?: number; overdue: boolean; open: () => void };

/** One card, three views: this month, next month and all time. */
export function PeriodSummary() {
  const { ds, today, ctx, positions, month } = useFinance();
  const [period, setPeriod] = useState<Period>("this");

  const nextStart = addMonths(startOfMonth(today), 1);
  const next = useMemo(() => (period === "next" ? monthMetrics(ds, positions, today, undefined, nextStart) : null), [period, ds, positions, today, nextStart]);

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
  if (period === "this") {
    caption = formatMonthLong(monthKey(today));
    stats = [
      { label: "Money in", value: month.incomeTotal, icon: ArrowDownLeft, tone: "in", note: month.incomeExpected > 0 ? `${formatMoney(month.incomeExpected, ctx)} still to come` : "All received" },
      { label: "Spent", value: month.spentThisMonth, icon: ArrowUpRight },
      { label: "Bills & EMIs", value: month.committedTotal, icon: Receipt, note: month.unpaidAmount > 0 ? `${formatMoney(month.unpaidAmount, ctx)} still to pay` : "All paid" },
      { label: "Safe to spend", value: month.spendable, icon: Wallet, tone: "auto", strong: true, note: "After bills, budgets and reserves" },
    ];
    const ag = agenda(ds.life_items, today);
    rows = [
      ...month.unpaid.map((e) => ({ key: "e:" + e.key, title: e.title, date: e.date, amount: e.remaining, overdue: e.date < today, open: () => useUI.getState().openEvent(e.key) })),
      ...[...ag.overdue, ...ag.today, ...ag.upcoming].map((t) => ({ key: "t:" + t.id, title: t.title, date: t.due_date!, overdue: t.due_date! < today, open: () => useUI.getState().openLife(t.kind, t.id) })),
    ]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 5);
    listTitle = "Coming up";
  } else if (period === "next" && next) {
    caption = formatMonthLong(monthKey(nextStart)) + " · planned";
    stats = [
      { label: "Money in", value: next.incomeTotal, icon: ArrowDownLeft, tone: "in", note: "Expected income" },
      { label: "Bills & EMIs", value: next.committedTotal, icon: Receipt, note: `${next.committedItems.length} payments` },
      { label: "Budgets", value: next.budgetLimit, icon: PiggyBank, note: "Planned spending" },
      { label: "Left to spend", value: next.spendable, icon: Wallet, tone: "auto", strong: true, note: "Estimate" },
    ];
    rows = [...next.committedItems]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 5)
      .map((e) => ({ key: e.key, title: e.title, date: e.date, amount: e.remaining || e.amount, overdue: false, open: () => useUI.getState().openEvent(e.key) }));
    listTitle = "Due next month";
  } else if (period === "all" && allTime) {
    caption = allTime.first ? `Since ${formatDate(allTime.first)}` : "Nothing recorded yet";
    stats = [
      { label: "Earned", value: allTime.earned, icon: ArrowDownLeft, tone: "in" },
      { label: "Spent", value: allTime.spent, icon: ArrowUpRight },
      { label: "Invested", value: allTime.invested, icon: PiggyBank },
      { label: "Debt repaid", value: allTime.debtPaid, icon: Landmark },
    ];
  }

  const tabs: { id: Period; label: string }[] = [
    { id: "this", label: "This month" },
    { id: "next", label: "Next month" },
    { id: "all", label: "All time" },
  ];

  return (
    <section aria-label="Money by period" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Period" className="inline-flex rounded-xl bg-surface-3 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={period === t.id}
              onClick={() => setPeriod(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
                period === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-3">{caption}</p>
      </div>

      <div key={period} className="animate-fade">
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className={cn("rounded-xl p-3", s.strong ? "bg-ink text-paper" : "bg-surface-3/60")}>
              <p className={cn("flex items-center gap-1.5 text-[12.5px]", s.strong ? "opacity-70" : "text-ink-3")}>
                <s.icon className="h-3.5 w-3.5" aria-hidden />
                {s.label}
              </p>
              <Money value={s.value} tone={s.strong ? undefined : s.tone === "auto" ? "auto" : undefined} className="display mt-1 block text-[20px] font-semibold leading-tight sm:text-[22px]" />
              {s.note && <p className={cn("mt-0.5 text-[11.5px]", s.strong ? "opacity-60" : "text-ink-3")}>{s.note}</p>}
            </div>
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
