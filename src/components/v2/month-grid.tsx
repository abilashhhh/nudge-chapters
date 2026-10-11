"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Download, List, Plus, Table2 } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { cn } from "@/lib/cn";
import { downloadBlob } from "@/lib/data/io";
import { addMonths, monthKey, startOfMonth } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { monthRange, rowTotal, type GridCell, type GridGroup, type GridRow, type MonthGridData } from "@/lib/v2/grids";
import { Money } from "../money";
import { Button } from "../ui/button";
import { ChipGroup, StatusIcon, StatusText, STATUS_WORD } from "./ui";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10" → "Oct-26" */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MON[m - 1]}-${String(y).slice(2)}`;
}

type Ahead = 3 | 6 | 12;

/** Shared range for every month table, so switching on one screen carries over to the next. */
export const useGridRange = create<{
  offset: number;
  ahead: Ahead;
  /** null = not chosen yet: list on phones, table on larger screens. */
  view: "table" | "list" | null;
  listMonth: string | null;
  setOffset(n: number): void;
  setAhead(a: Ahead): void;
  setView(v: "table" | "list"): void;
  setListMonth(m: string | null): void;
}>((set) => ({
  offset: 0,
  ahead: 6,
  view: null,
  listMonth: null,
  setOffset: (offset) => set({ offset }),
  setAhead: (ahead) => set({ ahead }),
  setView: (view) => set({ view }),
  setListMonth: (listMonth) => set({ listMonth }),
}));

/** True on phone-sized screens (under 640 px). */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 639px)");
    const on = () => setPhone(q.matches);
    on();
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return phone;
}

/** Months shown: the current month + the next 3 / 6 / 12, shifted by Earlier / Later. */
export function useGridMonths(): string[] {
  const { today } = useFinance();
  const { offset, ahead } = useGridRange();
  return monthRange(addMonths(startOfMonth(today), offset), ahead + 1);
}

function openCell(cell: GridCell | undefined) {
  if (!cell?.eventKeys.length) return;
  const key = cell.eventKeys.find((k) => !k.startsWith("before:"));
  if (!key) {
    toast("Paid before you started tracking — it's already in your balances.");
    return;
  }
  if (key.startsWith("tx:")) {
    const id = key.slice(3);
    const t = useStore.getState().ds?.transactions.find((x) => x.id === id);
    if (t) useUI.getState().openTx(null, t);
    return;
  }
  useUI.getState().openEvent(key);
}

function Cell({ cell, current, bold }: { cell?: GridCell; current: boolean; bold?: boolean }) {
  if (!cell || (Math.abs(cell.amount) < 0.005 && cell.status !== "skipped")) {
    return <td className={cn("px-2 py-2 text-right text-ink-3 sm:px-3", current && "bg-surface-2")}>–</td>;
  }
  const word = cell.incoming && cell.status === "paid" ? "Received" : STATUS_WORD[cell.status];
  return (
    <td className={cn("p-0 text-right", current && "bg-surface-2")}>
      <button
        type="button"
        onClick={() => openCell(cell)}
        title={`${word}${cell.estimated ? " · Estimate" : ""} — tap to mark paid, change, skip or move`}
        className="flex w-full items-center justify-end gap-1 px-2 py-2 hover:bg-surface-3/60 sm:px-3"
      >
        {cell.status !== "upcoming" && <StatusIcon status={cell.status} incoming={cell.incoming} />}
        <Money value={cell.amount} decimals projected={cell.estimated} className={cn("text-[12.5px] sm:text-[13.5px]", bold && "font-semibold")} />
        <span className="sr-only">{word}</span>
      </button>
    </td>
  );
}

function TotalCell({ cells, months, bold }: { cells: Record<string, GridCell>; months: string[]; bold?: boolean }) {
  const total = rowTotal(cells, months);
  const est = months.some((m) => cells[m]?.estimated);
  return (
    <td className="px-2 py-2 text-right sm:px-3">
      {Math.abs(total) < 0.005 ? <span className="text-ink-3">–</span> : <Money value={total} decimals projected={est} className={cn("text-[12.5px] sm:text-[13.5px]", bold ? "font-bold" : "font-semibold")} />}
    </td>
  );
}

export interface MonthGridProps {
  data: MonthGridData;
  /** Header of the first column (e.g. "Credit card", "Item", "Person"). */
  nameHeader: string;
  /** Header of the second column. Hidden when null. */
  forHeader?: string | null;
  /** Label of the grand-total row. */
  grandLabel?: string;
  onRow?: (row: GridRow, group: GridGroup) => void;
  /** Shown when a group's name is tapped (details and actions). */
  groupDetails?: (group: GridGroup) => ReactNode;
  /** "+ Add" inside each group (e.g. add a spend to this card). */
  groupAdd?: { label: string | ((g: GridGroup) => string); run: (g: GridGroup) => void };
  /** "+ Add" under the table (e.g. add a card). */
  bottomAdd?: { label: string; run: () => void };
  /** File name for "Download Excel" (without extension). */
  exportName: string;
  empty?: ReactNode;
  /** Rows are money coming in (income, repayments): wording changes from "paid" to "received". */
  incoming?: boolean;
  /** A short line under the table (rules that keep totals honest). */
  footnote?: ReactNode;
}

export function MonthGrid({ data, nameHeader, forHeader = "For", grandLabel = "Grand total", onRow, groupDetails, groupAdd, bottomAdd, exportName, empty, incoming, footnote }: MonthGridProps) {
  const { today, ctx } = useFinance();
  const range = useGridRange();
  const phone = usePhone();
  const view = range.view ?? (phone ? "list" : "table");
  const cur = monthKey(today);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const months = data.months;

  const exportExcel = async () => {
    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const head = [nameHeader, "Item", ...(forHeader ? [forHeader] : []), ...months.map(monthLabel), "Total"].map((v) => ({ value: v, fontWeight: "bold" as const }));
      const line = (group: string, item: string, note: string | undefined, cells: Record<string, GridCell>, bold = false) => [
        { value: group, fontWeight: bold ? ("bold" as const) : undefined },
        { value: item, fontWeight: bold ? ("bold" as const) : undefined },
        ...(forHeader ? [{ value: note ?? "" }] : []),
        ...months.map((m) => (cells[m] ? { value: cells[m].amount, type: Number, format: "#,##0.00", fontWeight: bold ? ("bold" as const) : undefined } : { value: "–" })),
        { value: rowTotal(cells, months), type: Number, format: "#,##0.00", fontWeight: "bold" as const },
      ];
      const rows = [head];
      for (const g of data.groups) {
        rows.push(line(g.label, g.total.label, undefined, g.total.cells, true) as never);
        for (const r of g.rows) rows.push(line("", r.label, r.note, r.cells) as never);
      }
      if (data.groups.length > 1) rows.push(line(grandLabel, "", undefined, data.grand, true) as never);
      const blob = await writeExcelFile(rows as never, { stickyRowsCount: 1, stickyColumnsCount: 1 } as never).toBlob();
      downloadBlob(blob, `${exportName}-${months[0]}-to-${months.at(-1)}.xlsx`);
    } catch (e) {
      toast.error(`Couldn't create the Excel file: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  const controls = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-xl border border-line bg-surface">
        <button type="button" aria-label="Earlier months" onClick={() => range.setOffset(range.offset - 3)} className="inline-flex h-9 items-center gap-1 rounded-l-xl px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-3">
          <ChevronLeft className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Earlier</span>
        </button>
        {range.offset !== 0 && (
          <button type="button" onClick={() => range.setOffset(0)} className="h-9 border-x border-line px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-3">
            Now
          </button>
        )}
        <button type="button" aria-label="Later months" onClick={() => range.setOffset(range.offset + 3)} className="inline-flex h-9 items-center gap-1 rounded-r-xl px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-3">
          <span className="hidden sm:inline">Later</span> <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {view === "table" && (
        <ChipGroup
          label="How many months"
          value={range.ahead}
          onChange={range.setAhead}
          options={[
            { id: 3, label: "3 mo" },
            { id: 6, label: "6 mo" },
            { id: 12, label: "12 mo" },
          ]}
        />
      )}
      <div className="ml-auto flex items-center gap-1">
        <div className="inline-flex rounded-xl bg-surface-3 p-1" role="radiogroup" aria-label="Show as">
          {(
            [
              ["list", "Month", List],
              ["table", "Table", Table2],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={view === id}
              onClick={() => range.setView(id)}
              className={cn("inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12.5px] font-medium", view === id ? "bg-surface text-ink shadow-sm" : "text-ink-2")}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <button type="button" aria-label="Download Excel" title="Download Excel" onClick={exportExcel} disabled={!data.groups.length} className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-[13px] font-medium text-ink-2 hover:bg-surface-3 disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Excel</span>
        </button>
      </div>
    </div>
  );

  if (!data.groups.length) {
    return (
      <div>
        {controls}
        {empty}
        {bottomAdd && (
          <Button className="mt-3" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={bottomAdd.run}>
            {bottomAdd.label}
          </Button>
        )}
      </div>
    );
  }

  const showFor = !!forHeader;
  const nameCls = "sticky left-0 z-[1] bg-surface";

  const legend = (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3">
      {(["paid", "due", "late", "partial", "skipped"] as const).map((s) => (
        <StatusText key={s} status={s} incoming={incoming} className="text-[12px]" />
      ))}
      <span className="projected text-[12px]">Violet = estimate</span>
      <span>– = nothing due</span>
    </div>
  );

  if (view === "list") {
    const lm = range.listMonth && months.includes(range.listMonth) ? range.listMonth : months.includes(cur) ? cur : months[0];
    const withAmount = data.groups.filter((g) => g.total.cells[lm] && Math.abs(g.total.cells[lm].amount) > 0.005);
    const nothing = data.groups.filter((g) => !withAmount.includes(g));
    return (
      <div>
        {controls}
        <div className="no-scrollbar -mx-4 mb-3 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Month">
          {months.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={lm === m}
              onClick={() => range.setListMonth(m)}
              className={cn("h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium", lm === m ? "bg-ink text-paper" : "bg-surface-3/70 text-ink-2 hover:text-ink")}
            >
              {monthLabel(m)}
              {m === cur ? " · now" : ""}
            </button>
          ))}
        </div>
        {data.groups.length > 1 && (
          <div className="mb-3 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-paper">
            <span className="text-[14px] font-semibold">
              {grandLabel} · {monthLabel(lm)}
            </span>
            {data.grand[lm] ? <Money value={data.grand[lm].amount} decimals className="text-[18px] font-semibold text-inherit" /> : <span>–</span>}
          </div>
        )}
        <div className="flex flex-col gap-2">
          {withAmount.map((g) => {
            const t = g.total.cells[lm];
            const isOpen = !!open[g.id];
            const rows = g.rows.filter((r) => r.cells[lm]);
            return (
              <section key={g.id} className="overflow-hidden rounded-2xl border border-line bg-surface" aria-label={g.label}>
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold">{g.label}</span>
                    <StatusText status={t.status} incoming={t.incoming ?? incoming} className="text-[12px]" />
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Money value={t.amount} decimals projected={t.estimated} className="text-[16px] font-semibold" />
                    <ChevronDown className={cn("h-4 w-4 text-ink-3 transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-line bg-surface-2/60">
                    {rows.length > 0 && (
                      <ul className="divide-y divide-line">
                        {rows.map((r) => {
                          const c = r.cells[lm];
                          return (
                            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                              <button type="button" className="min-w-0 text-left" onClick={() => onRow?.(r, g)}>
                                <span className="block truncate text-[14px]">{r.label}</span>
                                {r.note && r.note !== "Me" && <span className="block truncate text-[12px] text-ink-3">For {r.note}</span>}
                              </button>
                              <button type="button" className="shrink-0 text-right" onClick={() => openCell(c)}>
                                <Money value={c.amount} decimals projected={c.estimated} className="text-[14px] font-medium" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                      <Button size="sm" variant="primary" onClick={() => openCell(t)}>
                        {t.incoming ? "Mark received" : "Pay / mark paid"}
                      </Button>
                      {groupAdd && (
                        <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => groupAdd.run(g)}>
                          {typeof groupAdd.label === "function" ? groupAdd.label(g) : groupAdd.label}
                        </Button>
                      )}
                    </div>
                    {groupDetails && <div className="border-t border-line px-4 py-3">{groupDetails(g)}</div>}
                  </div>
                )}
              </section>
            );
          })}
          {withAmount.length === 0 && <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-ink-2">Nothing in {monthLabel(lm)}.</p>}
          {nothing.length > 0 && withAmount.length > 0 && (
            <p className="px-1 text-[12.5px] text-ink-3">
              Nothing in {monthLabel(lm)}: {nothing.map((g) => g.label).join(", ")}
            </p>
          )}
        </div>
        {bottomAdd && (
          <Button className="mt-3" size="sm" icon={<Plus className="h-4 w-4" />} onClick={bottomAdd.run}>
            {bottomAdd.label}
          </Button>
        )}
        {footnote && <p className="mt-2 text-[12.5px] text-ink-3">{footnote}</p>}
      </div>
    );
  }

  return (
    <div>
      {controls}
      <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
        <table className="w-full border-collapse text-[13px] sm:text-[13.5px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-3">
              <th scope="col" className={cn(nameCls, "w-[7.5rem] min-w-[7.5rem] px-3 py-2.5 font-medium sm:w-auto sm:min-w-[11rem]")}>
                {nameHeader}
              </th>
              {showFor && (
                <th scope="col" className="hidden min-w-[6rem] px-3 py-2.5 font-medium sm:table-cell">
                  {forHeader}
                </th>
              )}
              {months.map((m) => (
                <th key={m} scope="col" className={cn("min-w-[5rem] whitespace-nowrap px-2 py-2.5 text-right font-medium sm:min-w-[6.5rem] sm:px-3", m === cur && "bg-surface-2 font-bold text-ink")}>
                  {monthLabel(m)}
                </th>
              ))}
              <th scope="col" className="min-w-[5.5rem] px-2 py-2.5 text-right font-medium sm:px-3">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="num">
            {data.groups.map((g) => {
              const isOpen = !!open[g.id];
              return (
                <Fragment key={g.id}>
                  <tr className="border-t border-line bg-surface-2/60">
                    <th scope="row" className={cn(nameCls, "bg-surface-2 px-0 py-0 text-left align-top font-semibold")}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-1 px-3 py-2 text-left hover:bg-surface-3/70"
                        onClick={() => (groupDetails ? setOpen((o) => ({ ...o, [g.id]: !o[g.id] })) : onRow?.(g.total, g))}
                        aria-expanded={groupDetails ? isOpen : undefined}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-semibold text-ink sm:text-[14px]">{g.label}</span>
                          <span className="block truncate text-[11.5px] font-normal text-ink-3 sm:hidden">{g.total.label}</span>
                        </span>
                        {groupDetails && <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-ink-3 transition-transform", isOpen && "rotate-180")} aria-hidden />}
                      </button>
                    </th>
                    {showFor && <td className="hidden px-3 py-2 font-semibold text-ink-2 sm:table-cell">{g.total.label}</td>}
                    {months.map((m) => (
                      <Cell key={m} cell={g.total.cells[m]} current={m === cur} bold />
                    ))}
                    <TotalCell cells={g.total.cells} months={months} bold />
                  </tr>
                  {isOpen && groupDetails && (
                    <tr className="border-t border-line">
                      <td colSpan={months.length + (showFor ? 3 : 2)} className="p-0">
                        <div className="sticky left-0 w-[calc(100vw-2rem)] max-w-full px-3 py-3 sm:w-auto">{groupDetails(g)}</div>
                      </td>
                    </tr>
                  )}
                  {g.rows.map((r) => (
                    <tr key={r.id} className="border-t border-line/70">
                      <th scope="row" className={cn(nameCls, "px-0 py-0 text-left font-normal")}>
                        <button type="button" className="block w-full px-3 py-2 pl-5 text-left hover:bg-surface-2" onClick={() => onRow?.(r, g)}>
                          <span className="block truncate text-[13px] text-ink sm:text-[13.5px]">
                            <span className="text-ink-3" aria-hidden>
                              ↳{" "}
                            </span>
                            {r.label}
                          </span>
                          {showFor && r.note && <span className="block truncate text-[11.5px] text-ink-3 sm:hidden">{r.note}</span>}
                        </button>
                      </th>
                      {showFor && <td className="hidden truncate px-3 py-2 text-ink-2 sm:table-cell">{r.note || "–"}</td>}
                      {months.map((m) => (
                        <Cell key={m} cell={r.cells[m]} current={m === cur} />
                      ))}
                      <TotalCell cells={r.cells} months={months} />
                    </tr>
                  ))}
                  {groupAdd && (
                    <tr className="border-t border-line/70">
                      <td className={cn(nameCls, "px-3 py-1")}>
                        <button type="button" onClick={() => groupAdd.run(g)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[12.5px] font-medium text-ink-2 hover:bg-surface-3 hover:text-ink">
                          <Plus className="h-3.5 w-3.5" aria-hidden /> {typeof groupAdd.label === "function" ? groupAdd.label(g) : groupAdd.label}
                        </button>
                      </td>
                      <td colSpan={months.length + (showFor ? 2 : 1)} />
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {data.groups.length > 1 && (
            <tfoot className="num">
              <tr className="border-t-2 border-ink">
                <th scope="row" className={cn(nameCls, "px-3 py-2.5 text-left text-[13.5px] font-bold")}>
                  {grandLabel}
                </th>
                {showFor && <td className="hidden sm:table-cell" />}
                {months.map((m) => (
                  <td key={m} className={cn("px-2 py-2.5 text-right sm:px-3", m === cur && "bg-surface-2")}>
                    {data.grand[m] ? <Money value={data.grand[m].amount} decimals projected={data.grand[m].estimated} className="text-[12.5px] font-bold sm:text-[13.5px]" /> : <span className="text-ink-3">–</span>}
                  </td>
                ))}
                <TotalCell cells={data.grand} months={months} bold />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {bottomAdd && (
        <Button size="sm" className="mt-3" icon={<Plus className="h-4 w-4" />} onClick={bottomAdd.run}>
          {bottomAdd.label}
        </Button>
      )}
      {legend}
      {footnote && <p className="mt-2 text-[12.5px] text-ink-3">{footnote}</p>}
      <p className="sr-only">Amounts in {formatMoney(0, ctx).replace(/[\d.,\s]/g, "") || ctx.currency}.</p>
    </div>
  );
}
