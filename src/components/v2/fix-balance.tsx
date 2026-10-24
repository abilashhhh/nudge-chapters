"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { Button } from "../ui/button";
import { AmountInput, Field, Select } from "../ui/form";
import { Sheet } from "../ui/sheet";

/** "Fix balance", wherever it's opened from: type what the bank app shows and the difference is recorded for you. */
export function FixBalanceHost() {
  const accountId = useUI((s) => s.fixBalance);
  const close = useUI((s) => s.closeFixBalance);
  if (accountId == null) return null;
  return <FixBalanceSheet key={accountId} accountId={accountId} onClose={close} />;
}

export function FixBalanceSheet({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { ds, positions, today, ctx } = useFinance();
  const add = useStore((s) => s.add);
  const patch = useStore((s) => s.patch);
  const accounts = ds.accounts.filter((a) => !a.archived || a.id === accountId);
  const [id, setId] = useState(accountId || (accounts.length === 1 ? accounts[0].id : ""));
  const a = ds.accounts.find((x) => x.id === id);
  const balance = a ? positions.accounts.get(a.id)?.balance ?? 0 : 0;
  const [actual, setActual] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const diff = actual == null ? 0 : Math.round((actual - balance) * 100) / 100;
  const c = { ...ctx, currency: a?.currency ?? ctx.currency };
  const save = async () => {
    if (!a) return;
    setBusy(true);
    try {
      if (Math.abs(diff) >= 0.01) {
        // An account that only starts later (its opening date is after today) ignores anything dated today, so its
        // starting balance is corrected instead.
        if (a.opening_date > today) await patch("accounts", a.id, { opening_balance: Math.round((a.opening_balance + diff) * 100) / 100 });
        else await add("transactions", { date: today, type: "adjustment", amount: diff, account_id: a.id, description: "Balance matched with bank", is_partial: false, reconciled: true, tags: ["reconcile"] });
      }
      await patch("accounts", a.id, { last_verified_at: today });
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={a ? `Fix balance · ${a.name}` : "Fix balance"}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!a || actual == null} onClick={save}>
            {actual != null && Math.abs(diff) >= 0.01 ? "Fix balance" : "Looks right"}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (a && actual != null) void save();
        }}
      >
        {!accountId && (
          <Field label="Account" htmlFor="fix-account">
            <Select id="fix-account" value={id} onChange={(e) => (setId(e.target.value), setActual(null))}>
              <option value="">Choose an account</option>
              {accounts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {a && (
          <>
            <p className="text-[14px] text-ink-2">
              This app shows <span className="num font-semibold text-ink">{formatMoney(balance, c, { decimals: true })}</span>.
            </p>
            <Field label="What does your bank app show?" htmlFor="fix-actual">
              <AmountInput id="fix-actual" large autoFocus value={actual} onChange={setActual} currency={a.currency} allowNegative />
            </Field>
            {actual != null && (
              <p className={cn("rounded-xl px-3 py-2 text-[13.5px]", Math.abs(diff) < 0.01 ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
                {Math.abs(diff) < 0.01
                  ? "They match."
                  : `The balance becomes ${formatMoney(actual, c, { decimals: true })} (${formatMoney(diff, c, { sign: true, decimals: true })}). It doesn't count as spending or income.`}
              </p>
            )}
          </>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Sheet>
  );
}
