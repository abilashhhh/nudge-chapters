"use client";

import { ArrowRight, CalendarClock, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { formatDate, relativeDays } from "@/lib/dates";
import { agenda, oneThing } from "@/lib/engine/life";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useUI } from "@/lib/ui";
import { cn } from "@/lib/cn";
import { MoneyInOnePlace } from "./money-in-one-place";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

type Row = { key: string; title: string; date: string; amount?: number; overdue: boolean; open: () => void };

/** The calm home page: where you stand, everything you have and owe, what's coming up, and your chapters. Everything else lives in All sections. */
export function SimpleToday() {
  const { ds, today, ctx, positions, month, goals, nudges } = useFinance();
  const name = ds.profile.name?.split(" ")[0];
  const consider = oneThing(nudges);

  const coming = useMemo<Row[]>(() => {
    const bills: Row[] = month.unpaid.map((e) => ({
      key: "e:" + e.key,
      title: e.title,
      date: e.date,
      amount: e.remaining,
      overdue: e.date < today,
      open: () => useUI.getState().openEvent(e.key),
    }));
    const ag = agenda(ds.life_items, today);
    const tasks: Row[] = [...ag.overdue, ...ag.today, ...ag.upcoming].map((t) => ({
      key: "t:" + t.id,
      title: t.title,
      date: t.due_date!,
      overdue: t.due_date! < today,
      open: () => useUI.getState().openLife(t.kind, t.id),
    }));
    return [...bills, ...tasks].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, 4);
  }, [month.unpaid, ds.life_items, today]);

  const chapters = goals
    .filter((g) => g.goal.kind !== "retirement" && g.status !== "done")
    .sort((a, b) => a.goal.priority - b.goal.priority)
    .slice(0, 3);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <p className="text-[13px] text-ink-3">{formatDate(today, "long")}</p>
        <h1 className="display text-[28px] font-semibold leading-tight sm:text-[32px]">
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
      </div>

      {/* The headline: where you stand */}
      <section aria-labelledby="net" className="rounded-3xl bg-ink p-6 text-paper sm:p-7">
        <h2 id="net" className="text-[13.5px] font-medium opacity-70">
          Your net worth
        </h2>
        <Money value={positions.totals.netWorth} className="display mt-1 block text-[40px] font-semibold leading-none sm:text-[46px]" />
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-[13.5px]">
          <p>
            <span className="opacity-60">Safe to spend this month </span>
            <Money value={month.spendable} className="font-semibold" />
          </p>
          <p>
            <span className="opacity-60">Bills left </span>
            <span className="num font-semibold">{formatMoney(month.unpaidAmount, ctx)}</span>
          </p>
        </div>
      </section>

      <MoneyInOnePlace />

      {consider && (
        <p className="rounded-2xl bg-surface-3/70 px-4 py-3 text-[14px] text-ink-2">
          <span className="font-semibold text-ink">{consider.title}</span> — {consider.reason}
        </p>
      )}

      {/* Coming up */}
      <section aria-labelledby="coming" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 id="coming" className="text-[15px] font-semibold">
            Coming up
          </h2>
          <Link href="/calendar" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
            Calendar <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {coming.length === 0 ? (
          <p className="mt-2 text-[14px] text-ink-2">All clear — nothing due right now.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {coming.map((r) => (
              <li key={r.key}>
                <button type="button" onClick={r.open} className="flex w-full items-center gap-3 py-2.5 text-left">
                  <CalendarClock className={cn("h-4 w-4 shrink-0", r.overdue ? "text-danger" : "text-ink-3")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{r.title}</span>
                    <span className={cn("block text-[12.5px]", r.overdue ? "text-danger" : "text-ink-3")}>
                      {r.overdue ? "Overdue · " : ""}
                      {relativeDays(today, r.date)}
                    </span>
                  </span>
                  {r.amount != null && <Money value={r.amount} className="shrink-0 text-[14.5px] font-semibold" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Chapters */}
      <section aria-labelledby="chapters" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <h2 id="chapters" className="text-[15px] font-semibold">
            Your chapters
          </h2>
          <Link href="/goals" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
            All <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {chapters.length === 0 ? (
          <div className="mt-2 text-[14px] text-ink-2">
            <p>Something you&apos;re saving for — a trip, a bike, an emergency fund.</p>
            <Button size="sm" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("goal")}>
              Start a chapter
            </Button>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {chapters.map((g) => (
              <li key={g.goal.id}>
                <div className="flex items-baseline justify-between gap-2 text-[14px]">
                  <span className="truncate font-medium">{g.goal.name}</span>
                  <span className="num shrink-0 text-ink-2">{Math.round(g.progress * 100)}%</span>
                </div>
                <Progress className="mt-1" value={g.progress} tone={g.status === "off_track" ? "warn" : "brand"} label={`${g.goal.name} progress`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/more"
        className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong p-4 text-[14px] text-ink-2 transition-colors hover:border-ink-3 hover:text-ink"
      >
        <LayoutGrid className="h-5 w-5 text-brand" aria-hidden />
        <span className="flex-1">
          <span className="block font-semibold text-ink">All sections</span>
          Cash flow, budgets, assets, loans, future, reports and more
        </span>
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
