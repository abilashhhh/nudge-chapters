"use client";

import { Briefcase, Plus } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { FREQUENCY_LABEL } from "@/lib/engine/defaults";
import { useFinance } from "@/lib/finance";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { incomeGrid } from "@/lib/v2/grids";
import { Money } from "../money";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/misc";
import { MonthGrid, useGridMonths } from "./month-grid";
import { useRangeEvents, V2PageHeader } from "./ui";

export function IncomeScreen() {
  const { ds, today } = useFinance();
  const patch = useStore((s) => s.patch);
  const months = useGridMonths();
  const events = useRangeEvents(months);
  const data = useMemo(() => incomeGrid(ds, events, months, today), [ds, events, months, today]);
  const ui = useUI.getState();
  const rules = ds.recurring_rules.filter((r) => r.kind === "income");
  const acct = (id?: string | null) => (id ? ds.accounts.find((a) => a.id === id)?.name ?? "–" : "–");
  const add = () => ui.openEditor("rule", undefined, { kind: "income", category: "Salary", name: "", frequency: "monthly" });
  return (
    <>
      <V2PageHeader
        title="My jobs & income"
        meaning="Your salary and other money that comes in."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={add}>
            Add income
          </Button>
        }
      />
      {rules.length === 0 ? (
        <EmptyState icon={Briefcase} title="No income added yet" body="Add your salary (and freelance, rent or interest) with the day it comes in. It then shows up month by month below." />
      ) : (
        <div className="-mx-4 mb-6 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
          <table className="v2-table w-full min-w-[42rem] text-[13.5px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-3 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                <th className="px-3 py-2.5 font-medium">Pay day</th>
                <th className="px-3 py-2.5 font-medium">Into account</th>
                <th className="px-3 py-2.5 font-medium">Repeats</th>
                <th className="px-3 py-2.5 font-medium">Active</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={cn("border-t border-line", !r.active && "text-ink-3")}>
                  <td className="px-3 py-2.5">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => ui.openEditor("rule", r.id)}>
                      {r.name}
                    </button>
                    {r.end_date && <span className="block text-[11.5px] text-warn">Ends {r.end_date}</span>}
                  </td>
                  <td className="px-3 py-2.5">{r.category ?? "Other"}</td>
                  <td className="num px-3 py-2.5 text-right">
                    <Money value={r.amount} decimals projected={r.certainty !== "known"} />
                  </td>
                  <td className="px-3 py-2.5">{r.day_of_month ? `Every ${r.day_of_month}` : "–"}</td>
                  <td className="px-3 py-2.5">{acct(r.account_id)}</td>
                  <td className="px-3 py-2.5">{FREQUENCY_LABEL[r.frequency] ?? r.frequency}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.active}
                      aria-label={`${r.name} active`}
                      onClick={() => patch("recurring_rules", r.id, { active: !r.active })}
                      className={cn("rounded-full px-2.5 py-0.5 text-[12.5px] font-medium", r.active ? "bg-ok-soft text-ok" : "bg-surface-3 text-ink-3")}
                    >
                      {r.active ? "Yes" : "No"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="mb-2 text-[16px] font-semibold">Month by month</h2>
      <MonthGrid
        data={data}
        nameHeader="Source"
        forHeader="Type"
        grandLabel="All income"
        exportName="income"
        incoming
        onRow={(row) => row.ref?.kind === "rule" && ui.openEditor("rule", row.ref.id)}
        bottomAdd={{ label: "Add income", run: add }}
        empty={<p className="rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-ink-2">No income expected in these months.</p>}
        footnote="Tap this month's amount when the money arrives and mark it received (✓)."
      />
    </>
  );
}

