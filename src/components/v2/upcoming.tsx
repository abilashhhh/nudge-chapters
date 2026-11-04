"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { addDays, addMonths, formatDate, formatMonthLong, monthKey, startOfMonth } from "@/lib/dates";
import { isPending, type FinEvent } from "@/lib/engine/events";
import { isCommitment } from "@/lib/engine/metrics";
import { useFinance } from "@/lib/finance";
import { useUI } from "@/lib/ui";
import type { CellStatus } from "@/lib/v2/grids";
import { Money } from "../money";
import { EventIcon } from "./entity-icon";
import { AMOUNT_CLS, ChipGroup, StatusText, useRangeEvents } from "./ui";

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

export function rowStatus(e: FinEvent, today: string): CellStatus {
  if (e.status === "skipped" || e.status === "cancelled") return "skipped";
  if (!isPending(e) && e.status !== "partial") return "paid";
  if (e.status === "overdue" || (e.date < today && isPending(e))) return "late";
  if (e.status === "partial") return "partial";
  if (e.date <= addDays(today, 7)) return "due";
  return "upcoming";
}

/**
 * Everything still to pay in a month and the next — bills, card bills, EMIs, chits, SIPs — late ones first.
 * The same list on Home and in To Pay. `only` narrows it (e.g. just bills).
 */
export function UpcomingPayments({ month, only, title = "Upcoming payments", seeAll = true, limit = 10 }: { month?: string; only?: (e: FinEvent) => boolean; title?: string; seeAll?: boolean; limit?: number }) {
  const { today } = useFinance();
  const sel = month ?? startOfMonth(today);
  const cur = startOfMonth(today);
  const period: "past" | "current" | "future" = sel < cur ? "past" : sel > cur ? "future" : "current";
  const selKey = monthKey(sel);
  const nextKey = monthKey(addMonths(sel, 1));
  const rangeEvents = useRangeEvents([selKey, nextKey]);
  const byMonth = useMemo(() => {
    const order = (a: FinEvent, b: FinEvent) => {
      const la = rowStatus(a, today) === "late" ? 0 : 1;
      const lb = rowStatus(b, today) === "late" ? 0 : 1;
      return la - lb || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    };
    const inMonth = (k: string, all: boolean) =>
      rangeEvents
        .filter((e) => isCommitment(e) && (!only || only(e)) && (all ? true : isPending(e)) && (monthKey(e.date) === k || (k === monthKey(today) && isPending(e) && e.date < startOfMonth(today))))
        .sort(order);
    return { this: inMonth(selKey, period === "past"), next: inMonth(nextKey, false) };
  }, [rangeEvents, today, selKey, nextKey, period, only]);
  // Once everything this month is paid, open on next month.
  const [pick, setPick] = useState<"this" | "next" | null>(null);
  const which = pick ?? (byMonth.this.length === 0 && byMonth.next.length > 0 && period !== "past" ? "next" : "this");
  const list = byMonth[which];
  const key = which === "this" ? selKey : nextKey;
  const total = list.reduce((s, e) => s + (period === "past" && which === "this" ? e.amount : e.remaining), 0);
  const name = (k: string) => formatMonthLong(k).split(" ")[0];

  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">{period === "past" && which === "this" ? "Payments" : title}</h2>
          <p className="text-[12.5px] text-ink-3">
            {period === "past" && which === "this" ? `Due in ${formatMonthLong(key)}` : `Still to pay in ${name(key)}`}: <Money value={total} className="font-semibold text-ink" projected={list.some((e) => e.estimated)} />
          </p>
        </div>
        <ChipGroup
          label="Month"
          value={which}
          onChange={setPick}
          options={[
            { id: "this", label: `${name(selKey)} · ${byMonth.this.length}` },
            { id: "next", label: `${name(nextKey)} · ${byMonth.next.length}` },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <p className="px-4 py-5 text-[14px] text-ink-2 sm:px-5">Nothing left to pay in {formatMonthLong(key)}.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line/70 border-t border-line">
          {list.slice(0, limit).map((e, i) => (
            <li key={`${e.key}:${i}`}>
              <button type="button" onClick={() => useUI.getState().openEvent(e.key)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 sm:px-5">
                <EventIcon e={e} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{e.title.replace(/^(EMI|SIP|Chit) · /, "")}</span>
                  <span className="block text-[12px] text-ink-3">
                    {formatDate(e.date, "short")} · {V2_TYPE_LABEL[e.kind]}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Money value={isPending(e) ? e.remaining : e.paid || e.amount} decimals projected={e.estimated && isPending(e)} className={cn("block text-[14px] font-semibold", AMOUNT_CLS[rowStatus(e, today)])} />
                  <StatusText status={rowStatus(e, today)} className="text-[11.5px]" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 sm:px-5">
        <span className="text-[12.5px] text-ink-3">{list.length > limit ? `${list.length - limit} more` : "Tap one to mark it paid"}</span>
        {seeAll && (
          <Link href="/to-pay" className="inline-flex items-center gap-1 text-[13.5px] font-medium text-ink-2 hover:text-ink">
            See all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}
