"use client";

import { ArrowDownLeft, Plus, TriangleAlert, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, KV, Panel, Progress } from "@/components/ui/misc";
import { formatDate } from "@/lib/dates";
import { owedSummary, reimbursements, type ReimbursementGroup, type ReimbursementStatus } from "@/lib/engine/reimburse";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useUI } from "@/lib/ui";

const STATUS: Record<ReimbursementStatus, { label: string; tone: "future" | "brand" | "danger" | "neutral" }> = {
  active: { label: "Active", tone: "future" },
  completed: { label: "Completed", tone: "brand" },
  overdue: { label: "Overdue", tone: "danger" },
  written_off: { label: "Written off", tone: "neutral" },
};

export default function OwedPage() {
  const { ds, positions, today, events, ctx } = useFinance();
  const groups = useMemo(() => reimbursements(ds, positions, today, events), [ds, positions, today, events]);
  const sum = owedSummary(groups);
  return (
    <>
      <PageHeader
        title="Owed to you"
        description="Money you paid for others — a friend's laptop on your card, a split bill, a loan. None of it counts as your spending or income; card EMIs you pay for them still count towards your card bill."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("lending", undefined, { direction: "lent" })}>
            Add
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { k: "Outstanding", v: sum.outstanding, note: "owed − repaid − written off" },
          { k: "Due already", v: sum.overdue, note: "expected date has passed" },
          { k: "Scheduled", v: sum.scheduled, note: "future EMIs / dates" },
          { k: "Repaid so far", v: sum.received, note: `of ${formatMoney(sum.total, ctx)} in total` },
        ].map((c) => (
          <div key={c.k} className="anim-rise rounded-2xl border border-line bg-surface p-4">
            <p className="text-[12.5px] text-ink-3">{c.k}</p>
            <Money value={c.v} className="display block text-[22px] font-semibold" />
            <p className="text-[11.5px] text-ink-3">{c.note}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {groups.length === 0 ? (
          <EmptyState icon={Users} title="Nobody owes you money" body="When someone uses your card or you pay for them, add it here so it stays out of your own spending." />
        ) : (
          groups.map((g) => <Group key={g.key} g={g} />)
        )}
      </div>
    </>
  );
}

function Group({ g }: { g: ReimbursementGroup }) {
  const { ctx, today } = useFinance();
  const [open, setOpen] = useState(false);
  const st = STATUS[g.status];
  const m = (n: number) => formatMoney(n, ctx);
  const nextItem = g.items.find((i) => i.outstanding > 0.5);
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {g.person} <Badge tone={st.tone}>{st.label}</Badge>
        </span>
      }
      description={g.description}
      action={
        nextItem ? (
          <Button
            size="sm"
            icon={<ArrowDownLeft className="h-4 w-4" />}
            onClick={() => useUI.getState().openTx({ type: "lend_repayment", lending_id: nextItem.lending.id, account_id: nextItem.lending.account_id, amount: nextItem.outstanding })}
          >
            Got repaid
          </Button>
        ) : undefined
      }
    >
      <div className="flex items-baseline justify-between">
        <Money value={g.outstanding} className="display text-[24px] font-semibold text-ok" />
        <span className="num text-[13px] text-ink-3">of {m(g.total)}</span>
      </div>
      <Progress className="mt-2" value={g.total > 0 ? (g.received + g.writtenOff) / g.total : 0} label={`${g.person} repaid`} />
      <div className="mt-3 grid grid-cols-1 gap-x-6 text-[13px] sm:grid-cols-2">
        <KV k="Total owed" v={m(g.total)} />
        <KV k="Repaid" v={m(g.received)} />
        {g.writtenOff > 0 && <KV k="Written off" v={m(g.writtenOff)} />}
        <KV k="Outstanding" v={m(g.outstanding)} />
        <KV k="Next repayment" v={g.next ? `${m(g.next.amount)} · ${formatDate(g.next.date, "short")}` : "—"} />
        <KV k="Type" v={g.recurring ? "Recurring repayments" : "One-time"} />
      </div>
      {g.cardRisk && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Your {g.cardRisk.card} bill is due {formatDate(g.cardRisk.billDate, "short")}, before {g.person}&apos;s repayment on {formatDate(g.cardRisk.repaymentDate, "short")}. Keep enough to pay the bank on time.
        </p>
      )}
      <button type="button" className="mt-3 text-[13px] font-medium text-future-ink hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide schedule & history" : "Schedule & history"}
      </button>
      {open && (
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <ul className="divide-y divide-line text-[13px]">
            {g.items.map((i) => {
              const due = i.lending.expected_date ?? i.lending.date;
              const late = i.outstanding > 0.5 && due < today;
              return (
                <li key={i.lending.id} className="flex items-center justify-between gap-2 py-1.5">
                  <button type="button" className="min-w-0 truncate text-left hover:underline" onClick={() => useUI.getState().openEditor("lending", i.lending.id)}>
                    {i.lending.person} <span className="text-ink-3">· {formatDate(due, "short")}</span>
                  </button>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="num">{m(i.lending.amount)}</span>
                    <Badge tone={i.status === "settled" ? "brand" : i.status === "written_off" ? "neutral" : late ? "danger" : "future"}>
                      {i.status === "settled" ? "Paid" : i.status === "written_off" ? "Written off" : late ? "Overdue" : i.repaid > 0 ? "Part paid" : "Expected"}
                    </Badge>
                  </span>
                </li>
              );
            })}
          </ul>
          <div>
            <p className="text-[12.5px] font-semibold text-ink-2">Repayment history</p>
            {g.history.filter((t) => t.type === "lend_repayment").length === 0 ? (
              <p className="mt-1 text-[12.5px] text-ink-3">No repayments recorded yet.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line text-[13px]">
                {g.history
                  .filter((t) => t.type === "lend_repayment")
                  .map((t) => (
                    <li key={t.id} className="flex justify-between py-1.5">
                      <span>{formatDate(t.date, "short")}</span>
                      <span className="num text-ok">+{m(t.amount)}</span>
                    </li>
                  ))}
              </ul>
            )}
            {g.loans.length > 0 && (
              <p className="mt-3 text-[12px] text-ink-3">
                Linked card EMI{g.loans.length > 1 ? "s" : ""}: {g.loans.map((l) => l.name).join(", ")}. These EMIs stay on your card bill but are excluded from your spending, budgets and EMI totals.
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
