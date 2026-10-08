"use client";

import { ArrowDownLeft, CheckCheck, Pencil, Plus, RefreshCw, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate, relativeDays } from "@/lib/dates";
import { INVESTMENT_TYPE_LABEL } from "@/lib/engine/defaults";
import type { InvestmentPosition, LendingPosition } from "@/lib/engine/ledger";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import type { Account, Lending } from "@/lib/types";
import { TxRow } from "./event-row";
import { Money } from "./money";
import { Button } from "./ui/button";
import { AmountInput, Field, NumberInput, Switch } from "./ui/form";
import { Badge, EmptyState, KV } from "./ui/misc";
import { Sheet } from "./ui/sheet";

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export function AccountCard({ a }: { a: Account }) {
  const { positions, ds, ctx } = useFinance();
  const [open, setOpen] = useState(false);
  const [reconcile, setReconcile] = useState(false);
  const p = positions.accounts.get(a.id);
  const balance = p?.balance ?? 0;
  const txs = useMemo(() => ds.transactions.filter((t) => t.account_id === a.id || t.to_account_id === a.id).slice(0, 12), [ds.transactions, a.id]);
  const lowBalance = a.min_balance > 0 && balance < a.min_balance;
  return (
    <div className={cn("rounded-2xl border bg-surface", a.archived ? "border-dashed border-line opacity-70" : "border-line")}>
      <div className="flex items-start gap-3 p-4">
        <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: a.color ?? "var(--brand)" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{a.name}</p>
          <p className="text-[12.5px] capitalize text-ink-3">
            {a.type}
            {a.institution ? ` · ${a.institution}` : ""}
            {a.currency !== ctx.currency ? ` · ${a.currency}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {!a.include_in_cash && <Badge>Not in available cash</Badge>}
            {a.is_emergency_fund && <Badge tone="danger">Emergency fund</Badge>}
            {lowBalance && <Badge tone="warn">Below minimum</Badge>}
            {a.archived && <Badge>Archived</Badge>}
          </div>
        </div>
        <div className="text-right">
          <Money value={balance} currency={a.currency} className={cn("text-[18px] font-semibold", balance < 0 && "text-danger")} />
          {a.currency !== ctx.currency && <p className="num text-[12px] text-ink-3">≈ {formatMoney(p?.balanceBase ?? 0, ctx)}</p>}
          <p className="text-[12px] text-ink-3">{a.last_verified_at ? `Checked ${relativeDays(positions.asOf, a.last_verified_at)}` : "Not checked yet"}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-t border-line px-2 py-1.5">
        <Button size="sm" variant="ghost" icon={<CheckCheck className="h-4 w-4" />} onClick={() => setReconcile(true)}>
          Match bank balance
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Hide" : "Show"} activity
        </Button>
        <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("account", a.id)}>
          Edit
        </Button>
      </div>
      {open && (
        <div className="border-t border-line px-1 py-1">
          {txs.length ? txs.map((t) => <TxRow key={t.id} t={t} accountId={a.id} />) : <p className="px-3 py-3 text-[13.5px] text-ink-3">No transactions yet.</p>}
        </div>
      )}
      {reconcile && <ReconcileSheet a={a} balance={balance} onClose={() => setReconcile(false)} />}
    </div>
  );
}

function ReconcileSheet({ a, balance, onClose }: { a: Account; balance: number; onClose: () => void }) {
  const { ds, today, ctx } = useFinance();
  const add = useStore((s) => s.add);
  const patch = useStore((s) => s.patch);
  const [actual, setActual] = useState<number | null>(balance);
  const [markAll, setMarkAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const diff = (actual ?? 0) - balance;
  const pending = ds.transactions.filter((t) => (t.account_id === a.id || t.to_account_id === a.id) && !t.reconciled && t.date <= today);
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Match ${a.name}`}
      description="Enter what your bank app shows right now. Any difference is recorded as an adjustment so Nudge Chapters matches reality."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (Math.abs(diff) >= 0.01) {
                  await add("transactions", { date: today, type: "adjustment", amount: Math.round(diff * 100) / 100, account_id: a.id, description: "Balance matched with bank", is_partial: false, reconciled: true, tags: ["reconcile"] });
                }
                if (markAll) for (const t of pending) await patch("transactions", t.id, { reconciled: true });
                await patch("accounts", a.id, { last_verified_at: today });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {Math.abs(diff) >= 0.01 ? "Adjust & mark checked" : "Mark as checked"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <KV k="Nudge Chapters says" v={formatMoney(balance, { ...ctx, currency: a.currency }, { decimals: true })} />
        <Field label="Your bank shows" htmlFor="rec-actual">
          <AmountInput id="rec-actual" large value={actual} onChange={setActual} currency={a.currency} allowNegative />
        </Field>
        <div className={cn("rounded-xl px-3 py-2 text-[13.5px]", Math.abs(diff) < 0.01 ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
          {Math.abs(diff) < 0.01 ? "Balances match." : `Difference of ${formatMoney(diff, { ...ctx, currency: a.currency }, { sign: true, decimals: true })} — maybe a missing or duplicate transaction.`}
        </div>
        {pending.length > 0 && <Switch checked={markAll} onChange={setMarkAll} label={`Mark ${pending.length} transactions as reconciled`} />}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Investments
// ---------------------------------------------------------------------------

export function HoldingRow({ p }: { p: InvestmentPosition }) {
  const { ctx } = useFinance();
  const i = p.investment;
  const unit = p.units != null && p.price != null;
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useUI.getState().openEditor("investment", i.id)}>
        <p className="truncate text-[14.5px] font-medium hover:underline">{i.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
          <span>{INVESTMENT_TYPE_LABEL[i.type]}</span>
          {i.institution && <span>· {i.institution}</span>}
          {unit && (
            <span className="num">
              · {Number((p.units ?? 0).toFixed(3)).toLocaleString("en-IN")} × {formatMoney(p.price ?? 0, ctx, { decimals: true })}
            </span>
          )}
          {i.sip_active && <Badge tone="brand">SIP {formatMoney(i.sip_amount, ctx)}</Badge>}
          {i.value_as_of && <span>· as of {formatDate(i.value_as_of, "short")}</span>}
        </p>
      </button>
      <div className="grid grid-cols-3 gap-3 text-right sm:w-[340px] sm:shrink-0">
        <div>
          <p className="text-[11.5px] text-ink-3 sm:hidden">Value</p>
          <Money value={p.value} currency={i.currency} className="text-[14.5px] font-semibold" />
        </div>
        <div>
          <p className="text-[11.5px] text-ink-3 sm:hidden">Gain</p>
          <p className={cn("num text-[13.5px] font-medium", p.gain >= 0 ? "text-ok" : "text-danger")}>
            {p.gain >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(p.gain), { ...ctx, currency: i.currency })}
          </p>
          <p className="num text-[11.5px] text-ink-3">{formatPct(p.gainPct)}</p>
        </div>
        <div>
          <p className="text-[11.5px] text-ink-3 sm:hidden">XIRR</p>
          <p className="num text-[13.5px] text-ink-2">{p.xirr == null ? "—" : formatPct(p.xirr)}</p>
        </div>
      </div>
    </div>
  );
}

export function UpdatePricesSheet({ open, onClose, positions: list }: { open: boolean; onClose: () => void; positions: InvestmentPosition[] }) {
  const { today } = useFinance();
  const patch = useStore((s) => s.patch);
  const add = useStore((s) => s.add);
  const [vals, setVals] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Update prices & values"
      description="Nudge Chapters doesn't fetch live prices. Enter today's NAV, share price or balance from your app or statement."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                for (const p of list) {
                  const v = vals[p.investment.id];
                  if (v == null || Number.isNaN(v)) continue;
                  if (p.units != null) await patch("investments", p.investment.id, { current_price: v, value_as_of: today });
                  else {
                    await patch("investments", p.investment.id, { current_value: v, value_as_of: today });
                    await add("investment_valuations", { investment_id: p.investment.id, date: today, value: v, note: "Updated" });
                  }
                }
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            Save prices
          </Button>
        </div>
      }
    >
      <ul className="divide-y divide-line">
        {list.map((p) => (
          <li key={p.investment.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{p.investment.name}</p>
              <p className="text-[12px] text-ink-3">
                {p.units != null ? `Price now ${p.price ?? "—"}` : `Value now ${p.value}`} · {p.investment.value_as_of ? formatDate(p.investment.value_as_of, "short") : ""}
              </p>
            </div>
            <NumberInput
              aria-label={`New ${p.units != null ? "price" : "value"} for ${p.investment.name}`}
              className="w-32"
              placeholder={String(p.units != null ? p.price ?? "" : p.value)}
              value={vals[p.investment.id] ?? ""}
              onChange={(e) => setVals({ ...vals, [p.investment.id]: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function PortfolioSummary({ list }: { list: InvestmentPosition[] }) {
  const { ctx } = useFinance();
  const value = list.reduce((s, p) => s + p.valueBase, 0);
  const invested = list.reduce((s, p) => s + p.invested, 0);
  const gain = value - invested;
  const sip = list.reduce((s, p) => s + (p.investment.sip_active ? p.investment.sip_amount : 0), 0);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-[12.5px] text-ink-3">Current value</p>
        <Money value={value} className="text-[20px] font-semibold" />
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-[12.5px] text-ink-3">Invested</p>
        <Money value={invested} className="text-[20px] font-semibold" />
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-[12.5px] text-ink-3">Gain / loss</p>
        <p className={cn("num text-[20px] font-semibold", gain >= 0 ? "text-ok" : "text-danger")}>
          {gain >= 0 ? "+" : "−"}
          {formatMoney(Math.abs(gain), ctx)}
        </p>
        <p className="num text-[12px] text-ink-3">{invested > 0 ? formatPct((gain / invested) * 100) : "—"} absolute</p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-[12.5px] text-ink-3">Monthly SIPs</p>
        <Money value={sip} className="text-[20px] font-semibold" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lending (money lent / borrowed)
// ---------------------------------------------------------------------------

const LEND_STATUS: Record<LendingPosition["status"], { label: string; tone: "neutral" | "brand" | "future" | "warn" | "danger" }> = {
  outstanding: { label: "Outstanding", tone: "future" },
  partially_repaid: { label: "Partly repaid", tone: "warn" },
  settled: { label: "Settled", tone: "brand" },
  written_off: { label: "Written off", tone: "neutral" },
};

export function LendingList({ direction }: { direction: Lending["direction"] }) {
  const { positions, today, ctx } = useFinance();
  const list = [...positions.lendings.values()].filter((l) => l.lending.direction === direction).sort((a, b) => b.outstanding - a.outstanding);
  const total = list.reduce((s, l) => s + l.outstanding, 0);
  const lent = direction === "lent";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-3">{lent ? "Owed to you" : "You owe"}</p>
          <Money value={total} className={cn("display text-[28px] font-semibold", lent && "text-ok")} />
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("lending", undefined, { direction })}>
          {lent ? "Lend money" : "Record borrowing"}
        </Button>
      </div>
      <p className="text-[12.5px] text-ink-3">
        {lent ? "Money you lend is an asset you're owed — not an expense, unless you write it off." : "Money you borrow is a debt — not income."}
      </p>
      {list.length === 0 ? (
        <EmptyState icon={Users} title={lent ? "Nobody owes you money" : "You don't owe anyone"} />
      ) : (
        <div className="rounded-2xl border border-line bg-surface">
          <ul className="divide-y divide-line">
            {list.map((l) => {
              const st = LEND_STATUS[l.status];
              const overdue = l.outstanding > 0 && l.lending.expected_date && l.lending.expected_date < today;
              return (
                <li key={l.lending.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useUI.getState().openEditor("lending", l.lending.id)}>
                    <p className="truncate text-[14.5px] font-medium hover:underline">{l.lending.person}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                      <Badge tone={overdue ? "danger" : st.tone}>{overdue ? "Overdue" : st.label}</Badge>
                      <span>
                        {formatMoney(l.lending.amount, ctx)} on {formatDate(l.lending.date, "short")}
                      </span>
                      {l.repaid > 0 && <span>· {formatMoney(l.repaid, ctx)} repaid</span>}
                      {l.lending.expected_date && <span>· due {formatDate(l.lending.expected_date, "short")}</span>}
                    </p>
                  </button>
                  <div className="flex items-center gap-3 sm:justify-end">
                    <Money value={l.outstanding} className={cn("text-[15px] font-semibold", lent && "text-ok")} />
                    {l.outstanding > 0 && (
                      <Button
                        size="sm"
                        icon={<ArrowDownLeft className="h-4 w-4" />}
                        onClick={() => useUI.getState().openTx({ type: lent ? "lend_repayment" : "borrow_repayment", lending_id: l.lending.id, account_id: l.lending.account_id })}
                      >
                        {lent ? "Got repaid" : "Repay"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RefreshIcon() {
  return <RefreshCw className="h-4 w-4" />;
}
