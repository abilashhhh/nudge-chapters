"use client";

/**
 * A credit card that turns over to show what's to pay on it: this month's bill and the next two months.
 * View only: hover turns it on a computer; on a phone the first tap turns it and a second tap opens the card.
 */
import { CheckCircle2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate, formatMonth, startOfMonth } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import type { CreditCard, ISODate } from "@/lib/types";
import { billInMonth, cardGrid, monthRange, type CellStatus } from "@/lib/v2/grids";
import { CardVisual, type CardVisualProps } from "./card-visual";
import { useRangeEvents } from "./ui";

export interface BillAhead {
  month: string;
  amount: number;
  status: CellStatus | "none";
  estimated: boolean;
  due: ISODate;
}

/** Each card's bill this month and the 11 after (the same figures as To Pay → Credit cards). */
export function useCardBillsAhead(): Map<string, BillAhead[]> {
  const { ds, positions, today } = useFinance();
  const months = useMemo(() => monthRange(startOfMonth(today), 12), [today]);
  const events = useRangeEvents(months);
  return useMemo(() => {
    const grid = cardGrid(ds, positions, events, months, today);
    const out = new Map<string, BillAhead[]>();
    for (const card of ds.credit_cards) {
      const g = grid.groups.find((x) => x.ref?.id === card.id);
      out.set(
        card.id,
        months.map((m) => {
          const cell = g?.total.cells[m];
          const amount = cell?.amount ?? 0;
          return { month: m, amount, status: amount > 0.005 ? (cell?.status ?? "upcoming") : "none", estimated: !!cell?.estimated, due: billInMonth(card, m).due };
        }),
      );
    }
    return out;
  }, [ds, positions, events, months, today]);
}

const STATUS: Partial<Record<BillAhead["status"], { label: string; cls: string }>> = {
  paid: { label: "Paid", cls: "text-[#9ff0c4]" },
  late: { label: "Late", cls: "text-[#ffb4b6]" },
  due: { label: "Due soon", cls: "text-[#ffd79a]" },
  partial: { label: "Part paid", cls: "text-[#ffd79a]" },
};

const px = (n: number) => `calc(${n}*0.2941cqw)`;

export function FlipCard({
  bills,
  owed,
  onOpen,
  ...front
}: CardVisualProps & { card: CreditCard; bills: BillAhead[]; owed?: number; onOpen?: () => void }) {
  const { ctx } = useFinance();
  const [flipped, setFlipped] = useState(false);
  const touch = useRef(false);
  const m = (n: number) => formatMoney(n, ctx);
  const { card } = front;
  // What's still to pay: this month's bill when it's unpaid, otherwise everything pending. Two rows at most,
  // then "+N more months".
  const pendingRows = bills.filter((b) => b.status !== "none" && b.status !== "skipped" && b.status !== "paid");
  const thisMonth = bills[0] && pendingRows[0]?.month === bills[0].month ? pendingRows[0] : null;
  const rows = pendingRows.slice(0, 2);
  const more = pendingRows.slice(2);
  const pending = pendingRows.reduce((s, b) => s + b.amount, 0);
  const headline = thisMonth ? thisMonth.amount : pending;
  const clear = pending < 0.5 && (owed ?? 0) < 0.5;
  const flip = (v: boolean) => setFlipped(v);
  return (
    // The click is handled here, on the card as a whole: while it turns, the press and release can land on
    // different faces, and only an element containing both gets the click.
    <div
      className={cn("card-flip relative aspect-[1.586] w-full cursor-pointer [perspective:1100px]", flipped && "is-flipped")}
      onPointerDown={(e) => (touch.current = e.pointerType !== "mouse")}
      onMouseLeave={() => setFlipped(false)}
      onClick={() => {
        if (touch.current && !flipped) flip(true); // phones: first tap turns it over
        else if (onOpen) onOpen();
        else flip(!flipped);
      }}
    >
      <div className="card-flip-inner relative h-full w-full">
        <div className="card-face absolute inset-0">
          <CardVisual {...front} />
        </div>
        <div
          aria-hidden={!flipped}
          aria-label={`${card.name}: ${clear ? "nothing to pay" : `${m(pending)} to pay`}`}
          className="card-face card-back absolute inset-0 overflow-hidden rounded-[18px] bg-inverse text-left text-on-inverse [container-type:inline-size] shadow-[0_18px_36px_-16px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,255,255,0.08)]"
        >
          <span className="flex h-full flex-col" style={{ padding: `${px(16)} ${px(18)}` }}>
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-semibold uppercase tracking-[0.12em] opacity-80" style={{ fontSize: px(11) }}>{card.name}</span>
              {card.last4 && <span className="num shrink-0 opacity-60" style={{ fontSize: px(11) }}>•••• {card.last4}</span>}
            </span>
            {clear ? (
              <span className="flex flex-1 flex-col items-center justify-center text-center" style={{ gap: px(6) }}>
                <CheckCircle2 className="text-[#9ff0c4]" style={{ width: px(30), height: px(30) }} aria-hidden />
                <span className="font-semibold" style={{ fontSize: px(17) }}>All clear</span>
                <span className="opacity-65" style={{ fontSize: px(12) }}>Nothing to pay on this card</span>
              </span>
            ) : (
              <>
                <span className="mt-auto block opacity-65" style={{ fontSize: px(11) }}>
                  {pending < 0.5 ? "Spent, not billed yet" : thisMonth ? `Due this month · ${formatDate(thisMonth.due, "short")}` : "Still to pay"}
                </span>
                <span className="num block font-semibold leading-none" style={{ fontSize: px(28) }}>{m(pending < 0.5 ? owed ?? 0 : headline)}</span>
                {rows.length > 0 && (
                  <span className="mt-auto flex flex-col" style={{ gap: px(4), marginTop: px(12) }}>
                    {rows.map((b) => {
                      const st = STATUS[b.status];
                      return (
                        <span key={b.month} className="flex items-center gap-2 border-t border-white/10" style={{ paddingTop: px(4), fontSize: px(12.5) }}>
                          <span className="min-w-0 flex-1 truncate">
                            {formatMonth(b.month, false)}
                            <span className="opacity-55"> · due {formatDate(b.due, "short")}</span>
                          </span>
                          {st && <span className={cn("shrink-0 font-medium", st.cls)} style={{ fontSize: px(11) }}>{st.label}</span>}
                          <span className="num shrink-0 text-right font-semibold">{m(b.amount)}</span>
                        </span>
                      );
                    })}
                    {more.length > 0 && (
                      <span className="flex items-center justify-between gap-2 opacity-70" style={{ fontSize: px(11.5) }}>
                        <span>+{more.length} more month{more.length === 1 ? "" : "s"}</span>
                        <span className="num">{m(more.reduce((s, b) => s + b.amount, 0))}</span>
                      </span>
                    )}
                  </span>
                )}
              </>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
