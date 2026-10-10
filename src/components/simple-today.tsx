"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { formatDate } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { useUI } from "@/lib/ui";
import { MoneyInOnePlace } from "./money-in-one-place";
import { PeriodSummary } from "./period-summary";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** The calm home page: where you stand, this month / next month / all time, everything you have and owe, and your chapters. */
export function SimpleToday() {
  const { ds, today, positions, goals } = useFinance();
  const name = ds.profile.name?.split(" ")[0];
  const chapters = goals
    .filter((g) => g.goal.kind !== "retirement" && g.status !== "done")
    .sort((a, b) => a.goal.priority - b.goal.priority)
    .slice(0, 3);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="text-[13px] text-ink-3">{formatDate(today, "long")}</p>
          <h1 className="display text-[28px] font-semibold leading-tight sm:text-[32px]">
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[12.5px] text-ink-3">Net worth today</p>
          <Money value={positions.totals.netWorth} className="display block text-[30px] font-semibold leading-tight sm:text-[34px]" />
        </div>
      </div>

      <PeriodSummary />

      <MoneyInOnePlace />

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
    </div>
  );
}
