"use client";

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronLeft, CreditCard, Landmark, LineChart, PiggyBank, Scale, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useFinance } from "@/lib/finance";
import { useUI } from "@/lib/ui";
import { Sheet } from "../ui/sheet";

type Tile = { icon: typeof ArrowUpRight; label: string; hint: string; run: () => void };

/** Version 2 "Add" sheet: eight plain choices instead of twelve. */
export function V2QuickAddSheet() {
  const open = useUI((s) => s.quickOpen);
  const close = useUI((s) => s.closeQuick);
  const { ds } = useFinance();
  const [step, setStep] = useState<"main" | "chit-sip">("main");
  useEffect(() => {
    if (!open) setStep("main");
  }, [open]);
  const { openTx, openEditor } = useUI.getState();
  const hasChits = ds.chits.some((c) => c.status === "active");
  const hasSips = ds.investments.some((i) => !i.archived && i.sip_active && i.sip_amount > 0);

  const main: Tile[] = [
    { icon: ArrowUpRight, label: "Spent money", hint: "From bank, cash or card", run: () => openTx({ type: "expense" }) },
    { icon: ArrowDownLeft, label: "Got money", hint: "Salary, freelance, gift…", run: () => openTx({ type: "income", category: "Salary" }) },
    { icon: CreditCard, label: "Pay card bill", hint: "Clears your card", run: () => openTx({ type: "card_payment" }) },
    { icon: Landmark, label: "Pay EMI / loan", hint: "Monthly loan payment", run: () => openTx({ type: "loan_emi" }) },
    {
      icon: PiggyBank,
      label: "Pay chit / SIP",
      hint: "Chit or monthly investment",
      run: () => {
        if (hasChits && !hasSips) openTx({ type: "chit_installment" });
        else if (hasSips && !hasChits) openTx({ type: "invest_buy" });
        else setStep("chit-sip");
      },
    },
    { icon: Users, label: "Lent / borrowed", hint: "Who owes whom, and when", run: () => openEditor("lending") },
    { icon: ArrowLeftRight, label: "Move money", hint: "Between my accounts", run: () => openTx({ type: "transfer" }) },
    { icon: Scale, label: "Fix balance", hint: "Match your bank app", run: () => openTx({ type: "adjustment" }) },
  ];
  const chitSip: Tile[] = [
    { icon: PiggyBank, label: "Chit payment", hint: "This month's chit", run: () => openTx({ type: "chit_installment" }) },
    { icon: LineChart, label: "Monthly investment (SIP)", hint: "Money into a fund", run: () => openTx({ type: "invest_buy" }) },
  ];
  const tiles = step === "main" ? main : chitSip;

  return (
    <Sheet open={open} onClose={close} title={step === "main" ? "Add" : "Pay chit or SIP"} size="md">
      {step !== "main" && (
        <button type="button" onClick={() => setStep("main")} className="mb-3 inline-flex items-center gap-1 text-[13.5px] font-medium text-ink-2 hover:text-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Back
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={it.run}
            className="flex min-h-20 flex-col items-start gap-1 rounded-2xl border border-line bg-surface-2 p-3 text-left transition-colors hover:border-line-strong hover:bg-surface"
          >
            <it.icon className="h-5 w-5 text-brand" aria-hidden />
            <span className="text-[14.5px] font-semibold leading-tight">{it.label}</span>
            <span className="text-[12.5px] leading-tight text-ink-3">{it.hint}</span>
          </button>
        ))}
      </div>
      {step === "main" && (
        <p className="mt-3 text-[12.5px] text-ink-3">
          Repeating bills and planned one-off spends are added in Menu → Budgets &amp; spending plans.
        </p>
      )}
    </Sheet>
  );
}
