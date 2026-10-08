"use client";

import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, CalendarPlus, CreditCard, HandCoins, Landmark, LineChart, PiggyBank, Repeat, Scale, Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { TX_TYPE_LABEL } from "@/lib/engine/defaults";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import type { Transaction, TxType } from "@/lib/types";
import { Button } from "./ui/button";
import { AmountInput, DateInput, Field, Input, NumberInput, Select, Switch, Textarea } from "./ui/form";
import { ConfirmSheet, Sheet } from "./ui/sheet";

const PRIMARY: { id: TxType; label: string }[] = [
  { id: "expense", label: "Expense" },
  { id: "income", label: "Income" },
  { id: "transfer", label: "Transfer" },
];

const MORE: TxType[] = [
  "card_payment", "lend_repayment", "borrow_repayment", "invest_buy", "invest_sell", "loan_emi", "loan_prepayment",
  "chit_installment", "chit_payout", "lend", "borrow", "adjustment",
];

type Draft = Partial<Transaction> & { payWith?: string };

export function TransactionSheet() {
  const open = useUI((s) => s.txOpen);
  const preset = useUI((s) => s.txPreset);
  const editing = useUI((s) => s.txEditing);
  const close = useUI((s) => s.closeTx);
  if (!open) return null;
  return <TransactionForm preset={preset} editing={editing} onClose={close} />;
}

function TransactionForm({ preset, editing, onClose }: { preset: Partial<Transaction> | null; editing: Transaction | null; onClose: () => void }) {
  const { ds, today, positions, ctx } = useFinance();
  const add = useStore((s) => s.add);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const primary = useMemo(() => ds.accounts.find((a) => !a.archived && a.include_in_cash && a.type === "savings")?.id ?? ds.accounts.find((a) => !a.archived)?.id ?? null, [ds.accounts]);

  const init = (): Draft => {
    const base: Draft = editing
      ? { ...editing }
      : { type: "expense", date: today, amount: undefined, account_id: primary, is_partial: false, reconciled: false, tags: [], ...preset };
    if (base.type === "card_spend") return { ...base, type: "expense", payWith: `card:${base.card_id}` };
    // Card bills can be paid from any account: ask, unless there's only one.
    if (!editing && base.type === "card_payment" && !preset?.account_id) {
      const active = ds.accounts.filter((a) => !a.archived);
      return { ...base, account_id: active.length === 1 ? active[0].id : null };
    }
    if (base.type === "expense") return { ...base, payWith: base.account_id ? `acct:${base.account_id}` : primary ? `acct:${primary}` : "" };
    return base;
  };
  const [d, setD] = useState<Draft>(init);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const type = d.type ?? "expense";

  // Pre-fill EMI split from the loan's next installment.
  useEffect(() => {
    if (type !== "loan_emi" || !d.loan_id || editing) return;
    const lp = positions.loans.get(d.loan_id);
    if (lp?.state.next) {
      set({
        amount: d.amount ?? lp.state.next.emi,
        principal_part: lp.state.next.principal,
        interest_part: lp.state.next.interest,
        occurrence_date: lp.state.next.date,
        account_id: lp.loan.card_id ? null : lp.loan.payment_account_id ?? d.account_id,
        card_id: lp.loan.card_id ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, d.loan_id]);

  useEffect(() => {
    if (type !== "card_payment" || !d.card_id || editing) return;
    const cp = positions.cards.get(d.card_id);
    const open = cp?.statements.find((s) => s.remaining > 0);
    set({
      statement_id: open?.statement.id ?? null,
      amount: d.amount ?? (open ? open.remaining : cp?.outstanding),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, d.card_id]);

  useEffect(() => {
    if ((type !== "chit_installment" && type !== "chit_payout") || !d.chit_id || editing) return;
    const c = positions.chits.get(d.chit_id);
    if (!c) return;
    const next = c.summary.nextUnpaid;
    set({
      account_id: c.chit.account_id ?? d.account_id,
      amount: d.amount ?? (type === "chit_payout" ? c.expectedPayout : (next?.payable ?? next?.planned ?? c.chit.monthly_contribution)),
      ...(type === "chit_installment" && next ? { occurrence_date: next.scheduledDate } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, d.chit_id]);

  useEffect(() => {
    if ((type !== "lend_repayment" && type !== "borrow_repayment") || !d.lending_id || editing) return;
    const l = positions.lendings.get(d.lending_id);
    if (!l) return;
    set({ account_id: l.lending.account_id ?? d.account_id, amount: d.amount ?? l.outstanding });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, d.lending_id]);

  useEffect(() => {
    if ((type !== "invest_buy" && type !== "invest_sell") || !d.investment_id || editing) return;
    const p = positions.investments.get(d.investment_id);
    if (p?.price && d.price == null) set({ price: p.price });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, d.investment_id]);

  const save = async (andAnother = false) => {
    const e: Record<string, string> = {};
    if (!d.amount || (type !== "adjustment" && d.amount <= 0)) e.amount = "Enter an amount";
    if (!d.date) e.date = "Pick a date";
    const body: Partial<Transaction> = { ...d };
    delete (body as Draft).payWith;
    if (type === "expense") {
      const [kind, id] = (d.payWith ?? "").split(":");
      if (!id) e.payWith = "Choose how you paid";
      if (kind === "card") {
        body.type = "card_spend";
        body.card_id = id;
        body.account_id = null;
      } else {
        body.type = "expense";
        body.account_id = id;
        body.card_id = null;
      }
    }
    const needsAccount: TxType[] = ["income", "transfer", "card_payment", "lend", "lend_repayment", "borrow", "borrow_repayment", "loan_prepayment", "chit_installment", "chit_payout", "adjustment"];
    if (needsAccount.includes(type) && !body.account_id) e.account_id = "Choose an account";
    if (type === "loan_emi" && !body.card_id && !body.account_id) e.account_id = "Choose an account";
    if (type === "transfer") {
      if (!body.to_account_id) e.to_account_id = "Choose where it went";
      else if (body.to_account_id === body.account_id) e.to_account_id = "Choose a different account";
    }
    if (type === "card_payment" && !body.card_id) e.card_id = "Choose the card";
    if ((type === "loan_emi" || type === "loan_prepayment") && !body.loan_id) e.loan_id = "Choose the loan";
    if ((type === "chit_installment" || type === "chit_payout") && !body.chit_id) e.chit_id = "Choose the chit";
    if ((type === "lend_repayment" || type === "borrow_repayment") && !body.lending_id) e.lending_id = "Choose who";
    if ((type === "invest_buy" || type === "invest_sell") && !body.investment_id) e.investment_id = "Choose the investment";
    setErrors(e);
    if (Object.keys(e).length) return;
    if ((type === "invest_buy" || type === "invest_sell") && body.price && !body.units && body.amount) {
      body.units = Math.round((body.amount / body.price) * 1e6) / 1e6;
    }
    if (type !== "transfer") body.to_account_id = null;
    setBusy(true);
    try {
      if (editing) {
        const { id, created_at: _c, updated_at: _u, user_id: _uid, ...rest } = body as Transaction;
        await patch("transactions", id, rest);
      } else {
        await add("transactions", body);
        if (type === "chit_payout" && body.chit_id) await patch("chits", body.chit_id, { payout_status: "received", payout_amount: body.amount, payout_date: body.date });
      }
      if (andAnother) {
        setD({ ...init(), type: d.type, payWith: d.payWith, account_id: d.account_id, date: d.date, amount: undefined, description: "", category: d.category });
      } else onClose();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  };

  const accounts = ds.accounts.filter((a) => !a.archived || a.id === d.account_id || a.id === d.to_account_id);
  const cards = ds.credit_cards.filter((c) => !c.archived || c.id === d.card_id);
  const isIncomeCat = type === "income";
  const cats = ds.categories.filter((c) => c.kind === (isIncomeCat ? "income" : "expense") && !c.archived);

  const renderAccount = (label: string, field: "account_id" | "to_account_id" = "account_id", none?: string) => (
    <Field label={label} error={errors[field]} htmlFor={`tx-${field}`}>
      <Select id={`tx-${field}`} value={(d[field] as string) ?? ""} onChange={(e) => set({ [field]: e.target.value || null })}>
        <option value="">{none ?? "Choose an account"}</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {formatMoney(positions.accounts.get(a.id)?.balance ?? 0, ctx)}
          </option>
        ))}
      </Select>
    </Field>
  );

  let specific: ReactNode = null;
  switch (type) {
    case "expense":
      specific = (
        <Field label="Paid with" error={errors.payWith} htmlFor="tx-paywith">
          <Select id="tx-paywith" value={d.payWith ?? ""} onChange={(e) => set({ payWith: e.target.value })}>
            <option value="">Choose…</option>
            <optgroup label="Bank & cash">
              {accounts.map((a) => (
                <option key={a.id} value={`acct:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
            {cards.length > 0 && (
              <optgroup label="Credit cards">
                {cards.map((c) => (
                  <option key={c.id} value={`card:${c.id}`}>
                    {c.name}
                    {c.last4 ? ` ··${c.last4}` : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
      );
      break;
    case "income":
      specific = renderAccount("Received into");
      break;
    case "transfer":
      specific = (
        <div className="grid grid-cols-2 gap-3">
          {renderAccount("From")}
          {renderAccount("To", "to_account_id")}
        </div>
      );
      break;
    case "card_payment": {
      const cp = d.card_id ? positions.cards.get(d.card_id) : undefined;
      specific = (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Card" error={errors.card_id} htmlFor="tx-card">
              <Select id="tx-card" value={d.card_id ?? ""} onChange={(e) => set({ card_id: e.target.value || null, statement_id: null, amount: undefined })}>
                <option value="">Choose a card</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            {renderAccount("Paid from", "account_id", "No account (refund / cashback)")}
          </div>
          {cp && cp.statements.some((s) => s.remaining > 0 || s.statement.id === d.statement_id) && (
            <Field label="Towards statement" htmlFor="tx-stmt">
              <Select id="tx-stmt" value={d.statement_id ?? ""} onChange={(e) => set({ statement_id: e.target.value || null })}>
                <option value="">Not a specific statement</option>
                {cp.statements
                  .filter((s) => s.remaining > 0 || s.statement.id === d.statement_id)
                  .map((s) => (
                    <option key={s.statement.id} value={s.statement.id}>
                      {formatDate(s.statement.statement_date)} · {formatMoney(s.remaining, ctx)} left, due {formatDate(s.statement.due_date, "short")}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          <Note>Paying a card bill settles what you owe — it isn&apos;t a new expense. The purchases were counted when you made them.</Note>
        </>
      );
      break;
    }
    case "lend":
    case "borrow":
      specific = (
        <>
          {renderAccount(type === "lend" ? "From" : "Into")}
          <Note>
            To track who owes what and when it&apos;s due back, add it under{" "}
            <button type="button" className="font-medium text-future-ink underline" onClick={() => useUI.getState().openEditor("lending", undefined, { direction: type === "lend" ? "lent" : "borrowed" })}>
              Lending
            </button>{" "}
            instead.
          </Note>
        </>
      );
      break;
    case "lend_repayment":
    case "borrow_repayment": {
      const dir = type === "lend_repayment" ? "lent" : "borrowed";
      specific = (
        <div className="grid grid-cols-2 gap-3">
          <Field label={dir === "lent" ? "From" : "To"} error={errors.lending_id} htmlFor="tx-lending">
            <Select id="tx-lending" value={d.lending_id ?? ""} onChange={(e) => set({ lending_id: e.target.value || null, amount: undefined })}>
              <option value="">Choose…</option>
              {ds.lendings
                .filter((l) => l.direction === dir && ((positions.lendings.get(l.id)?.outstanding ?? 0) > 0 || l.id === d.lending_id))
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.person} · {formatMoney(positions.lendings.get(l.id)?.outstanding ?? 0, ctx)} left
                  </option>
                ))}
            </Select>
          </Field>
          {renderAccount(dir === "lent" ? "Received into" : "Paid from")}
        </div>
      );
      break;
    }
    case "invest_buy":
    case "invest_sell":
      specific = (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Investment" error={errors.investment_id} htmlFor="tx-inv">
              <Select id="tx-inv" value={d.investment_id ?? ""} onChange={(e) => set({ investment_id: e.target.value || null, price: undefined })}>
                <option value="">Choose…</option>
                {ds.investments
                  .filter((i) => !i.archived || i.id === d.investment_id)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {renderAccount(type === "invest_buy" ? "Paid from" : "Received into", "account_id", "Not from a tracked account")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Units" optional htmlFor="tx-units">
              <NumberInput id="tx-units" value={d.units ?? ""} onChange={(e) => set({ units: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            <Field label="Price / NAV" optional htmlFor="tx-price">
              <NumberInput id="tx-price" value={d.price ?? ""} onChange={(e) => set({ price: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
          </div>
          <Note>{type === "invest_buy" ? "Investing moves money from cash into an asset — it isn't spending." : "Selling moves value back to cash."}</Note>
        </>
      );
      break;
    case "loan_emi":
    case "loan_prepayment": {
      const lp = d.loan_id ? positions.loans.get(d.loan_id) : undefined;
      specific = (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Loan" error={errors.loan_id} htmlFor="tx-loan">
              <Select id="tx-loan" value={d.loan_id ?? ""} onChange={(e) => set({ loan_id: e.target.value || null, amount: undefined })}>
                <option value="">Choose…</option>
                {ds.loans
                  .filter((l) => l.status === "active" || l.id === d.loan_id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {lp?.loan.card_id && type === "loan_emi" ? (
              <Field label="Billed on">
                <Input value={ds.credit_cards.find((c) => c.id === lp.loan.card_id)?.name ?? "Card"} disabled />
              </Field>
            ) : (
              renderAccount("Paid from")
            )}
          </div>
          {type === "loan_emi" && lp?.state.next && !editing && (
            <Note>
              EMI {lp.state.paidCount + 1} of {lp.state.schedule.length}: {formatMoney(lp.state.next.principal, ctx)} principal + {formatMoney(lp.state.next.interest, ctx)} interest. Only
              the interest counts as an expense.
            </Note>
          )}
          {type === "loan_prepayment" && <Note>A prepayment reduces the principal and shortens the remaining tenure.</Note>}
        </>
      );
      break;
    }
    case "chit_installment":
    case "chit_payout":
      specific = (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Chit" error={errors.chit_id} htmlFor="tx-chit">
            <Select id="tx-chit" value={d.chit_id ?? ""} onChange={(e) => set({ chit_id: e.target.value || null, amount: undefined })}>
              <option value="">Choose…</option>
              {ds.chits.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          {renderAccount(type === "chit_installment" ? "Paid from" : "Received into")}
        </div>
      );
      break;
    case "adjustment":
      specific = (
        <>
          {renderAccount("Account")}
          <Note>Use a positive amount to add to the balance and a negative one to reduce it. Adjustments aren&apos;t income or expenses.</Note>
        </>
      );
      break;
  }

  const showCategory = type === "expense" || type === "income";

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={editing ? "Edit transaction" : "Add transaction"}
        footer={
          <div className="flex items-center gap-2">
            {editing && (
              <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            {editing && (
              <Button
                variant="ghost"
                onClick={() => {
                  const { id: _i, created_at: _c, updated_at: _u, import_hash: _h, rule_id: _r, occurrence_date: _o, ...copy } = editing;
                  useUI.getState().openTx({ ...copy, date: today }, null);
                }}
              >
                Duplicate
              </Button>
            )}
            <div className="flex-1" />
            {!editing && (
              <Button className="hidden sm:inline-flex" onClick={() => save(true)} disabled={busy}>
                Save & add another
              </Button>
            )}
            <Button variant="primary" loading={busy} onClick={() => save(false)}>
              {editing ? "Save changes" : "Save"}
            </Button>
          </div>
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-surface-3 p-1" role="radiogroup" aria-label="Transaction type">
              {PRIMARY.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={type === t.id}
                  onClick={() => set({ type: t.id, category: t.id === "income" ? "Salary" : t.id === "expense" ? d.category : null, payWith: d.payWith ?? (primary ? `acct:${primary}` : "") })}
                  className={cn("rounded-lg px-3 py-1.5 text-[13.5px] font-medium", type === t.id ? "bg-surface text-ink shadow-sm" : "text-ink-2")}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Select
              aria-label="Other transaction types"
              className={cn("h-9 w-auto min-w-36 text-[13.5px]", MORE.includes(type) && "border-future")}
              value={MORE.includes(type) ? type : ""}
              onChange={(e) => e.target.value && set({ type: e.target.value as TxType, category: null })}
            >
              <option value="">More types…</option>
              {MORE.map((m) => (
                <option key={m} value={m}>
                  {TX_TYPE_LABEL[m]}
                </option>
              ))}
            </Select>
          </div>

          <Field label="Amount" error={errors.amount} htmlFor="tx-amount">
            <AmountInput id="tx-amount" large autoFocus={!editing} value={d.amount ?? null} allowNegative={type === "adjustment"} onChange={(v) => set({ amount: v ?? undefined })} />
          </Field>

          {specific}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" error={errors.date} htmlFor="tx-date">
              <DateInput id="tx-date" value={d.date ?? ""} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            {showCategory ? (
              <Field label="Category" htmlFor="tx-cat">
                <Input id="tx-cat" list="tx-cats" value={d.category ?? ""} placeholder="Category" onChange={(e) => set({ category: e.target.value || null })} />
                <datalist id="tx-cats">
                  {cats.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </Field>
            ) : (
              <div />
            )}
          </div>

          {showCategory && cats.length > 0 && (
            <div className="-mt-2 flex flex-wrap gap-1.5">
              {cats.slice(0, isIncomeCat ? 6 : 10).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set({ category: c.name })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12.5px]",
                    d.category === c.name ? "border-ink bg-ink text-paper" : "border-line text-ink-2 hover:border-line-strong",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          <Field label="Description" optional htmlFor="tx-desc">
            <Input id="tx-desc" value={d.description ?? ""} placeholder="e.g. Swiggy, rent for May" onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Notes" optional htmlFor="tx-notes">
            <Textarea id="tx-notes" value={d.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          {editing && <Switch checked={!!d.reconciled} onChange={(v) => set({ reconciled: v })} label="Reconciled with bank statement" />}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Sheet>
      {editing && (
        <ConfirmSheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title="Delete this transaction?"
          body="Balances and reports update immediately. If it settled a planned bill, that bill shows as unpaid again."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            await remove("transactions", editing.id);
            onClose();
          }}
        />
      )}
    </>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-future-soft px-3 py-2 text-[12.5px] leading-snug text-future-ink">{children}</p>;
}

// ---------------------------------------------------------------------------

export function QuickAddSheet() {
  const open = useUI((s) => s.quickOpen);
  const close = useUI((s) => s.closeQuick);
  const { openTx, openEditor } = useUI.getState();
  const items: { icon: typeof Banknote; label: string; hint: string; run: () => void }[] = [
    { icon: ArrowUpRight, label: "Expense", hint: "Bank, cash or card", run: () => openTx({ type: "expense" }) },
    { icon: ArrowDownLeft, label: "Income", hint: "Salary, freelance…", run: () => openTx({ type: "income", category: "Salary" }) },
    { icon: ArrowLeftRight, label: "Transfer", hint: "Between your accounts", run: () => openTx({ type: "transfer" }) },
    { icon: CreditCard, label: "Pay card bill", hint: "Settles the card", run: () => openTx({ type: "card_payment" }) },
    { icon: Users, label: "Lend or borrow", hint: "Track who owes what", run: () => openEditor("lending") },
    { icon: HandCoins, label: "Repayment", hint: "Money paid back", run: () => openTx({ type: "lend_repayment" }) },
    { icon: LineChart, label: "Investment", hint: "Buy or SIP", run: () => openTx({ type: "invest_buy" }) },
    { icon: Landmark, label: "EMI payment", hint: "Loan installment", run: () => openTx({ type: "loan_emi" }) },
    { icon: Repeat, label: "Recurring item", hint: "Bill, salary, budget", run: () => openEditor("rule") },
    { icon: CalendarPlus, label: "Planned expense", hint: "One-time, in future", run: () => openEditor("rule", undefined, { frequency: "once", kind: "expense", name: "" }) },
    { icon: PiggyBank, label: "Chit installment", hint: "Monthly chit", run: () => openTx({ type: "chit_installment" }) },
    { icon: Scale, label: "Fix a balance", hint: "Match your bank", run: () => openTx({ type: "adjustment" }) },
  ];
  return (
    <Sheet open={open} onClose={close} title="Quick add" size="md">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={it.run}
            className="flex min-h-20 flex-col items-start gap-1 rounded-2xl border border-line bg-surface-2 p-3 text-left transition-colors hover:border-line-strong hover:bg-surface"
          >
            <it.icon className="h-5 w-5 text-brand" aria-hidden />
            <span className="text-[14px] font-semibold leading-tight">{it.label}</span>
            <span className="text-[12px] leading-tight text-ink-3">{it.hint}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
