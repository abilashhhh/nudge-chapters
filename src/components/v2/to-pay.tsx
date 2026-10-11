"use client";

import { CreditCard, Landmark, PiggyBank } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { dueDateFor, statementDateOnOrAfter } from "@/lib/engine/events";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/money";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";
import { cardGrid, chitSipGrid, loanGrid, type GridGroup } from "@/lib/v2/grids";
import { Money } from "../money";
import { Button } from "../ui/button";
import { EmptyState, Tabs } from "../ui/misc";
import { LoanPlanSheet } from "./loan-sheet";
import { MonthGrid, useGridMonths } from "./month-grid";
import { StatTile, useRangeEvents, V2PageHeader } from "./ui";

const TABS = ["cards", "chits", "loans"] as const;
type Tab = (typeof TABS)[number];

export function ToPayScreen() {
  const [tab, setTab] = useTab(TABS, "cards");
  const { month, ds } = useFinance();
  return (
    <>
      <V2PageHeader title="To Pay" meaning="Bills, EMIs and installments you have to pay" />
      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="To pay this month" value={month.unpaidAmount} note={`${month.unpaid.length} payment${month.unpaid.length === 1 ? "" : "s"}`} />
        <StatTile label="Late" value={month.overdueAmount} tone="danger" note={month.overdue.length ? `${month.overdue.length} late` : "Nothing late"} />
        <StatTile label="Paid this month" value={month.committedPaid} />
      </div>
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "cards", label: "Credit cards", count: ds.credit_cards.filter((c) => !c.archived).length },
          { id: "chits", label: "Chits & SIPs" },
          { id: "loans", label: "Loans & borrowed" },
        ]}
      />
      {tab === "cards" && <Cards />}
      {tab === "chits" && <ChitsSips />}
      {tab === "loans" && <Loans />}
    </>
  );
}

// ---------------------------------------------------------------------------

function Cards() {
  const { ds, positions, today } = useFinance();
  const months = useGridMonths();
  const events = useRangeEvents(months);
  const data = useMemo(() => cardGrid(ds, positions, events, months, today), [ds, positions, events, months, today]);
  const ui = useUI.getState();
  return (
    <MonthGrid
      data={data}
      nameHeader="Credit card"
      forHeader="For"
      grandLabel="All cards"
      exportName="card-bills"
      onRow={(row) => {
        if (row.ref?.kind === "loan") ui.openEditor("loan", row.ref.id);
        else if (row.ref?.kind === "card-spends" || row.ref?.kind === "card") ui.openEditor("card", row.ref.id);
      }}
      groupDetails={(g) => <CardDetails g={g} />}
      groupAdd={{ label: "Add spend", run: (g) => g.ref && ui.openTx({ type: "card_spend", card_id: g.ref.id }) }}
      bottomAdd={{ label: "Add a card", run: () => ui.openEditor("card") }}
      empty={<EmptyState icon={CreditCard} title="No credit cards yet" body="Add each card with its bill date and due date. Its EMIs and spends then show here month by month." />}
      footnote="Card total = EMIs + spends on that bill. EMIs on a card are paid through the card bill, so they are never added to the total twice."
    />
  );
}

function CardDetails({ g }: { g: GridGroup }) {
  const { ds, positions, today, ctx } = useFinance();
  const card = ds.credit_cards.find((c) => c.id === g.ref?.id);
  const cp = card ? positions.cards.get(card.id) : undefined;
  if (!card || !cp) return null;
  const nextS = statementDateOnOrAfter(card, today);
  const lastSt = [...cp.statements].reverse()[0];
  const ui = useUI.getState();
  const util = cp.utilization;
  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        <Fact k="Bill date" v={`${formatDate(nextS, "short")} (every ${ordinal(card.statement_day)})`} />
        <Fact k="Due date" v={`${formatDate(dueDateFor(card, nextS), "short")} (every ${ordinal(card.due_day)})`} />
        <Fact k="Limit" v={formatMoney(card.credit_limit, ctx)} />
        <Fact k="Limit used" v={<span className={cn(util > 0.7 ? "text-danger" : util > 0.3 ? "text-warn" : "text-ok")}>{formatPct(util * 100, 0)}</span>} />
        <Fact k="Minimum to pay" v={lastSt && lastSt.remaining > 0 ? formatMoney(lastSt.statement.min_due, ctx, { decimals: true }) : "–"} />
        <Fact k="New spends (not billed yet)" v={<Money value={cp.unbilled} decimals className="text-ink-2" />} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => ui.openTx({ type: "card_payment", card_id: card.id })}>
          Pay bill
        </Button>
        <Button size="sm" onClick={() => ui.openTx({ type: "card_spend", card_id: card.id })}>
          Add spend
        </Button>
        <Button size="sm" onClick={() => ui.openEditor("statement", undefined, { card_id: card.id })}>
          Add bill
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ui.openEditor("loan", undefined, { type: "card_emi", card_id: card.id, payment_account_id: null, name: `${card.name} EMI` })}>
          Change to EMI
        </Button>
        <Button size="sm" variant="ghost" onClick={() => ui.openEditor("card", card.id)}>
          Edit card
        </Button>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-ink-3">{k}</p>
      <p className="num font-medium text-ink">{v}</p>
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------------------------------------------------------------------------

function ChitsSips() {
  const { ds, today } = useFinance();
  const months = useGridMonths();
  const events = useRangeEvents(months);
  const data = useMemo(() => chitSipGrid(ds, events, months, today), [ds, events, months, today]);
  const ui = useUI.getState();
  return (
    <MonthGrid
      data={data}
      nameHeader="Item"
      forHeader="Pay from"
      grandLabel="Total"
      exportName="chits-and-sips"
      onRow={(row) => {
        if (row.ref?.kind === "chit") ui.openChitSheet(row.ref.id);
        else if (row.ref?.kind === "sip") ui.openEditor("investment", row.ref.id);
      }}
      groupAdd={{
        label: (g) => (g.id === "chits" ? "Add a chit" : "Add a SIP"),
        run: (g) => (g.id === "chits" ? ui.openEditor("chit") : ui.openEditor("investment", undefined, { type: "mutual_fund", sip_active: true })),
      }}
      bottomAdd={{ label: data.groups.some((g) => g.id === "chits") ? "Add a SIP" : "Add a chit", run: () => (data.groups.some((g) => g.id === "chits") ? ui.openEditor("investment", undefined, { type: "mutual_fund", sip_active: true }) : ui.openEditor("chit")) }}
      empty={<EmptyState icon={PiggyBank} title="No chits or monthly investments" body="Add a chit or a monthly investment (SIP). What you pay each month shows here; what it's worth shows in Savings." />}
      footnote="Tap a chit's name for its installments, discounts and the amount received. After an auction the cell shows what you actually paid; future months show the full amount as an estimate."
    />
  );
}

// ---------------------------------------------------------------------------

function Loans() {
  const { ds, positions, today, ctx } = useFinance();
  const months = useGridMonths();
  const events = useRangeEvents(months);
  const data = useMemo(() => loanGrid(ds, events, months, today), [ds, events, months, today]);
  const params = useSearchParams();
  const [sheet, setSheet] = useState<{ id: string; view: "plan" | "extra" } | null>(null);
  useEffect(() => {
    const id = params.get("loan");
    if (id && positions.loans.has(id)) setSheet({ id, view: "plan" });
  }, [params, positions.loans]);
  const ui = useUI.getState();
  const loans = [...positions.loans.values()].filter((l) => !l.loan.card_id).sort((a, b) => (a.loan.status === b.loan.status ? b.state.outstanding - a.state.outstanding : a.loan.status === "active" ? -1 : 1));
  const borrowed = ds.lendings.filter((l) => l.direction === "borrowed").map((l) => ({ l, p: positions.lendings.get(l.id) }));
  const m = (n: number) => formatMoney(n, ctx, { decimals: true });
  const TYPE: Record<string, string> = { home: "Home", personal: "Personal", vehicle: "Vehicle", education: "Education", gold: "Gold", consumer: "Shopping", other: "Other", card_emi: "Card EMI" };

  return (
    <div className="flex flex-col gap-6">
      {loans.length + borrowed.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No loans or money borrowed"
          body="Add a bank loan or money you borrowed from someone. EMIs on a credit card stay with the card."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => ui.openEditor("loan")}>
                Add a loan
              </Button>
              <Button onClick={() => ui.openEditor("lending", undefined, { direction: "borrowed" })}>I borrowed money</Button>
            </div>
          }
        />
      ) : (
        <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
          <table className="v2-table w-full min-w-[44rem] text-[13.5px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">From</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 text-right font-medium">Monthly</th>
                <th className="px-3 py-2.5 text-right font-medium">Paid so far</th>
                <th className="px-3 py-2.5 text-right font-medium">Still to pay</th>
                <th className="px-3 py-2.5 text-right font-medium">EMIs left</th>
                <th className="px-3 py-2.5 font-medium">Last EMI</th>
                <th className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="num">
              {loans.map(({ loan, state }) => (
                <tr key={loan.id} className={cn("border-t border-line align-top", loan.status !== "active" && "text-ink-3")}>
                  <td className="px-3 py-2.5 font-medium">{loan.name}</td>
                  <td className="px-3 py-2.5">{loan.lender ?? "–"}</td>
                  <td className="px-3 py-2.5">{TYPE[loan.type] ?? "Other"}</td>
                  <td className="px-3 py-2.5 text-right">{m(state.emi)}</td>
                  <td className="px-3 py-2.5 text-right">{m(state.principalPaid + state.interestPaid)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{m(state.outstanding)}</td>
                  <td className="px-3 py-2.5 text-right">{state.remainingInstallments}</td>
                  <td className="px-3 py-2.5">{formatDate(state.endDate)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {loan.status === "active" && (
                        <Button size="sm" variant="primary" onClick={() => ui.openTx({ type: "loan_emi", loan_id: loan.id })}>
                          EMI paid
                        </Button>
                      )}
                      {loan.status === "active" && (
                        <Button size="sm" onClick={() => setSheet({ id: loan.id, view: "extra" })}>
                          Pay extra
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setSheet({ id: loan.id, view: "plan" })}>
                        Payment plan
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => ui.openEditor("loan", loan.id)}>
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {borrowed.map(({ l, p }) => (
                <tr key={l.id} className={cn("border-t border-line align-top", (p?.outstanding ?? 0) <= 0.5 && "text-ink-3")}>
                  <td className="px-3 py-2.5 font-medium">{l.notes || "Borrowed"}</td>
                  <td className="px-3 py-2.5">{l.person}</td>
                  <td className="px-3 py-2.5">Friend / family</td>
                  <td className="px-3 py-2.5 text-right">–</td>
                  <td className="px-3 py-2.5 text-right">{m(p?.repaid ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{m(p?.outstanding ?? 0)}</td>
                  <td className="px-3 py-2.5 text-right">–</td>
                  <td className="px-3 py-2.5">{l.expected_date ? formatDate(l.expected_date) : "No date"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {(p?.outstanding ?? 0) > 0.5 && (
                        <Button size="sm" variant="primary" onClick={() => ui.openTx({ type: "borrow_repayment", lending_id: l.id })}>
                          Paid back
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => ui.openEditor("lending", l.id)}>
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-[16px] font-semibold">Month by month</h2>
        <MonthGrid
          data={data}
          nameHeader="Loan or person"
          forHeader="From"
          grandLabel="Total"
          exportName="loans-and-borrowed"
          onRow={(row) => {
            if (row.ref?.kind === "loan") setSheet({ id: row.ref.id, view: "plan" });
            else if (row.ref?.kind === "lending") ui.openEditor("lending", row.ref.id);
          }}
          groupAdd={{
            label: (g) => (g.id === "loans" ? "Add a loan" : "I borrowed money"),
            run: (g) => (g.id === "loans" ? ui.openEditor("loan") : ui.openEditor("lending", undefined, { direction: "borrowed" })),
          }}
          empty={<p className="rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-ink-2">Nothing to pay on loans in these months.</p>}
          footnote="EMIs on a credit card are not listed here — they stay with their card in Credit cards."
        />
      </div>
      {sheet && <LoanPlanSheet loanId={sheet.id} view={sheet.view} onClose={() => setSheet(null)} />}
    </div>
  );
}
