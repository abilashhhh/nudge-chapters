"use client";

import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import type { Transaction } from "@/lib/types";
import { Switch } from "./ui/form";

/** "Money's already in my bank account" switch plus the list of bank entries it could be. */
export function BankMatchPicker({
  dir,
  on,
  setOn,
  matches,
  picked,
  setPicked,
  amount,
}: {
  dir: "in" | "out";
  on: boolean;
  setOn: (v: boolean) => void;
  matches: Transaction[];
  picked: string | null;
  setPicked: (id: string | null) => void;
  amount?: number | null;
}) {
  const { ds, ctx } = useFinance();
  const m = (n: number) => formatMoney(n, ctx, { decimals: true });
  const sel = matches.find((t) => t.id === picked) ?? null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <Switch
        checked={on}
        onChange={(v) => {
          setOn(v);
          if (!v) setPicked(null);
          else if (matches[0] && !picked) setPicked(matches[0].id);
        }}
        label={dir === "in" ? "Money's already in my bank account" : "Already taken from my bank account"}
        help={on ? undefined : "Turn on if your bank balance already shows it (for example, added from a bank SMS), so it isn't counted twice."}
      />
      {on && (
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Which bank entry is it?">
          <p className="text-[12.5px] text-ink-3">{matches.length ? "Which entry in your bank account is it?" : "No matching bank entry nearby — it'll be saved without changing your balance."}</p>
          {matches.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={picked === t.id}
              onClick={() => setPicked(t.id)}
              className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-[13px]", picked === t.id ? "border-brand bg-brand/10" : "border-line hover:border-line-strong")}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{t.description || (dir === "in" ? "Money received" : "Payment")}</span>
                <span className="block text-[11.5px] text-ink-3">
                  {formatDate(t.date, "short")} · {ds.accounts.find((a) => a.id === t.account_id)?.name ?? "Account"}
                  {(t.tags ?? []).some((g) => g.startsWith("sms:")) ? " · from bank SMS" : ""}
                </span>
              </span>
              <span className="num shrink-0 font-semibold">{m(t.amount)}</span>
            </button>
          ))}
          {matches.length > 0 && (
            <button type="button" role="radio" aria-checked={picked === null} onClick={() => setPicked(null)} className={cn("rounded-lg border px-3 py-2 text-left text-[13px]", picked === null ? "border-brand bg-brand/10" : "border-line hover:border-line-strong")}>
              None of these — just don&apos;t change my balance
            </button>
          )}
          {sel && amount != null && sel.amount - amount > 0.5 && <p className="text-[12px] text-ink-3">The bank entry is {m(sel.amount)}: {m(amount)} goes here and the other {m(sel.amount - amount)} stays as it was.</p>}
          {sel && amount != null && amount - sel.amount > 0.5 && <p className="text-[12px] text-ink-3">Only {m(sel.amount)} reached your bank, so that&apos;s what will be recorded.</p>}
        </div>
      )}
    </div>
  );
}
