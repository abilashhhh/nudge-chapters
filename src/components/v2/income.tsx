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
import { Cell2, DataTable, Details } from "./data-table";

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
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={add}>
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add income</span>
          </Button>
        }
      />
      {rules.length === 0 ? (
        <EmptyState icon={Briefcase} title="No income added yet" body="Add your salary (and freelance, rent or interest) with the day it comes in. It then shows up month by month below." />
      ) : (
        <div className="mb-6">
          <DataTable
            label="Income sources"
            rows={rules}
            rowKey={(r) => r.id}
            rowClassName={(r) => (!r.active ? "text-ink-3" : undefined)}
            columns={[
              { key: "s", header: "Source", cell: (r) => <Cell2 main={r.name} sub={!r.active ? "Stopped" : r.day_of_month ? `Every ${r.day_of_month} · ${acct(r.account_id)}` : acct(r.account_id)} /> },
              { key: "a", header: "Amount", align: "right", cell: (r) => <Money value={r.amount} decimals projected={r.certainty !== "known"} className="font-semibold" /> },
            ]}
            details={(r) => (
              <Details
                items={[
                  ["Type", r.category ?? "Other"],
                  ["Repeats", FREQUENCY_LABEL[r.frequency] ?? r.frequency],
                  ["Into account", acct(r.account_id)],
                  ["Ends", r.end_date ?? "No end date"],
                ]}
                actions={
                  <>
                    <Button size="sm" onClick={() => patch("recurring_rules", r.id, { active: !r.active })}>
                      {r.active ? "Stop it" : "Start again"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => ui.openEditor("rule", r.id)}>
                      Edit
                    </Button>
                  </>
                }
              />
            )}
          />
        </div>
      )}
      <h2 className="mb-2 text-[16px] font-semibold">Month by month</h2>
      <MonthGrid
        data={data}
        nameHeader="Source"
        forHeader={null}
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

