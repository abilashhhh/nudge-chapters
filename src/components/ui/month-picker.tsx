"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { create } from "zustand";
import { cn } from "@/lib/cn";
import { addMonths, formatMonthLong, monthKey, startOfMonth } from "@/lib/dates";

/** The month every month-aware section shows. Shared so switching month on one screen carries over. */
export const useMonth = create<{ month: string | null; set(m: string | null): void }>((set) => ({ month: null, set: (m) => set({ month: m }) }));

/** First day of the selected month (defaults to today's month). */
export function useSelectedMonth(today: string): string {
  const m = useMonth((s) => s.month);
  return m ?? startOfMonth(today);
}

export function MonthPicker({ today, className }: { today: string; className?: string }) {
  const sel = useSelectedMonth(today);
  const set = useMonth((s) => s.set);
  const cur = startOfMonth(today);
  const go = (n: number) => {
    const next = addMonths(sel, n);
    set(next === cur ? null : next);
  };
  const quick = [
    { id: -1, label: "Last month" },
    { id: 0, label: "This month" },
    { id: 1, label: "Next month" },
  ];
  return (
    <div className={cn("flex max-w-full flex-wrap items-center gap-2", className)}>
      <div className="flex items-center rounded-xl border border-line bg-surface">
        <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-l-xl text-ink-2 hover:bg-surface-3">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-[7.5rem] whitespace-nowrap px-1 text-center text-[13.5px] font-semibold" aria-live="polite">
          {formatMonthLong(monthKey(sel))}
        </span>
        <button type="button" aria-label="Next month" onClick={() => go(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-r-xl text-ink-2 hover:bg-surface-3">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {quick.map((q) => {
          const target = addMonths(cur, q.id);
          const on = target === sel;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => set(q.id === 0 ? null : target)}
              className={cn("h-8 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-medium transition-colors", on ? "bg-ink text-paper" : "bg-surface-3/70 text-ink-2 hover:text-ink")}
            >
              {q.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
