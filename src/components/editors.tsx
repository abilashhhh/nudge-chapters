"use client";

import { useMemo, useState } from "react";
import { addDays, formatDate } from "@/lib/dates";
import { dueDateFor, statementDateOnOrAfter } from "@/lib/engine/events";
import { amortize, emiFor } from "@/lib/engine/loans";
import { useFinance } from "@/lib/finance";
import {
  accountFields, cardFields, chitFields, finalizeChit, finalizeGoal, finalizeInvestment, finalizeLoan, finalizeRule, goalFields,
  investmentFields, lendingFields, loanFields, newAccount, newCard, newChit, newGoal, newInvestment, newLending, newLoan, newReserve,
  newRule, reserveFields, ruleFields, statementFields, valuationFields,
} from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import type { CardStatement, CreditCard, Investment, InvestmentType, Lending, Loan, RecurringRule } from "@/lib/types";
import { EntityEditor } from "./entity-form";
import { AmountInput, DateInput, Field, Switch } from "./ui/form";

/** Renders whichever add/edit sheet is open in the UI store. */
export function Editors() {
  const editor = useUI((s) => s.editor);
  const close = useUI((s) => s.closeEditor);
  if (!editor) return null;
  const props = { id: editor.id, preset: editor.preset, onClose: close };
  switch (editor.kind) {
    case "account":
      return <AccountEditor {...props} />;
    case "card":
      return <CardEditor {...props} />;
    case "statement":
      return <StatementEditor {...props} />;
    case "loan":
      return <LoanEditor {...props} />;
    case "chit":
      return <ChitEditor {...props} />;
    case "investment":
      return <InvestmentEditor {...props} />;
    case "goal":
      return <GoalEditor {...props} />;
    case "lending":
      return <LendingEditor {...props} />;
    case "reserve":
      return <ReserveEditor {...props} />;
    case "rule":
      return <RuleEditor {...props} />;
    case "valuation":
      return <ValuationEditor {...props} />;
  }
}

interface P {
  id?: string;
  preset?: Record<string, unknown>;
  onClose: () => void;
}

function AccountEditor({ id, preset, onClose }: P) {
  const { ds, today } = useFinance();
  const patch = useStore((s) => s.patch);
  const existing = ds.accounts.find((a) => a.id === id);
  const initial = useMemo(() => existing ?? { ...newAccount(today), ...preset }, [existing, today, preset]);
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="accounts"
      initial={initial}
      fields={accountFields}
      title={existing ? `Edit ${existing.name}` : "Add an account"}
      onSaved={async (row, isNew) => {
        // First account: attach anything added earlier without an account.
        if (!isNew || ds.accounts.some((a) => a.id !== row.id)) return;
        const id = (row as { id: string }).id;
        for (const r of ds.recurring_rules) if (!r.account_id && !r.card_id) await patch("recurring_rules", r.id, { account_id: id });
        for (const c of ds.credit_cards) if (!c.payment_account_id) await patch("credit_cards", c.id, { payment_account_id: id });
        for (const l of ds.loans) if (!l.payment_account_id && !l.card_id) await patch("loans", l.id, { payment_account_id: id });
        for (const c of ds.chits) if (!c.account_id) await patch("chits", c.id, { account_id: id });
        for (const i of ds.investments) if (i.sip_active && !i.sip_account_id) await patch("investments", i.id, { sip_account_id: id });
      }}
      deleteLabel="Delete account"
      deleteBody="Transactions stay but lose their link to this account, so balances elsewhere may change. Archiving is usually better."
    />
  );
}

function CardEditor({ id, preset, onClose }: P) {
  const { ds, today } = useFinance();
  const add = useStore((s) => s.add);
  const existing = ds.credit_cards.find((c) => c.id === id);
  const initial = useMemo(() => existing ?? { ...newCard(ds, today), ...preset }, [existing, ds, today, preset]);
  const [bill, setBill] = useState<number | null>(null);
  const [billDue, setBillDue] = useState<string>("");
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="credit_cards"
      initial={initial}
      fields={cardFields}
      title={existing ? `Edit ${existing.name}` : "Add a credit card"}
      validate={(v): Record<string, string> => (v.last4 && !/^\d{4}$/.test(v.last4) ? { last4: "Enter exactly 4 digits" } : {})}
      deleteLabel="Delete card"
      deleteBody="Its statements are deleted too. Past card transactions stay but lose their link."
      extra={
        existing
          ? undefined
          : (v) => {
              const c = v as Partial<CreditCard>;
              const lastStatement = c.statement_day ? statementDateOnOrAfter({ statement_day: c.statement_day }, addDays(today, -31)) : null;
              return (
                <div className="mt-5 rounded-xl border border-line bg-surface-2 p-4">
                  <p className="text-[14px] font-medium">Unpaid bill already generated?</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">If a statement is out and not yet paid, enter it so its due date is tracked. It should be part of the outstanding above.</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Bill amount" optional>
                      <AmountInput value={bill} onChange={setBill} />
                    </Field>
                    <Field label="Due date">
                      <DateInput
                        value={billDue || (lastStatement && c.due_day && c.statement_day ? dueDateFor({ statement_day: c.statement_day, due_day: c.due_day }, lastStatement) : "")}
                        onChange={(e) => setBillDue(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              );
            }
      }
      onSaved={async (row, isNew) => {
        if (!isNew || !bill) return;
        const card = row as CreditCard;
        let s = statementDateOnOrAfter(card, addDays(today, -31));
        if (s > today) s = addDays(s, -30);
        const due = billDue || dueDateFor(card, s);
        await add("card_statements", { card_id: card.id, statement_date: s <= due ? s : addDays(due, -20), due_date: due, total_due: bill, min_due: Math.round(bill * 0.05) } as Partial<CardStatement>);
      }}
    />
  );
}

function StatementEditor({ id, preset, onClose }: P) {
  const { ds, positions } = useFinance();
  const existing = ds.card_statements.find((s) => s.id === id);
  const cardId = (existing?.card_id ?? preset?.card_id) as string;
  const card = ds.credit_cards.find((c) => c.id === cardId);
  const initial = useMemo(() => {
    if (existing) return existing;
    const cp = positions.cards.get(cardId);
    const s = card ? statementDateOnOrAfter(card, addDays(positions.asOf, -30)) : positions.asOf;
    const sDate = s > positions.asOf ? addDays(s, -30) : s;
    return { card_id: cardId, statement_date: sDate, due_date: card ? dueDateFor(card, sDate) : sDate, total_due: cp?.unbilled ?? 0, min_due: 0, ...preset };
  }, [existing, cardId, card, positions, preset]);
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="card_statements"
      initial={initial}
      fields={statementFields}
      title={existing ? "Edit statement" : `New statement${card ? ` · ${card.name}` : ""}`}
      description="The bill your card issuer generated. Payments you record are matched to it."
      validate={(v): Record<string, string> => (v.due_date && v.statement_date && v.due_date < v.statement_date ? { due_date: "Due date must be on or after the statement date" } : {})}
      deleteLabel="Delete statement"
    />
  );
}

function LoanEditor({ id, preset, onClose }: P) {
  const { ds, today, ctx } = useFinance();
  const existing = ds.loans.find((l) => l.id === id);
  const initial = useMemo(() => existing ?? { ...newLoan(ds, today), ...preset }, [existing, ds, today, preset]);
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="loans"
      initial={initial}
      fields={loanFields}
      title={existing ? `Edit ${existing.name}` : "Add a loan or EMI"}
      transform={(v) => finalizeLoan(v, today)}
      deleteLabel="Delete loan"
      deleteBody="Its EMI payments stay in your transactions but lose their link to the loan."
      extra={(v) => {
        const l = v as Partial<Loan>;
        if (!l.principal || !l.tenure_months || !l.first_emi_date) return null;
        const emi = l.emi_amount || emiFor(l.principal, l.interest_rate ?? 0, l.tenure_months, l.interest_type);
        const s = amortize({ principal: l.principal, interest_rate: l.interest_rate ?? 0, tenure_months: l.tenure_months, interest_type: l.interest_type ?? "reducing", emi_amount: l.emi_amount, first_emi_date: l.first_emi_date });
        const interest = s.reduce((a, x) => a + x.interest, 0);
        return (
          <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-4 text-[13px]">
            <div>
              <p className="text-ink-3">EMI</p>
              <p className="num text-[15px] font-semibold">{formatMoney(emi, ctx)}</p>
            </div>
            <div>
              <p className="text-ink-3">Total interest</p>
              <p className="num text-[15px] font-semibold">{formatMoney(interest, ctx)}</p>
            </div>
            <div>
              <p className="text-ink-3">Last EMI</p>
              <p className="num text-[15px] font-semibold">{formatDate(s.at(-1)?.date)}</p>
            </div>
          </div>
        );
      }}
    />
  );
}

function ChitEditor({ id, preset, onClose }: P) {
  const { ds, today } = useFinance();
  const existing = ds.chits.find((c) => c.id === id);
  const initial = useMemo(() => existing ?? { ...newChit(ds, today), ...preset }, [existing, ds, today, preset]);
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="chits"
      initial={initial}
      fields={chitFields}
      title={existing ? `Edit ${existing.name}` : "Add a chit"}
      transform={(v) => finalizeChit(v, today)}
      deleteLabel="Delete chit"
    />
  );
}

function InvestmentEditor({ id, preset, onClose }: P) {
  const { ds, today } = useFinance();
  const existing = ds.investments.find((i) => i.id === id);
  const initial = useMemo(
    () => existing ?? { ...newInvestment(ds, today, (preset?.type as InvestmentType) ?? "mutual_fund"), ...preset },
    [existing, ds, today, preset],
  );
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="investments"
      initial={initial}
      fields={investmentFields}
      title={existing ? `Edit ${existing.name}` : "Add an investment or asset"}
      transform={(v) => finalizeInvestment(v as Partial<Investment>, today)}
      deleteLabel="Delete investment"
      deleteBody="Its buy/sell transactions stay but lose their link. Archive it instead if you sold it."
    />
  );
}

function GoalEditor({ id, preset, onClose }: P) {
  const { ds } = useFinance();
  const existing = ds.goals.find((g) => g.id === id);
  const initial = useMemo(() => existing ?? { ...newGoal(), ...preset }, [existing, preset]);
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="goals"
      initial={initial}
      fields={goalFields}
      title={existing ? `Edit ${existing.name}` : "New goal"}
      transform={finalizeGoal}
      deleteLabel="Delete goal"
    />
  );
}

function LendingEditor({ id, preset, onClose }: P) {
  const { ds, today } = useFinance();
  const add = useStore((s) => s.add);
  const existing = ds.lendings.find((l) => l.id === id);
  const initial = useMemo(() => existing ?? { ...newLending(ds, today, (preset?.direction as Lending["direction"]) ?? "lent"), ...preset }, [existing, ds, today, preset]);
  const [moveCash, setMoveCash] = useState(true);
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="lendings"
      initial={initial}
      fields={lendingFields}
      title={existing ? `Edit · ${existing.person}` : "Money lent or borrowed"}
      description="Lending is money owed to you, not an expense. Borrowing is a debt, not income."
      deleteLabel="Delete record"
      extra={
        existing
          ? undefined
          : (v) =>
              v.account_id ? (
                <div className="mt-4">
                  <Switch checked={moveCash} onChange={setMoveCash} label="Record the money moving through this account" help="Turn off if the account balance you entered already reflects it." />
                </div>
              ) : null
      }
      onSaved={async (row, isNew) => {
        const l = row as Lending;
        if (!isNew || !moveCash || !l.account_id) return;
        await add("transactions", {
          date: l.date,
          type: l.direction === "lent" ? "lend" : "borrow",
          amount: l.amount,
          account_id: l.account_id,
          lending_id: l.id,
          description: l.direction === "lent" ? `Lent to ${l.person}` : `Borrowed from ${l.person}`,
          is_partial: false,
          reconciled: false,
          tags: [],
        });
      }}
    />
  );
}

function ReserveEditor({ id, preset, onClose }: P) {
  const { ds } = useFinance();
  const existing = ds.reserves.find((r) => r.id === id);
  const initial = useMemo(() => existing ?? { ...newReserve(), ...preset }, [existing, preset]);
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="reserves"
      initial={initial}
      fields={reserveFields}
      title={existing ? `Edit ${existing.name}` : "New reserve"}
      description="Reserved money stays in your bank account but is taken out of what's safe to spend."
      deleteLabel="Delete reserve"
    />
  );
}

function RuleEditor({ id, preset, onClose }: P) {
  const { ds, today } = useFinance();
  const existing = ds.recurring_rules.find((r) => r.id === id);
  const initial = useMemo(
    () => existing ?? { ...newRule(ds, today, (preset?.kind as RecurringRule["kind"]) ?? "expense"), ...preset },
    [existing, ds, today, preset],
  );
  const title = existing ? `Edit ${existing.name}` : preset?.frequency === "once" ? "Planned one-time item" : "Recurring item";
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="recurring_rules"
      initial={initial}
      fields={ruleFields}
      title={title}
      description={existing ? "Changes apply to future occurrences. Payments already recorded don't change." : "Income, bills, budgets and transfers that repeat. They appear as planned items until you mark them paid."}
      transform={finalizeRule}
      validate={(v) => {
        const e: Record<string, string> = {};
        if (v.kind === "transfer" && v.account_id && v.account_id === v.to_account_id) e.to_account_id = "Choose a different account";
        if (v.kind === "transfer" && !v.to_account_id) e.to_account_id = "Choose the account it goes to";
        if (v.end_date && v.start_date && v.end_date < v.start_date) e.end_date = "Must be after the start date";
        if (v.kind === "expense" && v.is_fixed === false && !v.category) e.category = "Budgets need a category to track spending against";
        return e;
      }}
      deleteLabel="Delete item"
      deleteBody="Future planned occurrences disappear. Payments already recorded stay in your transactions."
    />
  );
}

function ValuationEditor({ id, preset, onClose }: P) {
  const { ds, today } = useFinance();
  const patch = useStore((s) => s.patch);
  const existing = ds.investment_valuations.find((v) => v.id === id);
  const invId = (existing?.investment_id ?? preset?.investment_id) as string;
  const inv = ds.investments.find((i) => i.id === invId);
  const initial = useMemo(() => existing ?? { investment_id: invId, date: today, value: undefined, ...preset }, [existing, invId, today, preset]);
  return (
    <EntityEditor
      open
      onClose={onClose}
      table="investment_valuations"
      initial={initial}
      fields={valuationFields}
      title={`Update value${inv ? ` · ${inv.name}` : ""}`}
      description="Adds a point to this asset's history. The latest one becomes its current value."
      deleteLabel="Delete entry"
      onSaved={async (row) => {
        if (!inv) return;
        const latest = [...ds.investment_valuations.filter((v) => v.investment_id === inv.id && v.id !== row.id), row].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        if (latest.id === row.id && inv.units == null) await patch("investments", inv.id, { current_value: row.value, value_as_of: row.date });
      }}
    />
  );
}
