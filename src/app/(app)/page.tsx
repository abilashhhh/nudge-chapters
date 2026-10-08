"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { NudgeCard, TaskRow } from "@/components/life";
import { BmcButton } from "@/components/support";
import { BMC_URL } from "@/lib/config";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { formatDate } from "@/lib/dates";
import { agenda, oneThing } from "@/lib/engine/life";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Today: what's happening, what needs attention, and the one thing worth doing next. */
export default function TodayPage() {
  const { ds, today, ctx, positions, month, goals, nudges } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("add") === "expense") useUI.getState().openTx({ type: "expense" });
  }, []);

  const ag = useMemo(() => agenda(ds.life_items, today), [ds.life_items, today]);
  const spent = useMemo(
    () =>
      ds.transactions
        .filter((t) => t.date >= today.slice(0, 8) + "01" && t.date <= today && (t.type === "expense" || t.type === "card_spend"))
        .reduce((s, t) => s + t.amount, 0),
    [ds.transactions, today],
  );
  const chapters = goals.filter((g) => g.goal.kind !== "retirement" && g.status !== "done").sort((a, b) => a.goal.priority - b.goal.priority).slice(0, 4);
  const consider = oneThing(nudges);
  const list = nudges.filter((n) => n !== consider).slice(0, 5);
  const tasks = [...ag.overdue, ...ag.today, ...ag.upcoming].slice(0, 6);
  const dismiss = (key: string) => updatePrefs({ dismissedAlerts: { ...(ds.profile.preferences?.dismissedAlerts ?? {}), [key]: today } });
  const name = ds.profile.name?.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[13px] text-ink-3">{formatDate(today, "long")}</p>
        <h1 className="display text-[28px] font-semibold leading-tight sm:text-[32px]">
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
      </div>

      {consider && (
        <section aria-labelledby="consider" className="rounded-3xl bg-ink p-5 text-paper sm:p-6">
          <h2 id="consider" className="text-[13px] font-medium opacity-70">
            One thing to consider
          </h2>
          <p className="display mt-1 text-[22px] font-semibold leading-snug sm:text-[24px]">{consider.title}</p>
          <p className="mt-1 max-w-2xl text-[14px] opacity-80">{consider.reason}</p>
          {consider.impact && <p className="mt-1 text-[13px] opacity-70">{consider.impact}</p>}
          <p className="mt-2 text-[11.5px] opacity-60">
            {consider.estimate ? "Estimate · " : ""}From: {consider.source}
          </p>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="money" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 id="money" className="text-[15px] font-semibold">
              Money
            </h2>
            <Link href="/money" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
              Overview <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[12.5px] text-ink-3">Available now</p>
              <Money value={positions.totals.cash} className="display block text-[24px] font-semibold" />
            </div>
            <div>
              <p className="text-[12.5px] text-ink-3">Spent this month</p>
              <Money value={spent} className="display block text-[24px] font-semibold" />
            </div>
            <div>
              <p className="text-[12.5px] text-ink-3">Safe to spend this month</p>
              <Money value={month.spendable} className="block text-[16px] font-semibold" tone="auto" />
            </div>
            <div>
              <p className="text-[12.5px] text-ink-3">Bills still to pay</p>
              <p className="num text-[16px] font-semibold">
                {formatMoney(month.unpaidAmount, ctx)} <span className="text-[12.5px] font-normal text-ink-3">· {month.unpaid.length}</span>
              </p>
            </div>
          </div>
        </section>

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
            <div className="mt-3 text-[14px] text-ink-2">
              <p>A chapter is something you're working towards — a trip, a bike, an emergency fund.</p>
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
                  <p className="num mt-0.5 text-[12px] text-ink-3">
                    {formatMoney(g.gap, ctx)} to go{g.goal.target_date ? ` · by ${formatDate(g.goal.target_date)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-labelledby="nudges">
          <h2 id="nudges" className="mb-2 text-[15px] font-semibold">
            Nudges
          </h2>
          {list.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[14px] text-ink-2">Nothing needs your attention right now.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {list.map((n) => (
                <NudgeCard key={n.key} n={n} onDismiss={() => dismiss(n.key)} />
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="tasks" className="rounded-2xl border border-line bg-surface p-3 sm:p-4">
          <div className="flex items-center justify-between px-2">
            <h2 id="tasks" className="text-[15px] font-semibold">
              Tasks
            </h2>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openLife("task")}>
                Task
              </Button>
              <Link href="/plan" className="inline-flex items-center gap-1 px-2 text-[13px] font-medium text-ink-2 hover:text-ink">
                Plan <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
          {tasks.length === 0 ? (
            <p className="px-2 py-3 text-[14px] text-ink-2">Nothing due this week.</p>
          ) : (
            <div className="mt-1">
              {tasks.map((t) => (
                <TaskRow key={t.id} item={t} />
              ))}
            </div>
          )}
        </section>
      </div>

      {BMC_URL && (
        <section aria-labelledby="support" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 id="support" className="text-[15px] font-semibold">
              Enjoying Nudge Chapters?
            </h2>
            <p className="mt-0.5 text-[13.5px] text-ink-2">It&apos;s free with no ads. If it helps you, a coffee keeps it going.</p>
          </div>
          <BmcButton className="shrink-0" />
        </section>
      )}
    </div>
  );
}
