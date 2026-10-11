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
import { Cell2, DataTable, Details } from "./data-table";
import { V2PageHeader } from "./ui";

function nextDate(r: RecurringRule, today: string): string | null {
  if (!r.active) return null;
  if (r.frequency === "once") return r.start_date >= today ? r.start_date : null;
  if (r.start_date >= today) return r.start_date;
  const n = nextOccurrenceAfter(r, addDays(today, -1));
  if (n && r.end_date && n > r.end_date) return null;
  return n;
}

function budgetState(b: FinEvent) {
  const limit = b.budget?.limit ?? 0;
  const spent = b.budget?.spent ?? 0;
  const used = limit > 0 ? spent / limit : 0;
  return { limit, spent, left: limit - spent, used, state: used > 1 ? "over" : used >= 0.85 ? "near" : "ok" };
}

function BudgetStatus({ b }: { b: FinEvent }) {
  const { state } = budgetState(b);
  return state === "ok" ? (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ok">
      <Check className="h-3.5 w-3.5" aria-hidden /> OK
    </span>
  ) : (
    <span className={cn("inline-flex items-center gap-1 text-[12px] font-medium", state === "over" ? "text-danger" : "text-warn")}>
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {state === "over" ? "Over" : "Nearly used"}
    </span>
  );
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
  const ruleOf = (b: FinEvent) => ds.recurring_rules.find((r) => r.id === b.sourceId);

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
        <DataTable
          label="Budgets"
          rows={budgets}
          rowKey={(b) => b.key}
          columns={[
            { key: "c", header: "Category", cell: (b) => <Cell2 main={ruleOf(b)?.category ?? b.title} sub={<BudgetStatus b={b} />} /> },
            { key: "u", header: "Used", align: "right", cell: (b) => `${Math.round(budgetState(b).used * 100)}%` },
            {
              key: "l",
              header: "Left",
              align: "right",
              cell: (b) => <span className={cn("font-semibold", budgetState(b).left < 0 && "text-danger")}>{m(budgetState(b).left)}</span>,
            },
          ]}
          details={(b) => <BudgetDetails b={b} />}
          footer={["Total", limit > 0 ? `${Math.round((spent / limit) * 100)}%` : "–", <span key="l" className={cn(limit - spent < 0 && "text-danger")}>{m(limit - spent)}</span>]}
        />
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold">Bills that repeat</h2>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("rule", undefined, { kind: "expense", is_fixed: true, name: "", frequency: "monthly" })}>
          Add a repeating bill
        </Button>
      </div>
      <p className="mb-2 text-[13px] text-ink-3">Rent, phone, subscriptions, insurance — and money you move between your accounts every month.</p>
      {repeating.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-ink-2">No repeating bills yet.</p>
      ) : (
        <DataTable
          label="Bills that repeat"
          rows={repeating}
          rowKey={(r) => r.id}
          rowClassName={(r) => (!r.active ? "text-ink-3" : undefined)}
          columns={[
            { key: "w", header: "What", cell: (r) => <Cell2 main={<span className={cn(!r.active && "line-through")}>{r.name}</span>} sub={!r.active ? "Paused" : r.kind === "transfer" ? "Move money" : undefined} /> },
            { key: "n", header: "Next", cell: (r) => (nextDate(r, today) ? formatDate(nextDate(r, today), "short") : "–") },
            { key: "a", header: "Amount", align: "right", cell: (r) => <Money value={r.amount} decimals className="font-semibold" /> },
          ]}
          details={(r) => (
            <Details
              items={[
                ["Repeats", FREQUENCY_LABEL[r.frequency] ?? r.frequency],
                ["Pay from", where(r)],
                ...(r.category ? ([["What for", r.category]] as [string, string][]) : []),
              ]}
              actions={
                <Button size="sm" variant="ghost" onClick={() => ui.openEditor("rule", r.id)}>
                  Edit
                </Button>
              }
            />
          )}
        />
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[16px] font-semibold">Planned one-off spends</h2>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("rule", undefined, { frequency: "once", kind: "expense", name: "" })}>
          Plan a spend
        </Button>
      </div>
      <p className="mb-2 text-[13px] text-ink-3">Something you&apos;ll pay once — a trip, a gift, a repair. It&apos;s kept aside in that month.</p>
      {planned.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-ink-2">Nothing planned.</p>
      ) : (
        <DataTable
          label="Planned one-off spends"
          rows={planned}
          rowKey={(r) => r.id}
          columns={[
            { key: "d", header: "Date", cell: (r) => formatDate(r.start_date, "short") },
            { key: "w", header: "What", cell: (r) => r.name },
            { key: "a", header: "Amount", align: "right", cell: (r) => <Money value={r.amount} decimals projected={r.start_date > today} className="font-semibold" /> },
          ]}
          details={(r) => (
            <Details
              items={[["Pay from", where(r)]]}
              actions={
                <Button size="sm" variant="ghost" onClick={() => ui.openEditor("rule", r.id)}>
                  Edit
                </Button>
              }
            />
          )}
        />
      )}
    </>
  );
}

function BudgetDetails({ b }: { b: FinEvent }) {
  const { ds, ctx } = useFinance();
  const [editing, setEditing] = useState(false);
  const { limit, spent } = budgetState(b);
  const [amount, setAmount] = useState<number | null>(limit);
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
    <Details
      items={[
        ["Monthly limit", m(limit)],
        ["Spent", m(spent)],
        ["Period", `${formatDate(b.date, "short")} – ${formatDate(b.budget?.periodEnd, "short")}`],
        ...(override ? ([["Note", "Changed for this month"]] as [string, string][]) : []),
      ]}
      actions={
        editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <AmountInput ariaLabel="Limit for this month" value={amount} onChange={setAmount} currency={ctx.currency} />
            </div>
            <Button size="sm" variant="primary" onClick={saveMonth}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <Button size="sm" variant="primary" onClick={() => useUI.getState().openTx({ type: "expense", category: rule?.category ?? b.category ?? null })}>
              Add spend
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              Change for this month
            </Button>
            {rule && (
              <Button size="sm" variant="ghost" onClick={() => useUI.getState().openEditor("rule", rule.id)}>
                Edit
              </Button>
            )}
          </>
        )
      }
    />
  );
}
