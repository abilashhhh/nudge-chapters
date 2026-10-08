"use client";

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CreditCard, Landmark, LineChart, PiggyBank, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate, parseISO, relativeDays } from "@/lib/dates";
import { TX_TYPE_LABEL } from "@/lib/engine/defaults";
import type { FinEvent } from "@/lib/engine/events";
import { classify } from "@/lib/engine/ledger";
import { useFinance } from "@/lib/finance";
import { useUI } from "@/lib/ui";
import type { Transaction } from "@/lib/types";
import { Money } from "./money";
import { StatusPill } from "./ui/misc";

const KIND_ICON: Record<string, LucideIcon> = {
  income: ArrowDownLeft,
  expense: ArrowUpRight,
  transfer: ArrowLeftRight,
  card_spend: CreditCard,
  card_bill: CreditCard,
  card_statement: CreditCard,
  emi: Landmark,
  sip: LineChart,
  chit: PiggyBank,
  chit_payout: PiggyBank,
  lend_due: Users,
  borrow_due: Users,
};

export function DateChip({ date, className }: { date: string; className?: string }) {
  const d = parseISO(date);
  return (
    <div className={cn("flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-surface-3 leading-none", className)} aria-hidden>
      <span className="num text-[15px] font-semibold text-ink">{d.getUTCDate()}</span>
      <span className="mt-0.5 text-[10.5px] text-ink-3">{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}</span>
    </div>
  );
}

export function EventRow({ e, showStatus = true, compact }: { e: FinEvent; showStatus?: boolean; compact?: boolean }) {
  const { ds, today } = useFinance();
  const Icon = KIND_ICON[e.kind] ?? ArrowUpRight;
  const where = e.cardId ? ds.credit_cards.find((c) => c.id === e.cardId)?.name : e.accountId ? ds.accounts.find((a) => a.id === e.accountId)?.name : null;
  const settled = ["paid", "received", "adjusted", "skipped", "cancelled"].includes(e.status);
  const value = settled ? e.paid || e.amount : e.remaining || e.amount;
  return (
    <button
      type="button"
      onClick={() => useUI.getState().openEvent(e.key)}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2 sm:px-3"
    >
      <DateChip date={e.date} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-[14.5px] font-medium text-ink">
          <Icon className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
          <span className="truncate">{e.title}</span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
          {!compact && showStatus && <StatusPill status={e.status} flowIn={e.flow === "in"} />}
          <span>{relativeDays(today, e.date)}</span>
          {where && <span className="truncate">· {where}</span>}
        </p>
      </div>
      <div className="text-right">
        <Money
          value={e.flow === "in" ? value : -value}
          projected={!settled && e.estimated}
          className={cn("text-[15px] font-semibold", e.flow === "in" ? "text-ok" : "text-ink", settled && e.status !== "adjusted" && e.status !== "paid" && e.status !== "received" && "text-ink-3 line-through")}
          sign={e.flow === "in"}
        />
        {compact && showStatus && (
          <div className="mt-0.5">
            <StatusPill status={e.status} flowIn={e.flow === "in"} />
          </div>
        )}
      </div>
    </button>
  );
}

export function txSigned(t: Transaction, accountId?: string): number {
  if (accountId) {
    if (t.type === "transfer") return t.to_account_id === accountId ? t.amount : -t.amount;
  }
  const c = classify(t);
  if (c.income) return t.amount;
  if (t.type === "adjustment") return t.amount;
  if (["lend_repayment", "borrow", "invest_sell", "chit_payout"].includes(t.type)) return t.amount;
  if (t.type === "transfer") return 0;
  return -t.amount;
}

export function TxRow({ t, accountId }: { t: Transaction; accountId?: string }) {
  const { ds } = useFinance();
  const signed = txSigned(t, accountId);
  const where =
    t.type === "transfer"
      ? `${ds.accounts.find((a) => a.id === t.account_id)?.name ?? "?"} → ${ds.accounts.find((a) => a.id === t.to_account_id)?.name ?? "?"}`
      : t.card_id
        ? ds.credit_cards.find((c) => c.id === t.card_id)?.name
        : ds.accounts.find((a) => a.id === t.account_id)?.name;
  return (
    <button type="button" onClick={() => useUI.getState().openTx(null, t)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2 sm:px-3">
      <DateChip date={t.date} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-medium text-ink">{t.description || t.category || TX_TYPE_LABEL[t.type]}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-ink-3">
          {t.type !== "expense" && t.type !== "income" ? `${TX_TYPE_LABEL[t.type]} · ` : t.category ? `${t.category} · ` : ""}
          {where}
          {t.tags?.includes("imported") ? " · imported" : ""}
        </p>
      </div>
      {t.type === "transfer" && !accountId ? (
        <Money value={t.amount} className="text-[15px] font-semibold text-ink-2" />
      ) : (
        <Money value={signed} sign className={cn("text-[15px] font-semibold", signed > 0 ? "text-ok" : signed === 0 ? "text-ink-3" : "text-ink")} />
      )}
    </button>
  );
}

export function formatEventDate(e: FinEvent) {
  return formatDate(e.date, "short");
}
