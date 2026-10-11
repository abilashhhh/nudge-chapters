"use client";

import { AlertTriangle, Check, PiggyBank, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { addDays, formatDate } from "@/lib/dates";
import { FREQUENCY_LABEL } from "@/lib/engine/defaults";
import type { FinEvent } from "@/lib/engine/events";
import { nextOccurrenceAfter } from "@/lib/engine/schedule";
import { useFinance, useMonthMetrics } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import type { RecurringRule } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { Money } from "../money";
import { Button } from "../ui/button";
import { AmountInput } from "../ui/form";
import { EmptyState } from "../ui/misc";
import { MonthPicker } from "../ui/month-picker";
import { V2PageHeader } from "./ui";

function nextDate(r: RecurringRule, today: string): string | null {
  if (!r.active) return null;
  if (r.frequency === "once") return r.start_date >= today ? r.start_date : null;
  if (r.start_date >= today) return r.start_date;
  const n = nextOccurrenceAfter(r, addDays(today, -1));
  if (n && r.end_date && n > r.end_date) return null;
  return n;
}

export function BudgetsScreen() {
  const { ds, today, ctx } = useFinance();
  const month = useMonthMetrics();
  const ui = useUI.getState();
  const budgets = month.budgets.filter((b) => b.budget);
  const limit = budgets.reduce((s, b) => s + (b.budget?.limit ?? 0), 0);
  const spent = budgets.reduce((s, b) => s + (b.budget?.spent ?? 0), 0);
  const planned = ds.recurring_rules.filter((r) => r.kind === "expense" && r.frequency === "once" && r.start_date >= addDays(today, -31)).sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  const repeating = ds.recurring_rules.filter((r) => (r.kind === "expense" && r.is_fixed && r.frequency !== "once") || r.kind === "transfer");
  const where = (r: RecurringRule) => (r.card_id ? ds.credit_cards.find((c) => c.id === r.card_id)?.name : ds.accounts.find((a) => a.id === r.account_id)?.name) ?? "Choose when paying";
  const m = (n: number) => formatMoney(n, ctx);

  return (
    <>
      <V2PageHeader
        title="Budgets & spending plans"
        meaning="Monthly limits per category, bills that repeat, and one-off spends you're planning."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("rule", undefined, { kind: "expense", is_fixed: false, name: "Groceries", category: "Groceries", frequency: "monthly" })}>
            New budget
          </Button>
        }
      />
      <MonthPicker today={today} className="mb-4" />

      <h2 className="mb-2 text-[16px] font-semibold">Budgets</h2>
      {budgets.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No budgets for this month" body="Set a monthly limit for groceries, eating out, fuel or shopping — e.g. Groceries ₹8,000 a month." />
      ) : (
        <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
          <table className="v2-table w-full min-w-[46rem] text-[13.5px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 text-right font-medium">Monthly limit</th>
                <th className="px-3 py-2.5 text-right font-medium">Spent</th>
                <th className="px-3 py-2.5 text-right font-medium">Left</th>
                <th className="px-3 py-2.5 text-right font-medium">Used</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="num">
              {budgets.map((b) => (
                <BudgetRow key={b.key} b={b} />
              ))}
            </tbody>
            <tfoot className="num">
              <tr className="border-t-2 border-ink font-bold">
                <td className="px-3 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right">{m(limit)}</td>
                <td className="px-3 py-2.5 text-right">{m(spent)}</td>
                <td className={cn("px-3 py-2.5 text-right", limit - spent < 0 && "text-danger")}>{m(limit - spent)}</td>
                <td className="px-3 py-2.5 text-right">{limit > 0 ? `${Math.round((spent / limit) * 100)}%` : "–"}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold">Bills that repeat</h2>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("rule", undefined, { kind: "expense", is_fixed: true, name: "", frequency: "monthly" })}>
          Add a repeating bill
        </Button>
      </div>
      <p className="mb-2 text-[13px] text-ink-3">Rent, phone, Netflix, insurance — and money you move between your accounts every month.</p>
      {repeating.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-ink-2">No repeating bills yet.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
          <table className="v2-table w-full min-w-[40rem] text-[13.5px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-3 py-2.5 font-medium">What</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 font-medium">Repeats</th>
                <th className="px-3 py-2.5 font-medium">Next</th>
                <th className="px-3 py-2.5 font-medium">Pay from</th>
              </tr>
            </thead>
            <tbody>
              {repeating.map((r) => {
                const nd = nextDate(r, today);
                return (
                  <tr key={r.id} className={cn("border-t border-line", !r.active && "text-ink-3")}>
                    <td className="px-3 py-2.5">
                      <button type="button" className={cn("text-left font-medium hover:underline", !r.active && "line-through")} onClick={() => ui.openEditor("rule", r.id)}>
                        {r.name}
                      </button>
                      {r.kind === "transfer" && <span className="block text-[11.5px] text-ink-3">Move money between my accounts</span>}
                      {!r.active && <span className="block text-[11.5px]">Paused</span>}
                    </td>
                    <td className="num px-3 py-2.5 text-right">
                      <Money value={r.amount} decimals />
                    </td>
                    <td className="px-3 py-2.5">{FREQUENCY_LABEL[r.frequency] ?? r.frequency}</td>
                    <td className="num px-3 py-2.5">{nd ? formatDate(nd, "short") : "–"}</td>
                    <td className="px-3 py-2.5 text-ink-2">{where(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold">Planned one-off spends</h2>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("rule", undefined, { frequency: "once", kind: "expense", name: "" })}>
          Plan a spend
        </Button>
      </div>
      <p className="mb-2 text-[13px] text-ink-3">Something you'll pay once — a trip, a gift, a repair. It's kept aside in that month.</p>
      {planned.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-ink-2">Nothing planned.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
          <table className="v2-table w-full min-w-[30rem] text-[13.5px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">What</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 font-medium">Pay from</th>
              </tr>
            </thead>
            <tbody>
              {planned.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="num whitespace-nowrap px-3 py-2.5">{formatDate(r.start_date, "short")}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => ui.openEditor("rule", r.id)}>
                      {r.name}
                    </button>
                  </td>
                  <td className="num px-3 py-2.5 text-right">
                    <Money value={r.amount} decimals projected={r.start_date > today} />
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{where(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function BudgetRow({ b }: { b: FinEvent }) {
  const { ds, ctx } = useFinance();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<number | null>(b.budget?.limit ?? null);
  const limit = b.budget?.limit ?? 0;
  const spent = b.budget?.spent ?? 0;
  const left = limit - spent;
  const used = limit > 0 ? spent / limit : 0;
  const state = used > 1 ? "over" : used >= 0.85 ? "near" : "ok";
  const override = ds.event_overrides.find((o) => o.source_type === "rule" && o.source_id === b.sourceId && o.occurrence_date === b.occurrence);
  const rule = ds.recurring_rules.find((r) => r.id === b.sourceId);
  const m = (n: number) => formatMoney(n, ctx);

  const saveMonth = async () => {
    if (amount == null) return;
    const s = useStore.getState();
    const body = { source_type: "rule" as const, source_id: b.sourceId, occurrence_date: b.occurrence, action: "adjust" as const, new_amount: amount, new_date: null };
    if (override) await s.patch("event_overrides", override.id, body);
    else await s.add("event_overrides", body);
    setEditing(false);
  };

  return (
    <tr className="border-t border-line align-top">
      <td className="px-3 py-2.5">
        <span className="font-medium">{rule?.category ?? b.title}</span>
        {override && <span className="block text-[11.5px] text-ink-3">Changed for this month</span>}
      </td>
      <td className="px-3 py-2.5 text-right">
        {editing ? (
          <div className="flex items-center justify-end gap-1">
            <div className="w-32">
              <AmountInput ariaLabel="Limit for this month" value={amount} onChange={setAmount} currency={ctx.currency} />
            </div>
          </div>
        ) : (
          m(limit)
        )}
      </td>
      <td className="px-3 py-2.5 text-right">{m(spent)}</td>
      <td className={cn("px-3 py-2.5 text-right font-semibold", left < 0 ? "text-danger" : "")}>{m(left)}</td>
      <td className="px-3 py-2.5 text-right">{Math.round(used * 100)}%</td>
      <td className="px-3 py-2.5">
        {state === "ok" ? (
          <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ok">
            <Check className="h-3.5 w-3.5" aria-hidden /> OK
          </span>
        ) : (
          <span className={cn("inline-flex items-center gap-1 text-[12.5px] font-medium", state === "over" ? "text-danger" : "text-warn")}>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {state === "over" ? "Over" : "Nearly used"}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5">
        {editing ? (
          <div className="flex gap-1">
            <Button size="sm" variant="primary" onClick={saveMonth}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" onClick={() => useUI.getState().openTx({ type: "expense", category: rule?.category ?? b.category ?? null })}>
              Add spend
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Change for this month
            </Button>
            {rule && (
              <Button size="sm" variant="ghost" onClick={() => useUI.getState().openEditor("rule", rule.id)}>
                Edit
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
