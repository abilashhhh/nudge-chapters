"use client";

import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate, formatMonthLong } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { formatMoney, toBase } from "@/lib/money";
import type { Transaction, TxType } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { Money } from "../money";
import { TxIcon } from "./entity-icon";
import { Button } from "../ui/button";

/** What counts as spending and as earning. Paying a card bill or moving money between accounts isn't either. */
const SPENT: TxType[] = ["expense", "card_spend"];
const EARNED: TxType[] = ["income"];

type Side = "spent" | "earned";

/** Home → "Spent & earned": everything you recorded as spending or income in the month, with totals. */
export function MoneyInOut({ month }: { month: string }) {
  const { ds, ctx } = useFinance();
  const [side, setSide] = useState<Side>("spent");
  const [all, setAll] = useState(false);
  const ui = useUI.getState();

  const data = useMemo(() => {
    // Moving your own money between your accounts, cards and wallets is neither spending nor earning.
    const inMonth = ds.transactions.filter((t) => t.date.startsWith(month) && !t.tags?.includes("self-transfer"));
    const amt = (t: Transaction) => {
      const acct = t.account_id ? ds.accounts.find((a) => a.id === t.account_id) : null;
      return toBase(t.amount, acct?.currency ?? ctx.currency, ctx);
    };
    const pick = (types: TxType[]) => inMonth.filter((t) => types.includes(t.type)).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const spent = pick(SPENT);
    const earned = pick(EARNED);
    const sum = (l: Transaction[]) => l.reduce((s, t) => s + amt(t), 0);
    const byCat = (l: Transaction[]) => {
      const m = new Map<string, number>();
      for (const t of l) m.set(t.category || "Other", (m.get(t.category || "Other") ?? 0) + amt(t));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return { spent, earned, spentTotal: sum(spent), earnedTotal: sum(earned), spentCats: byCat(spent), earnedCats: byCat(earned), amt };
  }, [ds.transactions, ds.accounts, month, ctx]);

  const list = side === "spent" ? data.spent : data.earned;
  const cats = side === "spent" ? data.spentCats : data.earnedCats;
  const shown = all ? list : list.slice(0, 8);
  const where = (t: Transaction) =>
    t.card_id ? ds.credit_cards.find((c) => c.id === t.card_id)?.name : t.account_id ? ds.accounts.find((a) => a.id === t.account_id)?.name : null;
  const net = data.earnedTotal - data.spentTotal;

  return (
    <section aria-labelledby="v2-inout" className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div>
          <h2 id="v2-inout" className="text-[16px] font-semibold">
            Spent &amp; earned
          </h2>
          <p className="text-[12.5px] text-ink-3">{formatMonthLong(month)} · what you&apos;ve recorded</p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => ui.openTx({ type: side === "spent" ? "expense" : "income" })}>
            Add
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 px-4 sm:px-5" role="radiogroup" aria-label="Show">
        {(
          [
            ["spent", "Spent", data.spentTotal, ArrowUpRight, "text-danger"],
            ["earned", "Earned", data.earnedTotal, ArrowDownLeft, "text-ok"],
          ] as const
        ).map(([id, label, total, Icon, tone]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={side === id}
            onClick={() => {
              setSide(id);
              setAll(false);
            }}
            className={cn("min-w-0 rounded-xl border p-3 text-left transition-colors", side === id ? "border-inverse bg-inverse text-on-inverse" : "border-line hover:border-line-strong")}
          >
            <span className={cn("flex items-center gap-1 text-[12px]", side === id ? "opacity-80" : "text-ink-3")}>
              <Icon className={cn("h-3.5 w-3.5", side !== id && tone)} aria-hidden />
              {label}
            </span>
            <Money value={total} className={cn("num mt-0.5 block truncate text-[17px] font-semibold sm:text-[19px]", side === id && "text-inherit")} />
          </button>
        ))}
        <div className="min-w-0 rounded-xl border border-line p-3">
          {data.earnedTotal > 0 ? (
            <>
              <span className="block text-[12px] text-ink-3">{net >= 0 ? "Left over" : "Overspent"}</span>
              <Money value={Math.abs(net)} className={cn("num mt-0.5 block truncate text-[17px] font-semibold sm:text-[19px]", net < 0 && "text-danger")} />
            </>
          ) : (
            <>
              <span className="block text-[12px] text-ink-3">Entries</span>
              <span className="num mt-0.5 block truncate text-[17px] font-semibold sm:text-[19px]">{data.spent.length + data.earned.length}</span>
            </>
          )}
        </div>
      </div>

      {cats.length > 0 && (
        <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto px-4 sm:px-5" aria-label={`${side === "spent" ? "Spending" : "Earnings"} by category`}>
          {cats.slice(0, 6).map(([c, v]) => (
            <span key={c} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-3/70 px-2.5 py-1 text-[12.5px]">
              <span className="text-ink-2">{c}</span>
              <span className="num font-semibold">{formatMoney(v, ctx)}</span>
            </span>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="px-4 py-5 text-[14px] text-ink-2 sm:px-5">
          {side === "spent" ? "No spending recorded" : "No income recorded"} in {formatMonthLong(month)}. Use + to add one.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {shown.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => ui.openTx(null, t)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 sm:px-5">
                <TxIcon cardId={t.card_id} accountId={t.account_id} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px]">{t.description || t.category || (t.type === "card_spend" ? "Card spend" : side === "spent" ? "Spending" : "Income")}</span>
                  <span className="block truncate text-[12px] text-ink-3">{[formatDate(t.date, "short"), t.category && t.description ? t.category : null, where(t)].filter(Boolean).join(" · ")}</span>
                </span>
                <span className={cn("num shrink-0 text-[14px] font-semibold", side === "earned" && "text-ok")}>
                  {side === "earned" ? "+" : "−"}
                  {formatMoney(data.amt(t), ctx, { decimals: true })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 8 && (
        <div className="border-t border-line px-4 py-2.5 sm:px-5">
          <button type="button" onClick={() => setAll((v) => !v)} className="text-[13.5px] font-medium text-ink-2 hover:text-ink">
            {all ? "Show fewer" : `Show all ${list.length}`}
          </button>
        </div>
      )}
      <div className="h-2" />
    </section>
  );
}
