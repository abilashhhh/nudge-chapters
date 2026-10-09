"use client";

import { PiggyBank, Plus, Undo2 } from "lucide-react";
import { useState } from "react";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/form";
import { EmptyState, Panel, Progress } from "@/components/ui/misc";
import { MonthPicker } from "@/components/ui/month-picker";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import type { FinEvent } from "@/lib/engine/events";
import { useFinance, useMonthMetrics } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { useVisual } from "@/lib/visual";

export default function BudgetsPage() {
  const { today, ctx } = useFinance();
  const month = useMonthMetrics();
  const budgets = month.budgets.filter((b) => b.budget);
  const limit = budgets.reduce((s, b) => s + (b.budget?.limit ?? 0), 0);
  const spent = budgets.reduce((s, b) => s + (b.budget?.spent ?? 0), 0);
  const used = limit > 0 ? spent / limit : 0;
  return (
    <>
      <PageHeader
        title="Budgets"
        description="Set a monthly limit per category and watch what's left go down as you spend. Refunds give budget back; purchases you make for others never count."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => useUI.getState().openEditor("rule", undefined, { kind: "expense", is_fixed: false, name: "Groceries", category: "Groceries", frequency: "monthly" })}
          >
            New budget
          </Button>
        }
      />
      <MonthPicker today={today} className="mb-4" />
      {budgets.length === 0 ? (
        <EmptyState icon={PiggyBank} title="No budgets for this month" body="Create one for groceries, eating out, fuel or shopping — e.g. Groceries ₹5,000 a month." />
      ) : (
        <>
          <div className="anim-rise mb-4 rounded-2xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[13px] text-ink-3">All budgets · {formatDate(month.from, "medium").slice(3)}</p>
              <p className="num text-[13px] text-ink-2">
                {formatMoney(spent, ctx)} of {formatMoney(limit, ctx)} · {Math.round(used * 100)}% used
              </p>
            </div>
            <Money value={Math.max(0, limit - spent)} className="display block text-[28px] font-semibold" />
            <p className="text-[12.5px] text-ink-3">left to spend</p>
            <Progress className="mt-2" value={Math.min(1, used)} tone={used > 1 ? "danger" : used > 0.85 ? "warn" : "brand"} label="All budgets used" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {budgets.map((b) => (
              <BudgetCard key={b.key} b={b} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function BudgetCard({ b }: { b: FinEvent }) {
  const { ds, ctx } = useFinance();
  const v = useVisual();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<number | null>(b.budget?.limit ?? null);
  const limit = b.budget?.limit ?? 0;
  const spent = b.budget?.spent ?? 0;
  const left = limit - spent;
  const used = limit > 0 ? spent / limit : 0;
  const state = used > 1 ? "over" : used >= 0.85 ? "near" : "ok";
  const icon = !v.spendIcons ? "" : state === "over" ? "😟 " : state === "near" ? "⚠️ " : used === 0 ? "🌱 " : "🙂 ";
  const override = ds.event_overrides.find((o) => o.source_type === "rule" && o.source_id === b.sourceId && o.occurrence_date === b.occurrence);
  const rule = ds.recurring_rules.find((r) => r.id === b.sourceId);

  const saveMonth = async () => {
    if (amount == null) return;
    const s = useStore.getState();
    const body = { source_type: "rule" as const, source_id: b.sourceId, occurrence_date: b.occurrence, action: "adjust" as const, new_amount: amount, new_date: null };
    if (override) await s.patch("event_overrides", override.id, body);
    else await s.add("event_overrides", body);
    setEditing(false);
  };
  return (
    <div className={cn("anim-rise rounded-2xl border bg-surface p-4", state === "over" ? "border-danger/40" : state === "near" ? "border-warn/40" : "border-line")}>
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={() => useUI.getState().openEvent(b.key)}>
          <p className="truncate text-[15px] font-semibold hover:underline">
            {icon}
            {b.title}
          </p>
          <p className="text-[12px] text-ink-3">
            {formatDate(b.date, "short")} – {formatDate(b.budget!.periodEnd, "short")}
            {override ? " · adjusted for this month" : ""}
          </p>
        </button>
        <span className="num shrink-0 text-[12.5px] text-ink-2">{Math.round(used * 100)}%</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[12.5px]">
        <div>
          <p className="text-ink-3">Budget</p>
          <p className="num font-semibold">{formatMoney(limit, ctx)}</p>
        </div>
        <div>
          <p className="text-ink-3">Spent</p>
          <p className="num font-semibold">{formatMoney(spent, ctx)}</p>
        </div>
        <div>
          <p className="text-ink-3">{left >= 0 ? "Remaining" : "Over by"}</p>
          <p className={cn("num font-semibold", left < 0 ? "text-danger" : "text-ok")}>{formatMoney(Math.abs(left), ctx)}</p>
        </div>
      </div>
      <Progress className="mt-2" value={Math.min(1, used)} tone={state === "over" ? "danger" : state === "near" ? "warn" : "brand"} label={`${b.title} used`} />
      {state !== "ok" && (
        <p className={cn("mt-2 text-[12px]", state === "over" ? "text-danger" : "text-warn")}>
          {state === "over" ? "Over budget — try to hold off on more spending here this month." : "Nearly used up — keep an eye on this one."}
        </p>
      )}
      {editing ? (
        <div className="mt-3 flex items-end gap-2">
          <AmountInput aria-label="Budget for this month" value={amount} onChange={setAmount} currency={ctx.currency} />
          <Button size="sm" variant="primary" onClick={saveMonth}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => useUI.getState().openTx({ type: "expense", category: rule?.category ?? b.category ?? null })}>
            Add spend
          </Button>
          <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => useUI.getState().openTx({ type: "income", category: rule?.category ?? b.category ?? null, description: `Refund · ${b.title}`, tags: ["refund"] })}>
            Refund
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change for this month
          </Button>
          {rule && (
            <Button size="sm" variant="ghost" onClick={() => useUI.getState().openEditor("rule", rule.id)}>
              Edit budget
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
