"use client";

/**
 * A credit card that turns over to show what's to pay on it: this month's bill and the next two months.
 * Hover turns it on a computer; on a phone the first tap turns it and the back has Open / Edit.
 */
import { Pencil, RotateCcw } from "lucide-react";
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

/** Each card's bill this month and the next two (the same figures as To Pay → Credit cards). */
export function useCardBillsAhead(): Map<string, BillAhead[]> {
  const { ds, positions, today } = useFinance();
  const months = useMemo(() => monthRange(startOfMonth(today), 3), [today]);
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

const STATUS: Record<BillAhead["status"], { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-[#15803d]/30 text-[#9ff0c4]" },
  late: { label: "Late", cls: "bg-[#e5484d]/35 text-[#ffb4b6]" },
  due: { label: "Due soon", cls: "bg-[#d97706]/35 text-[#ffd79a]" },
  partial: { label: "Part paid", cls: "bg-[#d97706]/30 text-[#ffd79a]" },
  upcoming: { label: "To pay", cls: "bg-white/12 text-current" },
  skipped: { label: "Skipped", cls: "bg-white/10 text-current opacity-70" },
  none: { label: "Nothing", cls: "bg-white/8 text-current opacity-60" },
};

const px = (n: number) => `calc(${n}*0.2941cqw)`;

export function FlipCard({
  bills,
  owed,
  onOpen,
  onEdit,
  openLabel = "Open card",
  ...front
}: CardVisualProps & { card: CreditCard; bills: BillAhead[]; owed?: number; onOpen?: () => void; onEdit?: () => void; openLabel?: string }) {
  const { ctx } = useFinance();
  const [flipped, setFlipped] = useState(false);
  const touch = useRef(false);
  const m = (n: number) => formatMoney(n, ctx);
  const pending = bills.filter((b) => b.status !== "paid" && b.status !== "none" && b.status !== "skipped").reduce((s, b) => s + b.amount, 0);
  const { card } = front;
  return (
    <div
      className={cn("card-flip relative aspect-[1.586] w-full [perspective:1100px]", flipped && "is-flipped")}
      onPointerDown={(e) => (touch.current = e.pointerType !== "mouse")}
      onMouseLeave={() => setFlipped(false)}
    >
      <div className="card-flip-inner relative h-full w-full">
        {/* Front */}
        <div className="card-face absolute inset-0">
          <CardVisual {...front} onClick={() => (touch.current ? setFlipped(true) : onOpen?.())} />
        </div>
        {/* Back */}
        <div
          className="card-face card-back absolute inset-0 overflow-hidden rounded-[18px] bg-inverse text-on-inverse [container-type:inline-size] shadow-[0_18px_36px_-16px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          aria-label={`${card.name}: bills for the next three months`}
        >
          <button type="button" className="absolute inset-0 h-full w-full cursor-pointer text-left" onClick={() => (touch.current ? setFlipped(false) : onOpen?.())} aria-label={touch.current ? "Turn the card back" : openLabel} tabIndex={-1} />
          <div className="pointer-events-none relative flex h-full flex-col" style={{ padding: `${px(12)} ${px(16)}` }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold" style={{ fontSize: px(14) }}>{card.name}</p>
                <p className="opacity-70" style={{ fontSize: px(11) }}>{card.last4 ? `•••• ${card.last4} · ` : ""}Bills month by month</p>
              </div>
              {owed != null && (
                <div className="shrink-0 text-right">
                  <p className="uppercase tracking-wider opacity-70" style={{ fontSize: px(9.5) }}>Owe now</p>
                  <p className="num font-semibold" style={{ fontSize: px(15) }}>{m(Math.max(0, owed))}</p>
                </div>
              )}
            </div>
            <ul className="flex flex-1 flex-col justify-center" style={{ gap: px(3) }}>
              {bills.map((b, i) => {
                const st = b.status === "upcoming" && b.estimated ? { label: "Estimate", cls: "bg-[var(--future-on-inverse)]/25 text-[var(--future-on-inverse)]" } : STATUS[b.status];
                return (
                  <li key={b.month} className={cn("flex items-center gap-2 rounded-lg", i === 0 && "bg-white/8")} style={{ padding: `${px(3.5)} ${px(8)}` }}>
                    <span className="min-w-0 flex-1 truncate" style={{ fontSize: px(12) }}>
                      <span className="font-medium">{i === 0 ? `This month · ${formatMonth(b.month, false)}` : formatMonth(b.month, false)}</span>
                      <span className="opacity-65"> · due {formatDate(b.due, "short")}</span>
                    </span>
                    <span className={cn("shrink-0 rounded-full font-medium", st.cls)} style={{ fontSize: px(9.5), padding: `${px(1)} ${px(6)}` }}>{st.label}</span>
                    <span className={cn("num w-[26%] shrink-0 text-right font-semibold", b.status === "none" && "opacity-50", b.status === "paid" && "opacity-70 line-through decoration-1")} style={{ fontSize: px(13.5) }}>
                      {b.status === "none" ? "—" : m(b.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="uppercase tracking-wider opacity-70" style={{ fontSize: px(9.5) }}>Still to pay · 3 months</p>
                <p className="num font-semibold leading-tight" style={{ fontSize: px(16) }}>{m(pending)}</p>
              </div>
              <div className="pointer-events-auto flex items-center" style={{ gap: px(6) }}>
                {onEdit && (
                  <button type="button" onClick={onEdit} className="flex items-center rounded-full bg-white/12 font-medium hover:bg-white/20" style={{ fontSize: px(11.5), padding: `${px(5)} ${px(10)}`, gap: px(4) }}>
                    <Pencil style={{ width: px(12), height: px(12) }} aria-hidden /> Edit
                  </button>
                )}
                {onOpen && (
                  <button type="button" onClick={onOpen} className="rounded-full bg-white font-semibold text-[#15201c] hover:bg-white/90" style={{ fontSize: px(11.5), padding: `${px(5)} ${px(10)}` }}>
                    {openLabel}
                  </button>
                )}
                <button type="button" onClick={() => setFlipped(false)} aria-label="Turn the card back" className="card-flip-back-btn grid place-items-center rounded-full bg-white/12 hover:bg-white/20" style={{ width: px(26), height: px(26) }}>
                  <RotateCcw style={{ width: px(13), height: px(13) }} aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
