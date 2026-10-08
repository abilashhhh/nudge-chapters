"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { EventRow } from "@/components/event-row";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { EmptyState, Panel, Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { addDays, addMonths, endOfMonth, formatDate, formatMonth, formatMonthLong, monthKey, parseISO, startOfMonth } from "@/lib/dates";
import { buildEvents, isPending, type FinEvent } from "@/lib/engine/events";
import { useFinance } from "@/lib/finance";
import { formatCompact } from "@/lib/money";
import { useUI } from "@/lib/ui";

const FILTERS: { id: string; label: string; test: (e: FinEvent) => boolean }[] = [
  { id: "all", label: "Everything", test: () => true },
  { id: "bills", label: "Bills & expenses", test: (e) => e.kind === "expense" || e.kind === "card_spend" },
  { id: "income", label: "Income", test: (e) => e.flow === "in" },
  { id: "cards", label: "Credit cards", test: (e) => e.kind === "card_bill" || e.kind === "card_statement" },
  { id: "emi", label: "EMIs", test: (e) => e.kind === "emi" },
  { id: "invest", label: "SIPs & chits", test: (e) => e.kind === "sip" || e.kind === "chit" || e.kind === "chit_payout" },
  { id: "lending", label: "Lending", test: (e) => e.kind === "lend_due" || e.kind === "borrow_due" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarView />
    </Suspense>
  );
}

function chipClass(e: FinEvent, today: string) {
  if (e.status === "overdue" || (e.status === "partial" && e.date < today)) return "bg-danger-soft text-danger";
  if (["paid", "received", "adjusted"].includes(e.status)) return "bg-ok-soft text-ok";
  if (["skipped", "cancelled"].includes(e.status)) return "bg-surface-3 text-ink-3 line-through";
  if (e.kind === "card_statement") return "bg-surface-3 text-ink-2";
  if (e.flow === "in") return "bg-brand-soft text-brand-strong";
  return "bg-future-soft text-future-ink";
}

function CalendarView() {
  const { ds, today, positions, assumptions } = useFinance();
  const [view, setView] = useState<"month" | "agenda" | "year">("month");
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("all");
  const [account, setAccount] = useState("");
  const [selected, setSelected] = useState(today);

  const ref = addMonths(startOfMonth(today), view === "year" ? offset * 12 : offset);
  const monthStart = startOfMonth(ref);
  const monthEnd = endOfMonth(ref);
  const gridStart = addDays(monthStart, -((parseISO(monthStart).getUTCDay() + 6) % 7));
  const range =
    view === "year"
      ? { from: `${ref.slice(0, 4)}-01-01`, to: `${ref.slice(0, 4)}-12-31` }
      : view === "agenda"
        ? { from: offset === 0 ? today : monthStart, to: offset === 0 ? addDays(today, 45) : monthEnd }
        : { from: gridStart, to: addDays(gridStart, 41) };

  const events = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)!.test;
    return buildEvents(ds, { ...range, today, positions, scenario: assumptions.scenarios.base })
      .filter((e) => e.date >= range.from && !(e.kind === "card_spend" && e.estimated) && !e.budget)
      .filter(test)
      .filter((e) => !account || e.accountId === account || e.toAccountId === account || (account.startsWith("card:") && e.cardId === account.slice(5)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, range.from, range.to, today, positions, assumptions, filter, account]);

  const byDay = new Map<string, FinEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const title = view === "year" ? ref.slice(0, 4) : formatMonthLong(monthKey(ref));
  const dayEvents = byDay.get(selected) ?? [];

  return (
    <>
      <PageHeader title="Calendar" description="Salary days, bills, card statements, EMIs, SIPs, chits and repayments — tap any item to mark it paid, move or skip it." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          options={[
            { id: "month", label: "Month" },
            { id: "agenda", label: "Agenda" },
            { id: "year", label: "Year" },
          ]}
          value={view}
          onChange={(v) => {
            setView(v);
            setOffset(0);
          }}
        />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Previous" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setOffset(offset - 1)} />
          <span className="min-w-36 text-center text-[15px] font-semibold">{title}</span>
          <Button size="sm" variant="ghost" aria-label="Next" icon={<ChevronRight className="h-4 w-4" />} onClick={() => setOffset(offset + 1)} />
          {offset !== 0 && (
            <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>
              Today
            </Button>
          )}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select aria-label="Filter by type" className="h-9 w-auto text-[13px]" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by account" className="h-9 w-auto text-[13px]" value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">All accounts</option>
            {ds.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {ds.credit_cards.map((c) => (
              <option key={c.id} value={`card:${c.id}`}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {view === "month" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-[11.5px] font-medium text-ink-3">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2">
                  <span className="sm:hidden">{d[0]}</span>
                  <span className="hidden sm:inline">{d}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)).map((d) => {
                const inMonth = d >= monthStart && d <= monthEnd;
                const evs = byDay.get(d) ?? [];
                const out = evs.filter((e) => e.flow === "out" && isPending(e)).reduce((s, e) => s + e.remaining, 0);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelected(d)}
                    aria-label={`${formatDate(d, "long")}, ${evs.length} items`}
                    aria-pressed={selected === d}
                    className={cn(
                      "flex min-h-16 flex-col items-stretch gap-0.5 border-b border-r border-line p-1 text-left transition-colors sm:min-h-24 sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                      !inMonth && "bg-surface-2/60 text-ink-3",
                      selected === d && "bg-future-soft/60",
                    )}
                  >
                    <span className={cn("num inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-[12.5px]", d === today && "bg-ink font-semibold text-paper")}>{Number(d.slice(8))}</span>
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {evs.slice(0, 3).map((e) => (
                        <span key={e.key} className={cn("truncate rounded px-1 py-0.5 text-[11px] leading-tight", chipClass(e, today))}>
                          {e.title}
                        </span>
                      ))}
                      {evs.length > 3 && <span className="px-1 text-[11px] text-ink-3">+{evs.length - 3} more</span>}
                    </span>
                    <span className="flex flex-wrap gap-0.5 sm:hidden">
                      {evs.slice(0, 4).map((e) => (
                        <span key={e.key} className={cn("h-1.5 w-1.5 rounded-full", chipClass(e, today).includes("danger") ? "bg-danger" : e.flow === "in" ? "bg-brand" : ["paid", "received"].includes(e.status) ? "bg-ok" : "bg-future")} />
                      ))}
                    </span>
                    {out > 0 && <span className="num mt-auto hidden text-[10.5px] text-ink-3 sm:block">−{formatCompact(out, { currency: ds.profile.currency, locale: ds.profile.locale })}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <Panel title={formatDate(selected, "long")} description={dayEvents.length ? `${dayEvents.length} item${dayEvents.length > 1 ? "s" : ""}` : undefined}>
            {dayEvents.length ? (
              <div className="-mx-2 sm:-mx-3">
                {dayEvents.map((e) => (
                  <EventRow key={e.key} e={e} />
                ))}
              </div>
            ) : (
              <p className="text-[13.5px] text-ink-3">Nothing on this day.</p>
            )}
            <Button size="sm" className="mt-3" onClick={() => useUI.getState().openEditor("rule", undefined, { frequency: "once", start_date: selected, track_from: selected, kind: "expense" })}>
              Plan something on this day
            </Button>
          </Panel>
        </div>
      )}

      {view === "agenda" && (
        <div className="flex flex-col gap-4">
          {[...byDay.entries()].length === 0 ? (
            <EmptyState title="Nothing planned in this period" />
          ) : (
            [...byDay.entries()].map(([d, evs]) => (
              <Panel key={d} title={formatDate(d, "long")}>
                <div className="-mx-2 sm:-mx-3">
                  {evs.map((e) => (
                    <EventRow key={e.key} e={e} />
                  ))}
                </div>
              </Panel>
            ))
          )}
        </div>
      )}

      {view === "year" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, m) => `${ref.slice(0, 4)}-${String(m + 1).padStart(2, "0")}`).map((mk) => {
            const evs = events.filter((e) => e.date.startsWith(mk));
            const inc = evs.filter((e) => e.flow === "in").reduce((s, e) => s + (isPending(e) ? e.remaining : e.paid || e.amount), 0);
            const out = evs.filter((e) => e.flow === "out").reduce((s, e) => s + (isPending(e) ? e.remaining : e.paid || e.amount), 0);
            const overdue = evs.filter((e) => e.status === "overdue").length;
            const ctx = { currency: ds.profile.currency, locale: ds.profile.locale };
            return (
              <button
                key={mk}
                type="button"
                onClick={() => {
                  setView("month");
                  const diff = (Number(mk.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(mk.slice(5)) - Number(today.slice(5, 7));
                  setOffset(diff);
                }}
                className={cn("rounded-2xl border border-line bg-surface p-4 text-left hover:border-line-strong", mk === today.slice(0, 7) && "ring-2 ring-future/40")}
              >
                <p className="text-[15px] font-semibold">{formatMonth(mk)}</p>
                <p className="num mt-2 text-[13px] text-ok">+{formatCompact(inc, ctx)} in</p>
                <p className="num text-[13px] text-ink-2">−{formatCompact(out, ctx)} out</p>
                <p className="mt-1 text-[12px] text-ink-3">
                  {evs.length} items{overdue ? ` · ${overdue} overdue` : ""}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
