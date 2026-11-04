"use client";

import { ChevronLeft, ChevronRight, Lightbulb, TrendingDown, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addDays, addMonths, endOfMonth, formatDate, formatMonthLong, monthKey, startOfMonth } from "@/lib/dates";
import { buildEvents, isPending } from "@/lib/engine/events";
import { computePositions } from "@/lib/engine/ledger";
import { project } from "@/lib/engine/projection";
import { oneThing } from "@/lib/engine/life";
import { useFinance, useMonthMetrics } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { hrefForV2 } from "@/lib/v2/routes";
import { useExplain } from "../explain";
import { Money } from "../money";
import { useMonth, useSelectedMonth } from "../ui/month-picker";
import { MoneyInOut } from "./money-in-out";
import { SmsBanner } from "./sms";
import { greeting } from "./ui";
import { UpcomingPayments } from "./upcoming";

/** Plain words for the lines that make up "Free to spend". */
const LINE_WORDS: Record<string, string> = {
  "Cash in your accounts": "Money in bank",
  "Bills and commitments still to pay": "Still to pay this month (bills, EMIs, card bills, chits, SIPs)",
  "Repayments expected from people you paid for": "Money people will pay you back this month",
  "Remaining spending budgets": "Budgets left this month",
  "Set aside in reserves": "Money set aside",
};

/** One of Home's four main numbers. */
function BigTile({ label, note, href, onClick, dark, children }: { label: ReactNode; note?: ReactNode; href?: string; onClick?: () => void; dark?: boolean; children: ReactNode }) {
  const cls = cn(
    "flex min-w-0 flex-col rounded-2xl border p-4 text-left transition-colors sm:p-5",
    dark ? "border-transparent bg-inverse text-on-inverse hover:opacity-95" : "border-line bg-surface hover:border-line-strong",
  );
  const body = (
    <>
      <span className={cn("block truncate text-[12.5px] sm:text-[13px]", dark ? "opacity-75" : "text-ink-3")}>{label}</span>
      <span className="display mt-1 block truncate text-[22px] font-semibold leading-tight sm:text-[28px]">{children}</span>
      {note && <span className={cn("mt-1 block truncate text-[12px]", dark ? "opacity-70" : "text-ink-3")}>{note}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export function V2Home() {
  const f = useFinance();
  const { ds, today, positions: nowPositions, nudges, ctx, assumptions } = f;
  const month = useMonthMetrics();
  const sel = useSelectedMonth(today);
  const setMonth = useMonth((s) => s.set);
  const explain = useExplain((s) => s.show);
  const updatePrefs = useStore((s) => s.updatePrefs);
  const router = useRouter();
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("add") === "expense") useUI.getState().openTx({ type: "expense" });
  }, []);

  const cur = startOfMonth(today);
  const go = (n: number) => {
    const next = addMonths(sel, n);
    setMonth(next === cur ? null : next);
  };
  const name = ds.profile.name?.split(" ")[0];
  const period: "past" | "current" | "future" = sel < cur ? "past" : sel > cur ? "future" : "current";
  const selEnd = endOfMonth(sel);

  // Everything on Home follows the month you pick: balances at the end of a past month, or what they're
  // expected to be by the end of a future one.
  const snap = useMemo(() => {
    const t = nowPositions.totals;
    if (period === "current") return { cash: t.cash, receivables: t.receivables, savings: t.investments + t.physical + t.chitAssets, netWorth: t.netWorth };
    if (period === "past") {
      const p = computePositions(ds, selEnd).totals;
      return { cash: p.cash, receivables: p.receivables, savings: p.investments + p.physical + p.chitAssets, netWorth: p.netWorth };
    }
    // Today's figures plus the change the forecast expects, so future months line up with today's numbers.
    const pr = project(ds, { today, to: selEnd, positions: nowPositions, assumptions, scenario: "base" });
    const d = (k: "cash" | "investments" | "otherAssets" | "netWorth") => pr.end[k] - pr.start[k];
    const due = buildEvents(ds, { from: today, to: selEnd, today, positions: nowPositions, scenario: assumptions.scenarios.base })
      .filter((e) => e.lendingId && e.flow === "in" && isPending(e))
      .reduce((a, e) => a + e.remaining, 0);
    const receivables = Math.max(0, t.receivables - due);
    const nowSavings = t.investments + t.physical + t.chitAssets;
    return {
      cash: t.cash + d("cash"),
      receivables,
      savings: Math.max(0, nowSavings + d("investments") + d("otherAssets") + (t.receivables - receivables)),
      netWorth: t.netWorth + d("netWorth"),
    };
  }, [ds, nowPositions, period, selEnd, today, assumptions]);
  const savings = snap.savings;
  const est = period === "future";
  const when = period === "past" ? ` on ${formatDate(selEnd, "short")}` : period === "future" ? ` by ${formatDate(selEnd, "short")}` : "";

  const prevSnap = useMemo(
    () => [...ds.net_worth_snapshots].filter((s) => s.date <= addDays(sel, -1)).sort((a, b) => (a.date < b.date ? 1 : -1))[0],
    [ds.net_worth_snapshots, sel],
  );
  const change = prevSnap && period !== "future" ? snap.netWorth - prevSnap.net_worth : null;

  const dismissed = ds.profile.preferences?.dismissedAlerts ?? {};
  const tip = oneThing(nudges.filter((n) => !dismissed[`tip:${n.key}`]));
  const isCurrent = month.period === "current";
  const freeLabel = month.period === "past" ? `Spent in ${formatMonthLong(monthKey(sel))}` : isCurrent ? "Free to spend this month" : `Free to spend in ${formatMonthLong(monthKey(sel))}`;

  // Tips come from Version 1, which calls goals "chapters".
  const plain = (t?: string) => t?.replace(/chapters/g, "goals").replace(/Chapters/g, "Goals").replace(/chapter/g, "goal").replace(/Chapter/g, "Goal");

  return (
    <div className="flex flex-col gap-5">
      {/* 1 · Greeting + month */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-[26px] font-semibold leading-tight sm:text-[30px]">
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
        </div>
        <div className="flex items-center rounded-xl border border-line bg-surface">
          <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="inline-flex h-10 w-10 items-center justify-center rounded-l-xl text-ink-2 hover:bg-surface-3">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setMonth(null)} className="min-w-[8.5rem] px-1 text-center text-[14px] font-semibold" aria-live="polite" title="Back to this month">
            {formatMonthLong(monthKey(sel))}
          </button>
          <button type="button" aria-label="Next month" onClick={() => go(1)} className="inline-flex h-10 w-10 items-center justify-center rounded-r-xl text-ink-2 hover:bg-surface-3">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <SmsBanner />

      {/* 2 · The four numbers that matter, in order: money in bank, to pay, free to spend, total worth */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <BigTile label={`Money in bank${when}`} href="/my-money">
          <Money value={snap.cash} projected={est} className="text-inherit" />
        </BigTile>
        <BigTile
          label={isCurrent ? "To pay this month" : `To pay in ${formatMonthLong(monthKey(sel)).split(" ")[0]}`}
          href="/to-pay"
          note={
            month.overdue.length ? (
              <span className="text-danger">{month.overdue.length} late</span>
            ) : (
              `${month.unpaid.length} payment${month.unpaid.length === 1 ? "" : "s"}`
            )
          }
        >
          <Money value={month.period === "past" ? month.committedPaid : month.unpaidAmount} projected={month.period === "future"} className="text-inherit" />
        </BigTile>
        <BigTile
          dark
          label={freeLabel}
          note="How it's worked out"
          onClick={() =>
            explain({
              title: freeLabel,
              intro: "Money in bank, minus what you still have to pay this month and what's left in your budgets.",
              lines: month.spendableLines.map((l) => ({ label: LINE_WORDS[l.label] ?? l.label, amount: l.amount, projected: month.period === "future" })),
              total: { label: "Free to spend", amount: month.spendable, projected: month.period === "future" },
            })
          }
        >
          <Money
            value={month.period === "past" ? month.spentThisMonth : month.spendable}
            projected={month.period === "future"}
            className={cn("text-inherit", month.spendable < 0 && month.period !== "past" && "text-[#ff8a80]")}
          />
        </BigTile>
        <BigTile
          label={`Total worth${when}`}
          href="/menu/future"
          note={
            change != null && Math.abs(change) >= 1 ? (
              <span className={cn("inline-flex items-center gap-1", change >= 0 ? "text-ok" : "text-danger")}>
                {change >= 0 ? <TrendingUp className="h-3.5 w-3.5" aria-hidden /> : <TrendingDown className="h-3.5 w-3.5" aria-hidden />}
                {formatMoney(Math.abs(change), ctx)} vs last month
              </span>
            ) : (
              "What you have − what you owe"
            )
          }
        >
          <Money value={snap.netWorth} projected={est} className="text-inherit" tone="auto" />
        </BigTile>
      </div>
      <div className="-mt-2 flex flex-wrap gap-x-5 gap-y-1 px-1 text-[13px] text-ink-3">
        <Link href="/my-money?tab=owed" className="hover:text-ink">
          People owe me <Money value={snap.receivables} projected={est} className="font-semibold text-ink-2" />
        </Link>
        <Link href="/my-money" className="hover:text-ink">
          Savings <Money value={savings} projected={est} className="font-semibold text-ink-2" />
        </Link>
      </div>

      {/* 5 · Upcoming payments, this month and next */}
      <UpcomingPayments month={sel} />

      <MoneyInOut month={monthKey(sel)} />

      {/* 6 · One tip */}
      {tip && (
        <section aria-label="Tip" className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium uppercase tracking-wide text-ink-3">Tip</p>
            <p className="text-[14.5px] font-semibold">{plain(tip.title)}</p>
            <p className="text-[13.5px] text-ink-2">{plain(tip.reason)}</p>
            {tip.cta && (
              <button
                type="button"
                className="mt-1 text-[13.5px] font-medium text-brand hover:underline"
                onClick={() => {
                  if (tip.cta?.eventKey) useUI.getState().openEvent(tip.cta.eventKey);
                  else if (tip.cta?.itemId) {
                    const it = ds.life_items.find((i) => i.id === tip.cta?.itemId);
                    if (it) useUI.getState().openLife(it.kind, it.id);
                  } else if (tip.cta?.href) router.push(hrefForV2(tip.cta.href));
                }}
              >
                {plain(tip.cta.label)}
              </button>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss tip"
            onClick={() => updatePrefs({ dismissedAlerts: { ...dismissed, [`tip:${tip.key}`]: today } })}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </section>
      )}
    </div>
  );
}
