"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { addMonths, daysInMonth, formatDate, formatMonthLong, monthKey, parseISO, startOfMonth, ymd } from "@/lib/dates";
import { SETTLED, type FinEvent } from "@/lib/engine/events";
import { useFinance } from "@/lib/finance";
import { useUI } from "@/lib/ui";
import { Money } from "../money";
import { StatusPill } from "../ui/misc";
import { ChipGroup, useRangeEvents, V2PageHeader } from "./ui";
import { V2_TYPE_LABEL } from "./home";

type Filter = "all" | "cards" | "emis" | "chits" | "income";
const FILTERS: { id: Filter; label: string; test: (e: FinEvent) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "cards", label: "Card bills", test: (e) => e.kind === "card_bill" },
  { id: "emis", label: "EMIs", test: (e) => e.kind === "emi" },
  { id: "chits", label: "Chits & SIPs", test: (e) => e.kind === "chit" || e.kind === "sip" || e.kind === "chit_payout" },
  { id: "income", label: "Income", test: (e) => e.flow === "in" },
];

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function tone(e: FinEvent, today: string) {
  if (SETTLED.includes(e.status)) return "bg-ok";
  if (e.date < today) return "bg-danger";
  if (e.flow === "in") return "bg-brand";
  return "bg-future";
}

export function CalendarScreen() {
  const { today } = useFinance();
  const [first, setFirst] = useState(startOfMonth(today));
  const [filter, setFilter] = useState<Filter>("all");
  const [day, setDay] = useState(today);
  const months = useMemo(() => [monthKey(first)], [first]);
  const all = useRangeEvents(months);
  const test = FILTERS.find((f) => f.id === filter)!.test;
  const evs = useMemo(
    () => all.filter((e) => e.kind !== "card_statement" && !(e.kind === "card_spend" && e.estimated) && !e.budget && e.date.startsWith(monthKey(first)) && test(e)),
    [all, first, test],
  );
  const byDay = useMemo(() => {
    const m = new Map<string, FinEvent[]>();
    for (const e of evs) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [evs]);

  const d0 = parseISO(first);
  const y = d0.getUTCFullYear();
  const mo = d0.getUTCMonth();
  const lead = (d0.getUTCDay() + 6) % 7;
  const n = daysInMonth(y, mo);
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => ymd(y, mo, i + 1))];
  while (cells.length % 7) cells.push(null);
  const dayEvents = byDay.get(day) ?? [];
  const go = (k: number) => {
    const next = addMonths(first, k);
    setFirst(next);
    setDay(monthKey(next) === monthKey(today) ? today : next);
  };

  return (
    <>
      <V2PageHeader title="Calendar" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl border border-line bg-surface">
          <button type="button" aria-label="Previous month" onClick={() => go(-1)} className="inline-flex h-9 w-9 items-center justify-center rounded-l-xl text-ink-2 hover:bg-surface-3">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8.5rem] px-1 text-center text-[14px] font-semibold" aria-live="polite">
            {formatMonthLong(monthKey(first))}
          </span>
          <button type="button" aria-label="Next month" onClick={() => go(1)} className="inline-flex h-9 w-9 items-center justify-center rounded-r-xl text-ink-2 hover:bg-surface-3">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {monthKey(first) !== monthKey(today) && (
          <button type="button" className="h-8 rounded-full bg-surface-3/70 px-3 text-[12.5px] font-medium text-ink-2 hover:text-ink" onClick={() => (setFirst(startOfMonth(today)), setDay(today))}>
            Today
          </button>
        )}
        <ChipGroup label="Show" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ id: f.id, label: f.label }))} className="sm:ml-auto" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line text-center text-[11.5px] font-medium text-ink-3">
            {WEEK.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              if (!d) return <div key={`x${i}`} className="min-h-14 border-b border-r border-line/60 bg-surface-2/50 sm:min-h-24" />;
              const list = byDay.get(d) ?? [];
              const sel = d === day;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  aria-pressed={sel}
                  aria-label={`${formatDate(d)}: ${list.length} item${list.length === 1 ? "" : "s"}`}
                  className={cn("flex min-h-14 flex-col items-stretch gap-1 border-b border-r border-line/60 p-1 text-left sm:min-h-24 sm:p-1.5", sel ? "bg-future-soft/60" : "hover:bg-surface-2")}
                >
                  <span className={cn("num self-start rounded-full px-1.5 text-[12.5px]", d === today ? "bg-ink font-semibold text-paper" : "text-ink-2")}>{parseISO(d).getUTCDate()}</span>
                  {/* Phone: dots */}
                  <span className="flex flex-wrap gap-0.5 px-0.5 sm:hidden">
                    {list.slice(0, 4).map((e) => (
                      <span key={e.key} className={cn("h-1.5 w-1.5 rounded-full", tone(e, today))} aria-hidden />
                    ))}
                  </span>
                  {/* Desktop: labels */}
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {list.slice(0, 3).map((e) => (
                      <span key={e.key} className={cn("truncate rounded px-1 py-px text-[11px] leading-tight", SETTLED.includes(e.status) ? "bg-ok-soft text-ok" : e.date < today ? "bg-danger-soft text-danger" : e.flow === "in" ? "bg-brand-soft text-brand-strong" : "bg-future-soft text-future-ink")}>
                        {e.title.replace(/^(EMI|SIP|Chit) · /, "")}
                      </span>
                    ))}
                    {list.length > 3 && <span className="text-[10.5px] text-ink-3">+{list.length - 3} more</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <section className="rounded-2xl border border-line bg-surface p-3" aria-label={`Items on ${formatDate(day)}`}>
          <h2 className="px-1 pb-2 text-[15px] font-semibold">{formatDate(day, "long")}</h2>
          {dayEvents.length === 0 ? (
            <p className="px-1 pb-2 text-[13.5px] text-ink-3">Nothing on this day.</p>
          ) : (
            <ul className="divide-y divide-line">
              {dayEvents.map((e) => (
                <li key={e.key}>
                  <button type="button" onClick={() => useUI.getState().openEvent(e.key)} className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2.5 text-left hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{e.title.replace(/^(EMI|SIP|Chit) · /, "")}</span>
                      <span className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-3">
                        {V2_TYPE_LABEL[e.kind]} <StatusPill status={e.status} flowIn={e.flow === "in"} />
                      </span>
                    </span>
                    <Money value={SETTLED.includes(e.status) ? e.paid || e.amount : e.remaining || e.amount} decimals projected={e.estimated && !SETTLED.includes(e.status)} className={cn("shrink-0 text-[14px] font-semibold", e.flow === "in" && "text-ok")} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ok" aria-hidden /> Paid</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-danger" aria-hidden /> Late</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-future" aria-hidden /> To pay</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand" aria-hidden /> Money coming in</span>
        <span className="hidden lg:inline">Tap a day to see its items with their status.</span>
      </p>
    </>
  );
}
