"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { addMonths, formatDate } from "@/lib/dates";
import { simulatePrepayment } from "@/lib/engine/loans";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useUI } from "@/lib/ui";
import { Button } from "../ui/button";
import { AmountInput, DateInput, Field } from "../ui/form";
import { KV, Segmented } from "../ui/misc";
import { Sheet } from "../ui/sheet";

/** "Payment plan" (month-by-month principal / interest) and "Pay extra" (interest saved, new end date) for one loan. */
export function LoanPlanSheet({ loanId, view: initial = "plan", onClose }: { loanId: string; view?: "plan" | "extra"; onClose: () => void }) {
  const { ds, positions, today, ctx } = useFinance();
  const lp = positions.loans.get(loanId);
  const [view, setView] = useState<"plan" | "extra">(initial);
  const [extra, setExtra] = useState<number | null>(null);
  const [on, setOn] = useState(addMonths(today, 1));
  const sim = useMemo(() => (lp && extra && extra > 0 ? simulatePrepayment(lp.loan, ds.transactions, { date: on, amount: extra }) : null), [lp, extra, on, ds.transactions]);
  if (!lp) return null;
  const { loan, state } = lp;
  const m = (n: number) => formatMoney(n, ctx, { decimals: true });
  return (
    <Sheet
      open
      onClose={onClose}
      title={loan.name}
      description={`${m(state.outstanding)} still to pay · ${state.remainingInstallments} EMIs left · last EMI ${formatDate(state.endDate)}`}
      size="lg"
      footer={
        view === "extra" ? (
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>Close</Button>
            <Button
              variant="primary"
              disabled={!extra}
              onClick={() => {
                onClose();
                useUI.getState().openTx({ type: "loan_prepayment", loan_id: loan.id, account_id: loan.payment_account_id, amount: extra ?? undefined, date: on <= today ? on : today });
              }}
            >
              Record this extra payment
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                onClose();
                useUI.getState().openEditor("loan", loan.id);
              }}
            >
              Edit EMI
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        )
      }
    >
      <Segmented
        size="sm"
        options={[
          { id: "plan", label: "Payment plan" },
          { id: "extra", label: "Pay extra" },
        ]}
        value={view}
        onChange={setView}
      />
      {view === "plan" ? (
        <div className="mt-3 max-h-[60dvh] overflow-auto rounded-xl border border-line">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-surface-2 text-left text-[12px] text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 text-right font-medium">EMI</th>
                <th className="px-3 py-2 text-right font-medium">Loan part</th>
                <th className="px-3 py-2 text-right font-medium">Interest</th>
                <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Left after</th>
              </tr>
            </thead>
            <tbody className="num">
              {state.schedule.map((s) => (
                <tr key={s.index} className={cn("border-t border-line", s.index < state.paidCount ? "text-ink-3" : s.index === state.paidCount ? "bg-surface-2 font-semibold" : "")}>
                  <td className="px-3 py-1.5">
                    {s.index + 1}
                    {s.index < state.paidCount ? " ✓" : ""}
                  </td>
                  <td className="px-3 py-1.5">{formatDate(s.date)}</td>
                  <td className="px-3 py-1.5 text-right">{m(s.emi)}</td>
                  <td className="px-3 py-1.5 text-right">{m(s.principal)}</td>
                  <td className="px-3 py-1.5 text-right">{m(s.interest)}</td>
                  <td className="hidden px-3 py-1.5 text-right sm:table-cell">{m(s.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Field label="Extra amount" htmlFor="v2-extra">
              <AmountInput id="v2-extra" value={extra} onChange={setExtra} />
            </Field>
            <Field label="On" htmlFor="v2-extra-on">
              <DateInput id="v2-extra-on" value={on} onChange={(e) => setOn(e.target.value)} />
            </Field>
          </div>
          <div className="rounded-xl bg-surface-2 p-4">
            {sim ? (
              <>
                <KV k="Interest you save" v={<span className="projected">{m(sim.interestSaved)}</span>} />
                <KV k="EMIs fewer" v={sim.monthsSaved} />
                <KV k="New last EMI" v={<span className="projected">{formatDate(sim.newEndDate)}</span>} />
                <KV k="Was" v={formatDate(sim.oldEndDate)} />
                <p className="mt-2 text-[12px] text-ink-3">Estimate. Assumes the EMI stays the same and the loan ends sooner.</p>
              </>
            ) : (
              <p className="text-[13.5px] text-ink-2">Type an amount to see how much interest and how many EMIs an extra payment saves.</p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
