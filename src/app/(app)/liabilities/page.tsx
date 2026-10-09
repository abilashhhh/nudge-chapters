"use client";

import { ChevronDown, CreditCard, Landmark, PiggyBank, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { LendingList } from "@/components/holdings";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { AmountInput, DateInput, Field } from "@/components/ui/form";
import { Badge, EmptyState, KV, Panel, Progress, Segmented, Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { addMonths, formatDate, relativeDays } from "@/lib/dates";
import { LOAN_TYPE_LABEL } from "@/lib/engine/defaults";
import { dueDateFor, statementDateOnOrAfter } from "@/lib/engine/events";
import type { CardPosition } from "@/lib/engine/ledger";
import { ChitCard } from "@/components/chits";
import { debtPlan, simulatePrepayment, type DebtInput, type LoanState } from "@/lib/engine/loans";
import { useFinance } from "@/lib/finance";
import type { FinEvent } from "@/lib/engine/events";
import type { ProjectionResult } from "@/lib/engine/projection";
import { formatMoney, formatPct } from "@/lib/money";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";
import type { Loan } from "@/lib/types";

const TABS = ["cards", "loans", "chits", "borrowed", "planner"] as const;

export default function LiabilitiesPage() {
  return (
    <Suspense>
      <Liabilities />
    </Suspense>
  );
}

function Liabilities() {
  const [tab, setTab] = useTab(TABS, "cards");
  const { positions, norms, ctx, advanced } = useFinance();
  const t = positions.totals;
  const dti = norms.income > 0 ? (norms.emis / norms.income) * 100 : 0;
  return (
    <>
      <PageHeader
        title="Liabilities"
        description="Credit cards, loans and EMIs, chits after payout, and money you owe."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              const ui = useUI.getState();
              if (tab === "cards") ui.openEditor("card");
              else if (tab === "chits") ui.openEditor("chit");
              else if (tab === "borrowed") ui.openEditor("lending", undefined, { direction: "borrowed" });
              else ui.openEditor("loan");
            }}
          >
            Add {tab === "cards" ? "card" : tab === "chits" ? "chit" : tab === "borrowed" ? "borrowing" : "loan"}
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-line bg-surface p-4 md:col-span-1">
          <p className="text-[12.5px] text-ink-3">Total owed</p>
          <Money value={t.totalLiabilities} className="mt-0.5 block text-[22px] font-semibold" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Credit cards</p>
          <Money value={t.cardDebt} className="mt-0.5 block text-[18px] font-semibold" />
          <p className="num text-[12px] text-ink-3">{t.creditLimit > 0 ? `${formatPct((t.cardDebt / t.creditLimit) * 100, 0)} of limit` : "—"}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Loans & EMIs</p>
          <Money value={t.loanDebt} className="mt-0.5 block text-[18px] font-semibold" />
          <p className="num text-[12px] text-ink-3">
            {formatMoney(norms.emis, ctx)}/month yours
            {norms.reimbursableEmis > 0 ? ` · ${formatMoney(norms.reimbursableEmis, ctx)} for others` : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">EMI burden</p>
          <p className={cn("num mt-0.5 text-[18px] font-semibold", dti > 40 ? "text-danger" : dti > 30 ? "text-warn" : "")}>{formatPct(dti, 0)}</p>
          <p className="text-[12px] text-ink-3">of monthly income</p>
        </div>
      </div>
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        hide={advanced ? [] : ["planner"]}
        tabs={[
          { id: "cards", label: "Credit cards" },
          { id: "loans", label: "Loans & EMIs" },
          { id: "chits", label: "Chits" },
          { id: "borrowed", label: "Borrowed" },
          { id: "planner", label: "Debt planner" },
        ]}
      />
      {tab === "cards" && <Cards />}
      {tab === "loans" && <Loans />}
      {tab === "chits" && <Chits />}
      {tab === "borrowed" && <LendingList direction="borrowed" />}
      {tab === "planner" && <DebtPlanner />}
    </>
  );
}

// ---------------------------------------------------------------------------

function Cards() {
  const { positions, ds } = useFinance();
  const cards = [...positions.cards.values()].filter((c) => !c.card.archived);
  if (!cards.length) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No credit cards"
        body="Add each card with its statement and due dates. Nudge Chapters then predicts every bill and when it hits your bank."
        action={<Button variant="primary" onClick={() => useUI.getState().openEditor("card")}>Add a card</Button>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-ink-3">
        A card purchase is an expense when you make it. Paying the bill only reduces what you owe — it&apos;s never counted as spending twice.
      </p>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {cards.map((c) => (
          <CardTile key={c.card.id} cp={c} />
        ))}
      </div>
      {ds.credit_cards.some((c) => c.archived) && <p className="text-[12.5px] text-ink-3">{ds.credit_cards.filter((c) => c.archived).length} closed card(s) hidden.</p>}
    </div>
  );
}

function CardTile({ cp }: { cp: CardPosition }) {
  const { positions, ds, today, events, ctx, near } = useFinance();
  const c = cp.card;
  const util = cp.utilization;
  const nextS = statementDateOnOrAfter(c, today);
  const nextDue = dueDateFor(c, nextS);
  const emis = ds.loans.filter((l) => l.card_id === c.id && l.status === "active");
  const nextBill = events.find((e) => e.kind === "card_bill" && e.cardId === c.id && e.status !== "paid" && e.remaining > 0);
  const [showAll, setShowAll] = useState(false);
  const statements = [...cp.statements].reverse();
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="relative bg-[#1d2a24] p-4 text-[#e6ede9]" style={c.color ? { background: c.color } : undefined}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[16px] font-semibold">{c.name}</p>
            <p className="text-[12.5px] opacity-75">
              {c.issuer ?? ""} {c.network ? `· ${c.network}` : ""} {c.last4 ? `· ··${c.last4}` : ""}
            </p>
          </div>
          <button type="button" className="rounded-lg px-2 py-1 text-[12.5px] opacity-80 hover:bg-white/10" onClick={() => useUI.getState().openEditor("card", c.id)}>
            Edit
          </button>
        </div>
        <div className="mt-5 flex items-end justify-between">
          <div>
            <p className="text-[12px] opacity-70">Outstanding</p>
            <Money value={cp.outstanding} className="display text-[26px] font-semibold text-inherit" />
          </div>
          <div className="text-right text-[12.5px]">
            <p className="opacity-70">Available</p>
            <Money value={cp.available} className="font-medium text-inherit" />
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={Math.round(util * 100)} aria-label="Utilisation">
          <div className={cn("h-full rounded-full", util > 0.7 ? "bg-[#f2685c]" : util > 0.3 ? "bg-[#f0a24b]" : "bg-[#6fd3a8]")} style={{ width: `${Math.min(100, util * 100)}%` }} />
        </div>
        <p className="mt-1 text-[11.5px] opacity-70">
          {formatPct(util * 100, 0)} of {formatMoney(c.credit_limit, ctx)} limit used
        </p>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <p className="text-ink-3">Billed, unpaid</p>
            <Money value={cp.billedUnpaid} className="text-[15px] font-semibold" />
          </div>
          <div>
            <p className="text-ink-3">Since last statement</p>
            <Money value={cp.unbilled} className="text-[15px] font-semibold" />
          </div>
          <div>
            <p className="text-ink-3">Next statement</p>
            <p className="font-medium">{formatDate(nextS, "short")}</p>
          </div>
          <div>
            <p className="text-ink-3">Next bill</p>
            <p className="font-medium">
              {nextBill ? (
                <button type="button" className="hover:underline" onClick={() => useUI.getState().openEvent(nextBill.key)}>
                  <Money value={nextBill.remaining} projected={nextBill.estimated} /> · {formatDate(nextBill.date, "short")}
                </button>
              ) : (
                `due ${formatDate(nextDue, "short")}`
              )}
            </p>
          </div>
        </div>
        <CardPlanner cp={cp} nextBill={nextBill} near={near} />
        {emis.length > 0 && (
          <div className="mt-3 rounded-xl bg-surface-2 p-3 text-[13px]">
            <p className="mb-1 font-medium">EMIs on this card</p>
            {emis.map((l) => (
              <KV key={l.id} k={l.name} v={`${formatMoney(positions.loans.get(l.id)?.state.emi ?? 0, ctx)}/mo · ${positions.loans.get(l.id)?.state.remainingInstallments ?? 0} left`} />
            ))}
          </div>
        )}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink-2">Statements</p>
            <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("statement", undefined, { card_id: c.id })}>
              Add statement
            </Button>
          </div>
          {statements.length ? (
            <ul className="divide-y divide-line">
              {statements.slice(0, showAll ? 24 : 3).map((s) => (
                <li key={s.statement.id} className="flex items-center gap-3 py-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useUI.getState().openEditor("statement", s.statement.id)}>
                    <p className="text-[13.5px] font-medium">
                      {formatDate(s.statement.statement_date)} · <Money value={s.statement.total_due} />
                    </p>
                    <p className="text-[12px] text-ink-3">
                      Due {formatDate(s.statement.due_date, "short")} ({relativeDays(today, s.statement.due_date)}) · min {formatMoney(s.statement.min_due, ctx)}
                      {s.paid > 0 && ` · paid ${formatMoney(s.paid, ctx)}`}
                    </p>
                  </button>
                  <Badge tone={s.status === "paid" ? "brand" : s.status === "overdue" ? "danger" : s.status === "partially_paid" ? "warn" : "future"}>
                    {s.status === "paid" ? "Paid" : s.status === "overdue" ? "Overdue" : s.status === "partially_paid" ? "Part paid" : "Generated"}
                  </Badge>
                  {s.remaining > 0 && (
                    <Button size="sm" onClick={() => useUI.getState().openTx({ type: "card_payment", card_id: c.id, statement_id: s.statement.id, amount: s.remaining })}>
                      Pay
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">No statements recorded. Nudge Chapters estimates bills from your spending until you add one.</p>
          )}
          {statements.length > 3 && (
            <button type="button" className="mt-1 text-[12.5px] text-ink-2 hover:text-ink" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show fewer" : `Show all ${statements.length}`}
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          <Button size="sm" variant="primary" onClick={() => useUI.getState().openTx({ type: "card_payment", card_id: c.id })}>
            Pay bill
          </Button>
          <Button size="sm" onClick={() => useUI.getState().openTx({ type: "card_spend", card_id: c.id })}>
            Add card spend
          </Button>
          <Button size="sm" variant="ghost" onClick={() => useUI.getState().openEditor("loan", undefined, { type: "card_emi", card_id: c.id, payment_account_id: null, name: `${c.name} EMI` })}>
            Convert to EMI
          </Button>
        </div>
        {(c.annual_fee > 0 || c.reward_points > 0) && (
          <p className="mt-2 text-[12px] text-ink-3">
            {c.annual_fee > 0 ? `Annual fee ${formatMoney(c.annual_fee, ctx)}` : ""}
            {c.annual_fee > 0 && c.reward_points > 0 ? " · " : ""}
            {c.reward_points > 0 ? `${c.reward_points.toLocaleString("en-IN")} reward points` : ""} · APR {formatPct(c.interest_rate_apr)}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Loans() {
  const { positions } = useFinance();
  const params = useSearchParams();
  const focus = params.get("loan");
  const loans = [...positions.loans.values()].sort((a, b) => (a.loan.status === b.loan.status ? b.state.outstanding - a.state.outstanding : a.loan.status === "active" ? -1 : 1));
  if (!loans.length) {
    return (
      <EmptyState
        icon={Landmark}
        title="No loans or EMIs"
        body="Add home, vehicle, personal or education loans and card EMIs. Nudge Chapters builds the full schedule and plans each EMI."
        action={<Button variant="primary" onClick={() => useUI.getState().openEditor("loan")}>Add a loan</Button>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {loans.map(({ loan, state }) => (
        <LoanCard key={loan.id} loan={loan} state={state} defaultOpen={focus === loan.id} />
      ))}
    </div>
  );
}

function LoanCard({ loan, state, defaultOpen }: { loan: Loan; state: LoanState; defaultOpen?: boolean }) {
  const { ds, today, ctx } = useFinance();
  const [open, setOpen] = useState(!!defaultOpen);
  const [view, setView] = useState<"schedule" | "prepay">("schedule");
  const [pre, setPre] = useState<number | null>(null);
  const [preDate, setPreDate] = useState(addMonths(today, 1));
  const sim = useMemo(() => (pre && pre > 0 ? simulatePrepayment(loan, ds.transactions, { date: preDate, amount: pre }) : null), [pre, preDate, loan, ds.transactions]);
  const card = loan.card_id ? ds.credit_cards.find((c) => c.id === loan.card_id) : null;
  const closed = loan.status === "closed" || state.outstanding <= 0;
  return (
    <div className={cn("rounded-2xl border border-line bg-surface", closed && "opacity-75")}>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[16px] font-semibold">
              {loan.name}
              {loan.reimbursable_person && (
                <span className="ml-2 rounded-full bg-future-soft px-2 py-0.5 align-middle text-[11.5px] font-medium text-future-ink">Reimbursable · {loan.reimbursable_person}</span>
              )}
            </p>
            <p className="text-[12.5px] text-ink-3">
              {LOAN_TYPE_LABEL[loan.type]}
              {loan.lender ? ` · ${loan.lender}` : ""}
              {card ? ` · billed on ${card.name}` : ""} · {formatPct(loan.interest_rate)} {loan.interest_type}
            </p>
          </div>
          <div className="sm:text-right">
            <Money value={state.outstanding} className="text-[20px] font-semibold" />
            <p className="text-[12px] text-ink-3">outstanding of {formatMoney(loan.principal, ctx)}</p>
          </div>
        </div>
        <Progress className="mt-3" value={state.progress} label={`${loan.name} repaid`} />
        <div className="mt-3 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-4">
          <div>
            <p className="text-ink-3">EMI</p>
            <p className="num font-semibold">{formatMoney(state.emi, ctx)}</p>
          </div>
          <div>
            <p className="text-ink-3">Next EMI</p>
            <p className="font-semibold">{state.next ? formatDate(state.next.date, "short") : "—"}</p>
          </div>
          <div>
            <p className="text-ink-3">EMIs left</p>
            <p className="num font-semibold">
              {state.remainingInstallments} of {state.schedule.length}
            </p>
          </div>
          <div>
            <p className="text-ink-3">Debt-free on</p>
            <p className="font-semibold">{formatDate(state.endDate)}</p>
          </div>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">
          Interest paid so far {formatMoney(state.interestPaid, ctx)} · still to pay {formatMoney(state.interestRemaining, ctx)}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!closed && (
            <Button size="sm" variant="primary" onClick={() => useUI.getState().openTx({ type: "loan_emi", loan_id: loan.id })}>
              Record EMI
            </Button>
          )}
          {!closed && (
            <Button size="sm" onClick={() => useUI.getState().openTx({ type: "loan_prepayment", loan_id: loan.id, account_id: loan.payment_account_id })}>
              Prepay
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => useUI.getState().openEditor("loan", loan.id)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" icon={<ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />} onClick={() => setOpen(!open)} aria-expanded={open}>
            Schedule & prepayment
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line p-4 sm:p-5">
          <Segmented
            size="sm"
            options={[
              { id: "schedule", label: "Repayment schedule" },
              { id: "prepay", label: "Prepayment simulator" },
            ]}
            value={view}
            onChange={setView}
          />
          {view === "schedule" ? (
            <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-surface-2 text-left text-[12px] text-ink-3">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">EMI</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Principal</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Interest</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {state.schedule.map((s) => (
                    <tr key={s.index} className={cn("border-t border-line", s.index < state.paidCount ? "text-ink-3" : s.index === state.paidCount ? "bg-future-soft/60" : "")}>
                      <td className="px-3 py-1.5">{s.index + 1}</td>
                      <td className="px-3 py-1.5">{formatDate(s.date, "medium")}</td>
                      <td className="px-3 py-1.5 text-right">{formatMoney(s.emi, ctx)}</td>
                      <td className="hidden px-3 py-1.5 text-right sm:table-cell">{formatMoney(s.principal, ctx)}</td>
                      <td className="hidden px-3 py-1.5 text-right sm:table-cell">{formatMoney(s.interest, ctx)}</td>
                      <td className="px-3 py-1.5 text-right">{formatMoney(s.balance, ctx)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Field label="Extra payment" htmlFor={`pre-${loan.id}`}>
                  <AmountInput id={`pre-${loan.id}`} value={pre} onChange={setPre} />
                </Field>
                <Field label="On" htmlFor={`pred-${loan.id}`}>
                  <DateInput id={`pred-${loan.id}`} value={preDate} onChange={(e) => setPreDate(e.target.value)} />
                </Field>
              </div>
              <div className="rounded-xl bg-surface-2 p-4">
                {sim ? (
                  <>
                    <KV k="Interest saved" v={<span className="text-ok">{formatMoney(sim.interestSaved, ctx)}</span>} />
                    <KV k="EMIs fewer" v={sim.monthsSaved} />
                    <KV k="New last EMI" v={formatDate(sim.newEndDate)} />
                    <KV k="Was" v={formatDate(sim.oldEndDate)} />
                    <p className="mt-2 text-[12px] text-ink-3">Assumes your lender keeps the EMI the same and shortens the tenure.</p>
                  </>
                ) : (
                  <p className="text-[13.5px] text-ink-2">Enter an amount to see how much interest and time a part-payment saves.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Chits() {
  const { positions } = useFinance();
  const chits = [...positions.chits.values()];
  if (!chits.length) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="No chits"
        body="Track chit funds month by month: each installment's auction result, what you actually paid, your payout, and what's still to come."
        action={<Button variant="primary" onClick={() => useUI.getState().openEditor("chit")}>Add a chit</Button>}
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {chits.map((c) => (
        <ChitCard key={c.chit.id} cp={c} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DebtPlanner() {
  const { positions, norms, today, assumptions, ctx } = useFinance();
  const [extra, setExtra] = useState<number | null>(5000);
  const debts: DebtInput[] = useMemo(() => {
    const out: DebtInput[] = [];
    for (const c of positions.cards.values()) if (c.outstanding > 0 && !c.card.archived) out.push({ id: c.card.id, name: c.card.name, balance: c.outstanding, rate: c.card.interest_rate_apr, minPayment: Math.max(200, c.outstanding * 0.05) });
    for (const l of positions.loans.values()) if (l.loan.status === "active" && l.state.outstanding > 0) out.push({ id: l.loan.id, name: l.loan.name, balance: l.state.outstanding, rate: l.loan.interest_rate, minPayment: l.state.emi });
    for (const l of positions.lendings.values()) if (l.lending.direction === "borrowed" && l.outstanding > 0) out.push({ id: l.lending.id, name: `Owed to ${l.lending.person}`, balance: l.outstanding, rate: l.lending.interest_rate, minPayment: Math.max(500, l.outstanding / 12) });
    return out;
  }, [positions]);
  const plans = useMemo(
    () => ({
      minimum: debtPlan(debts, 0, "minimum"),
      snowball: debtPlan(debts, extra ?? 0, "snowball"),
      avalanche: debtPlan(debts, extra ?? 0, "avalanche"),
    }),
    [debts, extra],
  );
  if (!debts.length) return <EmptyState title="No debts to plan" body="You don't owe anything right now. 🎉" />;
  const total = debts.reduce((s, d) => s + d.balance, 0);
  const highest = [...debts].sort((a, b) => b.rate - a.rate)[0];
  const eq = assumptions.scenarios.base.returns.equity;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Panel title="Your debts" description={`${formatMoney(total, ctx)} across ${debts.length}`}>
          <ul className="divide-y divide-line">
            {debts.map((d) => (
              <li key={d.id} className="py-2 text-[13.5px]">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{d.name}</span>
                  <span className="num">{formatMoney(d.balance, ctx)}</span>
                </div>
                <p className="text-[12px] text-ink-3">
                  {formatPct(d.rate)} · min {formatMoney(d.minPayment, ctx)}/mo
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-line pt-3">
            <KV k="Debt to monthly income" v={norms.income > 0 ? formatPct((total / (norms.income * 12)) * 100, 0) + " of a year's income" : "—"} />
          </div>
        </Panel>
        <Panel title="Pay it off faster" description="Put a fixed extra amount towards debt each month and compare strategies">
          <Field label="Extra each month" htmlFor="debt-extra">
            <AmountInput id="debt-extra" value={extra} onChange={setExtra} />
          </Field>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[460px] text-[13.5px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-3">
                  <th className="py-2 font-medium">Strategy</th>
                  <th className="py-2 text-right font-medium">Debt-free</th>
                  <th className="py-2 text-right font-medium">Interest</th>
                  <th className="py-2 text-right font-medium">Saves</th>
                </tr>
              </thead>
              <tbody className="num">
                {(
                  [
                    ["minimum", "Minimum payments only"],
                    ["snowball", "Snowball — smallest balance first"],
                    ["avalanche", "Avalanche — highest interest first"],
                  ] as const
                ).map(([k, label]) => {
                  const p = plans[k];
                  return (
                    <tr key={k} className="border-t border-line">
                      <td className="py-2.5 pr-3 font-sans">{label}</td>
                      <td className="py-2.5 text-right">{p.feasible ? formatDate(addMonths(today, p.months), "medium") : "Never at this pace"}</td>
                      <td className="py-2.5 text-right">{formatMoney(p.totalInterest, ctx)}</td>
                      <td className="py-2.5 text-right text-ok">{k === "minimum" ? "—" : formatMoney(plans.minimum.totalInterest - p.totalInterest, ctx)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <p className="text-[13px] font-medium">Avalanche payoff order</p>
            <ol className="mt-1 flex flex-wrap gap-2 text-[12.5px]">
              {plans.avalanche.payoff.map((p, i) => (
                <li key={p.id} className="rounded-full bg-surface-3 px-2.5 py-1">
                  {i + 1}. {p.name} · {formatDate(addMonths(today, p.month), "short")}
                </li>
              ))}
            </ol>
          </div>
        </Panel>
      </div>
      <Panel title="Invest or prepay?">
        <p className="text-[14px] text-ink-2">
          Your costliest debt is <strong className="text-ink">{highest.name}</strong> at {formatPct(highest.rate)}. You assume equity returns of {formatPct(eq)}.{" "}
          {highest.rate > eq
            ? "Paying this down is a guaranteed return higher than you expect from investing — prioritise it."
            : highest.rate > eq - 3
              ? "It's close: prepaying gives a guaranteed return, investing an uncertain one. Splitting the extra is reasonable."
              : "Investing may earn more than this debt costs, but returns aren't guaranteed while the interest is."}
        </p>
      </Panel>
    </div>
  );
}


/** §3.1 — statement vs outstanding, minimum due, what's reserved for the next payment, and whether it's funded. */
function CardPlanner({ cp, nextBill, near }: { cp: CardPosition; nextBill?: FinEvent; near: ProjectionResult }) {
  const { ds, ctx } = useFinance();
  const alertPct = ds.profile.preferences?.utilAlert ?? 30;
  const open = cp.statements.filter((s) => s.remaining > 0.5).at(-1);
  const after = nextBill ? near.timeline.find((t) => t.event.key === nextBill.key) : undefined;
  const funded = !after || after.cashAfter >= 0;
  const m = (n: number) => formatMoney(n, ctx);
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-4 rounded-xl border border-line p-3 text-[13px]">
      <KV k="Statement balance" v={open ? m(open.remaining) : "—"} />
      <KV k="Total outstanding" v={m(cp.outstanding)} />
      <KV k="Minimum due" v={open ? m(open.statement.min_due) : "—"} />
      <KV k="Reserved for next payment" v={nextBill ? m(nextBill.remaining) : "—"} />
      {nextBill && (nextBill.reimbursablePart ?? 0) > 0.5 && <KV k="Of which others repay you" v={<span className="text-future-ink">{m(nextBill.reimbursablePart!)}</span>} />}
      <KV k="Utilisation" v={<span className={cp.utilization * 100 > alertPct ? "font-semibold text-warn" : ""}>{formatPct(cp.utilization * 100, 0)}{cp.utilization * 100 > alertPct ? ` · above your ${alertPct}% alert` : ""}</span>} />
      {nextBill && after && (
        <p className={cn("col-span-2 mt-1 text-[12.5px]", funded ? "text-ok" : "text-danger")}>
          {funded
            ? `✓ Funded — your cash covers the ${formatDate(nextBill.date, "short")} payment.`
            : `⚠️ Not fully funded — paying on ${formatDate(nextBill.date, "short")} would leave ${m(after!.cashAfter)}. Paying late adds interest (${formatPct(cp.card.interest_rate_apr, 0)} a year) and a late fee.`}
        </p>
      )}
    </div>
  );
}
