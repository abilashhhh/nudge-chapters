"use client";

import { Banknote, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatMonthLong } from "@/lib/dates";
import { GROUP_LABEL, salaryDayPlan, type PlanGroup, type PlanLine } from "@/lib/engine/phase2";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { celebrate } from "@/lib/celebrate";
import { Button, LinkButton } from "./ui/button";
import { Panel } from "./ui/misc";

/** §2.1 — the month's plan, shown once salary is in. Accepting only records goal contributions; no money moves. */
export function SalaryPlanPanel({ monthOf, force = false }: { monthOf?: string; force?: boolean }) {
  const { ds, positions, today, ctx } = useFinance();
  const sp = useMemo(() => salaryDayPlan(ds, positions, today, monthOf ?? today, (n) => formatMoney(n, ctx)), [ds, positions, today, monthOf, ctx]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!force && (sp.status || sp.salaryReceived <= 0)) return null;
  const m = (n: number) => formatMoney(n, ctx);
  const groups = new Map<PlanGroup, PlanLine[]>();
  for (const l of sp.lines) groups.set(l.group, [...(groups.get(l.group) ?? []), l]);

  const record = (status: "accepted" | "skipped") =>
    useStore.getState().updatePrefs({ salaryPlans: { ...(ds.profile.preferences?.salaryPlans ?? {}), [sp.month]: { status, at: new Date().toISOString() } } });
  const accept = async () => {
    setBusy(true);
    try {
      for (const a of sp.plan.allocations) {
        if (Math.abs(a.recommended - a.goal.monthly_contribution) > 0.5) await useStore.getState().patch("goals", a.goal.id, { monthly_contribution: Math.round(a.recommended) });
      }
      await record("accepted");
      celebrate(["💰", "✅", "✨"]);
      toast.success("Plan saved for this month");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-brand" /> {sp.salaryReceived > 0 ? `Salary's in — here's your ${formatMonthLong(sp.month)} plan` : `Your ${formatMonthLong(sp.month)} plan`}
        </span>
      }
      description="Bills first, then card payments and EMIs, then goals by priority, then flexible money. Nothing moves until you do it yourself."
      className="anim-rise border-brand/30"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[12px] text-ink-3">Assigned this month</p>
          <p className="num text-[18px] font-semibold">{m(sp.assigned)}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-3">To goals</p>
          <p className="num text-[18px] font-semibold">{m(sp.plan.allocated)}</p>
        </div>
        <div>
          <p className="text-[12px] text-ink-3">Flexible</p>
          <p className="num text-[18px] font-semibold text-ok">{m(sp.flexible)}</p>
        </div>
      </div>
      <button type="button" className="mt-2 text-[13px] font-medium text-future-ink hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide the checklist" : "See the checklist"}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-3">
          {[...groups.entries()].map(([g, ls]) => (
            <div key={g}>
              <p className="flex justify-between text-[12.5px] font-semibold text-ink-2">
                <span>{GROUP_LABEL[g]}</span>
                <span className="num">{m(ls.reduce((s, l) => s + l.amount, 0))}</span>
              </p>
              <ul className="divide-y divide-line">
                {ls.map((l, i) => (
                  <li key={l.label + i}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 py-1.5 text-left text-[13px]"
                      onClick={() => (l.eventKey ? useUI.getState().openEvent(l.eventKey) : l.goalId ? useUI.getState().openEditor("goal", l.goalId) : undefined)}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
                          {l.label}
                        </span>
                        <span className="block pl-5 text-[11.5px] text-ink-3">{l.reason}</span>
                      </span>
                      <span className="num shrink-0">{m(l.amount)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" size="sm" loading={busy} onClick={accept}>
          Accept plan
        </Button>
        <LinkButton size="sm" href="/goals">
          Adjust
        </LinkButton>
        {!force && (
          <Button size="sm" variant="ghost" onClick={() => void record("skipped")}>
            Skip this month
          </Button>
        )}
        {force && sp.status && <span className="self-center text-[12px] text-ink-3">{sp.status === "accepted" ? "Accepted for this month ✓" : "Skipped this month"}</span>}
      </div>
      <p className="mt-2 text-[11.5px] text-ink-3">
        Accepting sets each goal&apos;s monthly contribution. <Link className="underline" href="/goals">See how goals are prioritised</Link>.
      </p>
    </Panel>
  );
}
