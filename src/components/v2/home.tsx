"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Lightbulb, TrendingDown, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { addDays, addMonths, endOfMonth, formatDate, formatMonthLong, monthKey, startOfMonth } from "@/lib/dates";
import { isPending, type FinEvent } from "@/lib/engine/events";
import { oneThing } from "@/lib/engine/life";
import { isCommitment } from "@/lib/engine/metrics";
import { useFinance, useMonthMetrics } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { hrefForV2 } from "@/lib/v2/routes";
import { useExplain } from "../explain";
import { Money } from "../money";
import { useMonth, useSelectedMonth } from "../ui/month-picker";
import { ChipGroup, StatTile, StatusText, greeting } from "./ui";
import type { CellStatus } from "@/lib/v2/grids";

export const V2_TYPE_LABEL: Record<FinEvent["kind"], string> = {
  income: "Income",
  expense: "Bill",
  transfer: "Move money",
  card_spend: "Card spend",
  card_bill: "Card bill",
  card_statement: "Card bill",
  emi: "EMI",
  sip: "SIP",
  chit: "Chit",
  chit_payout: "Chit amount",
  lend_due: "Money back",
  borrow_due: "Pay back",
};

/** Plain words for the lines that make up "Free to spend". */
const LINE_WORDS: Record<string, string> = {
  "Cash in your accounts": "Money in bank",
  "Bills and commitments still to pay": "Still to pay this month (bills, EMIs, card bills, chits, SIPs)",
  "Repayments expected from people you paid for": "Money people will pay you back this month",
  "Remaining spending budgets": "Budgets left this month",
  "Set aside in reserves": "Money set aside",
};

function rowStatus(e: FinEvent, today: string): CellStatus {
  if (e.status === "overdue" || (e.date < today && isPending(e))) return "late";
  if (e.status === "partial") return "partial";
  if (e.date <= addDays(today, 7)) return "due";
  return "upcoming";
}

export function V2Home() {
  const f = useFinance();
  const { ds, today, positions, events, nudges, ctx } = f;
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
  const savings = positions.totals.investments + positions.totals.physical + positions.totals.chitAssets;

  const prevSnap = useMemo(
    () => [...ds.net_worth_snapshots].filter((s) => s.date <= addDays(cur, -1)).sort((a, b) => (a.date < b.date ? 1 : -1))[0],
    [ds.net_worth_snapshots, cur],
  );
  const change = prevSnap ? positions.totals.netWorth - prevSnap.net_worth : null;

  // Upcoming payments, month by month: this month (late ones on top) and next month.
  const [upMonth, setUpMonth] = useState<"this" | "next">("this");
  const byMonth = useMemo(() => {
    const thisEnd = endOfMonth(today);
    const nextStart = addDays(thisEnd, 1);
    const nextEnd = endOfMonth(nextStart);
    const pending = events.filter((e) => isCommitment(e) && isPending(e));
    const order = (a: FinEvent, b: FinEvent) => {
      const la = rowStatus(a, today) === "late" ? 0 : 1;
      const lb = rowStatus(b, today) === "late" ? 0 : 1;
      return la - lb || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    };
    return {
      this: pending.filter((e) => e.date <= thisEnd).sort(order),
      next: pending.filter((e) => e.date >= nextStart && e.date <= nextEnd).sort(order),
      thisKey: monthKey(today),
      nextKey: monthKey(nextStart),
    };
  }, [events, today]);
  const upcoming = byMonth[upMonth];
  const upTotal = upcoming.reduce((s2, e) => s2 + e.remaining, 0);

  const dismissed = ds.profile.preferences?.dismissedAlerts ?? {};
  const tip = oneThing(nudges.filter((n) => !dismissed[`tip:${n.key}`]));
  const isCurrent = month.period === "current";
  const freeLabel = month.period === "past" ? `Spent in ${formatMonthLong(monthKey(sel))}` : isCurrent ? "Free to spend this month" : `Free to spend in ${formatMonthLong(monthKey(sel))}`;

  const acctName = (id?: string | null) => (id ? ds.accounts.find((a) => a.id === id)?.name : null);
  // A card bill is paid from a bank account (the card's usual one); other card items are billed on the card.
  const where = (e: FinEvent) =>
    e.kind === "card_bill"
      ? acctName(ds.credit_cards.find((c) => c.id === e.cardId)?.payment_account_id)
      : e.cardId
        ? `${ds.credit_cards.find((c) => c.id === e.cardId)?.name ?? "Card"} (card)`
        : acctName(e.accountId);
  // Tips come from Version 1, which calls goals "chapters".
  const plain = (t?: string) => t?.replace(/chapters/g, "goals").replace(/Chapters/g, "Goals").replace(/chapter/g, "goal").replace(/Chapter/g, "Goal");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      {/* 1 · Greeting + month */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-[26px] font-semibold leading-tight sm:text-[30px]">
            {greeting()}
            {name ? `, ${name}` : ""}
          </h1>
          <p className="text-[13.5px] text-ink-2">Your money at a glance</p>
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

      {/* 2 · Four tiles */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile label="Money in bank" value={positions.totals.cash} href="/my-money" />
        <StatTile label="People owe me" value={positions.totals.receivables} href="/my-money?tab=owed" />
        <StatTile
          label={isCurrent ? "To pay this month" : `To pay in ${formatMonthLong(monthKey(sel)).split(" ")[0]}`}
          value={month.period === "past" ? month.committedPaid : month.unpaidAmount}
          projected={month.period === "future"}
          note={month.overdue.length ? `${month.overdue.length} late` : `${month.unpaid.length} payment${month.unpaid.length === 1 ? "" : "s"}`}
          href="/to-pay"
        />
        <StatTile label="Savings value" value={savings} href="/savings" />
      </div>

      {/* 3 · Free to spend + 4 · Total worth */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <button
          type="button"
          onClick={() =>
            explain({
              title: freeLabel,
              intro: "Money in bank, minus what you still have to pay this month and what's left in your budgets.",
              lines: month.spendableLines.map((l) => ({ label: LINE_WORDS[l.label] ?? l.label, amount: l.amount, projected: month.period === "future" })),
              total: { label: "Free to spend", amount: month.spendable, projected: month.period === "future" },
            })
          }
          className="rounded-3xl bg-ink p-5 text-left text-paper transition-opacity hover:opacity-95 sm:p-6"
        >
          <span className="block text-[13.5px] opacity-75">{freeLabel}</span>
          <Money
            value={month.period === "past" ? month.spentThisMonth : month.spendable}
            projected={month.period === "future"}
            className={cn("display mt-1 block text-[40px] font-semibold leading-none sm:text-[52px]", month.period !== "future" && "text-inherit", month.spendable < 0 && month.period !== "past" && "text-[#ff8a80]")}
          />
          <span className="mt-2 inline-flex items-center gap-1 text-[12.5px] opacity-75">
            Tap to see how it&apos;s worked out <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </button>
        <Link href="/menu/future" className="flex flex-col justify-between rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-line-strong sm:p-6">
          <span className="text-[13.5px] text-ink-3">Total worth</span>
          <Money value={positions.totals.netWorth} className="display mt-1 block text-[30px] font-semibold leading-tight" tone="auto" />
          <span className="text-[12px] text-ink-3">What you have − what you owe</span>
          {change != null && Math.abs(change) >= 1 && (
            <span className={cn("mt-2 inline-flex items-center gap-1 text-[13px] font-medium", change >= 0 ? "text-ok" : "text-danger")}>
              {change >= 0 ? <TrendingUp className="h-4 w-4" aria-hidden /> : <TrendingDown className="h-4 w-4" aria-hidden />}
              {change >= 0 ? "Up" : "Down"} {formatMoney(Math.abs(change), ctx)} since last month
            </span>
          )}
        </Link>
      </div>

      {/* 5 · Upcoming payments, this month and next */}
      <section aria-labelledby="v2-upcoming" className="rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
          <h2 id="v2-upcoming" className="text-[16px] font-semibold">
            Upcoming payments
          </h2>
          <ChipGroup
            label="Month"
            value={upMonth}
            onChange={setUpMonth}
            options={[
              { id: "this", label: `${formatMonthLong(byMonth.thisKey).split(" ")[0]} · ${byMonth.this.length}` },
              { id: "next", label: `${formatMonthLong(byMonth.nextKey).split(" ")[0]} · ${byMonth.next.length}` },
            ]}
          />
        </div>
        <p className="px-4 pt-1 text-[12.5px] text-ink-3 sm:px-5">
          {upMonth === "this" ? "Still to pay this month" : "To pay next month"}: <Money value={upTotal} className="font-semibold text-ink" projected={upcoming.some((e) => e.estimated)} />
        </p>
        {upcoming.length === 0 ? (
          <p className="px-4 py-5 text-[14px] text-ink-2 sm:px-5">Nothing left to pay {upMonth === "this" ? "this month" : "next month"}.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line/70 border-t border-line">
            {upcoming.slice(0, 10).map((e) => (
              <li key={e.key}>
                <button type="button" onClick={() => useUI.getState().openEvent(e.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 sm:px-5">
                  <span className="num w-12 shrink-0 text-[13px] text-ink-2">{formatDate(e.date, "short")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{e.title.replace(/^(EMI|SIP|Chit) · /, "")}</span>
                    <span className="block text-[12px] text-ink-3">{V2_TYPE_LABEL[e.kind]}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Money value={e.remaining} decimals projected={e.estimated} className="block text-[14px] font-semibold" />
                    <StatusText status={rowStatus(e, today)} className="text-[11.5px]" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 sm:px-5">
          <span className="text-[12.5px] text-ink-3">{upcoming.length > 10 ? `${upcoming.length - 10} more` : "Tap one to mark it paid"}</span>
          <Link href="/to-pay" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-ink-2 hover:text-ink">
            See all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </section>

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
