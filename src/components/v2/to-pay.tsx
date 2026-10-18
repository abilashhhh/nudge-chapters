"use client";

import { Check, ChevronRight, CreditCard, Landmark, PiggyBank } from "lucide-react";
import { CardVisual } from "./card-visual";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatDate, monthKey, startOfMonth } from "@/lib/dates";
import { dueDateFor, statementDateOnOrAfter } from "@/lib/engine/events";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/money";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";
import { billInMonth, cardGrid, chitSipGrid, loanGrid, monthRange, orderForMonth, sumCells, type GridGroup } from "@/lib/v2/grids";
import { useStore } from "@/lib/store";
import { Money } from "../money";
import { Button } from "../ui/button";
import { EmptyState, Tabs } from "../ui/misc";
import { LoanPlanSheet } from "./loan-sheet";
import { MonthGrid, monthLabel, monthPaid, openCell, useGridMonths } from "./month-grid";
import { AMOUNT_CLS, StatTile, StatusText, useRangeEvents, V2PageHeader } from "./ui";
import { Cell2, DataTable, Details } from "./data-table";

const TABS = ["all", "cards", "chits", "loans"] as const;
type Tab = (typeof TABS)[number];

export function ToPayScreen() {
  const [tab, setTab] = useTab(TABS, "all");
  const { month, ds } = useFinance();
  return (
    <>
      <V2PageHeader title="To Pay" />
      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="Still to pay" value={month.unpaidAmount} note={`${month.unpaid.length} this month`} />
        <StatTile label="Late" value={month.overdueAmount} tone="danger" note={month.overdue.length ? `${month.overdue.length} late` : "Nothing late"} />
        <StatTile label="Paid this month" value={month.committedPaid} />
      </div>
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "all", label: "All" },
          { id: "cards", label: "Credit cards", count: ds.credit_cards.filter((c) => !c.archived).length },
          { id: "chits", label: "Chits & SIPs" },
          { id: "loans", label: "Loans & borrowed" },
        ]}
      />
      {tab === "all" && <AllToPay goTab={setTab} />}
      {tab === "cards" && <Cards />}
      {tab === "chits" && <ChitsSips />}
      {tab === "loans" && <Loans />}
    </>
  );
}

// ---------------------------------------------------------------------------

function Cards() {
  const { ds, positions, today, ctx } = useFinance();
  const months = useGridMonths();
  const events = useRangeEvents(months);
  const data = useMemo(() => cardGrid(ds, positions, events, months, today), [ds, positions, events, months, today]);
  const ui = useUI.getState();
  const router = useRouter();
  const month = today.slice(0, 7);
  // Cards with a bill to pay come first (late, then soonest due), then the rest by what's owed on them.
  const order = new Map(orderForMonth(data.groups, month).map((g, i) => [g.ref?.id, Math.abs(g.total.cells[month]?.amount ?? 0) > 0.005 && g.total.cells[month]?.status !== "paid" ? i : 1000]));
  const owed = (id: string) => positions.cards.get(id)?.outstanding ?? 0;
  const cards = ds.credit_cards.filter((c) => !c.archived).sort((a, b) => (order.get(a.id) ?? 1000) - (order.get(b.id) ?? 1000) || owed(b.id) - owed(a.id));
  const shared = (c: (typeof cards)[number]) => {
    const k = c.shared_limit_group?.trim().toLowerCase();
    if (!k || cards.filter((x) => x.shared_limit_group?.trim().toLowerCase() === k).length < 2) return undefined;
    return `Shared ${c.shared_limit_group} limit · ${Math.round((positions.cards.get(c.id)?.utilization ?? 0) * 100)}% used`;
  };
  return (
    <>
    {cards.length > 0 && (
      <section aria-label="Your cards" className="no-scrollbar -mx-4 mb-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {cards.map((c, i) => {
          const g = data.groups.find((x) => x.ref?.id === c.id);
          const cell = g?.total.cells[month];
          const tone = !cell || cell.amount <= 0 ? null : cell.status === "paid" ? "paid" : cell.status === "late" ? "late" : cell.status === "due" ? "soon" : null;
          const due = cell && cell.amount > 0 ? `${formatMoney(cell.amount, ctx)} ${cell.status === "paid" ? "paid" : cell.status === "late" ? "late" : "this month"}` : "Nothing due this month";
          return (
            <div key={c.id} className="w-[82%] max-w-[340px] shrink-0 snap-center sm:w-auto sm:max-w-none">
              <CardVisual card={c} index={i} used={positions.cards.get(c.id)?.utilization} usedLabel={shared(c)} due={due} dueTone={tone} onClick={() => router.push(`/to-pay/card?id=${c.id}`)} />
            </div>
          );
        })}
      </section>
    )}
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
      monthAdd={{ label: (m) => `Add bill for ${monthLabel(m)}`, run: (g, m) => addBill(g, m) }}
      bottomAdd={{ label: "Add a card", run: () => ui.openEditor("card") }}
      empty={<EmptyState icon={CreditCard} title="No credit cards yet" body="Add each card with its bill date and due date. Its EMIs and spends then show here month by month." />}
      footnote="Card total = EMIs + spends on that bill. EMIs on a card are paid through the card bill, so they are never added to the total twice."
    />
    </>
  );
}

/** Everything to pay in one month — one line per card, chit, SIP or loan — kept deliberately simple. */
function AllToPay({ goTab }: { goTab: (t: Tab) => void }) {
  const { ds, positions, today } = useFinance();
  const months = useMemo(() => monthRange(startOfMonth(today), 6), [today]);
  const events = useRangeEvents(months);
  const parts = useMemo(
    () => [
      { tab: "cards" as const, title: "Credit cards", data: cardGrid(ds, positions, events, months, today) },
      { tab: "chits" as const, title: "Chits & SIPs", data: chitSipGrid(ds, positions, events, months, today) },
      { tab: "loans" as const, title: "Loans & borrowed", data: loanGrid(ds, positions, events, months, today) },
    ],
    [ds, positions, events, months, today],
  );
  const all = useMemo(() => {
    const groups = parts.flatMap((p) => p.data.groups);
    return { months, groups, grand: sumCells(groups.map((g) => g.total.cells), months) };
  }, [parts, months]);
  const cur = monthKey(today);
  const firstOpen = months.find((m) => monthOpenAll(all, m)) ?? cur;
  const [pick, setPick] = useState<string | null>(null);
  const m = pick && months.includes(pick) ? pick : firstOpen;
  const cells = parts.flatMap((p) => p.data.groups.map((g) => ({ p, g, c: g.total.cells[m] }))).filter((x) => x.c && Math.abs(x.c.amount) > 0.005);
  const left = cells.filter((x) => x.c!.status !== "paid" && x.c!.status !== "skipped").reduce((s2, x) => s2 + x.c!.amount, 0);
  const paid = cells.filter((x) => x.c!.status === "paid").reduce((s2, x) => s2 + x.c!.amount, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="radiogroup" aria-label="Month">
        {months.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={m === k}
            onClick={() => setPick(k)}
            className={cn("h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium", m === k ? "bg-inverse text-on-inverse" : "bg-surface-3/70 text-ink-2 hover:text-ink")}
          >
            {monthPaid(all, k) && <Check className="-ml-0.5 mr-1 inline h-3.5 w-3.5 text-ok" aria-label="All paid" />}
            {monthLabel(k)}
            {k === cur ? " · now" : ""}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-inverse px-4 py-3 text-on-inverse">
          <p className="text-[12.5px] opacity-75">Still to pay in {monthLabel(m)}</p>
          <Money value={left} decimals className="text-[20px] font-semibold text-inherit" />
        </div>
        <div className="rounded-2xl border border-line bg-surface px-4 py-3">
          <p className="text-[12.5px] text-ink-3">Paid</p>
          <Money value={paid} decimals className="text-[20px] font-semibold text-ok" />
        </div>
      </div>
      {cells.length === 0 && <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[14px] text-ink-2">Nothing to pay in {monthLabel(m)}.</p>}
      {parts.map((p) => {
        const list = orderForMonth(p.data.groups, m).filter((g) => g.total.cells[m] && Math.abs(g.total.cells[m].amount) > 0.005);
        if (!list.length) return null;
        return (
          <section key={p.tab} aria-label={p.title} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <button type="button" onClick={() => goTab(p.tab)} className="flex w-full items-center justify-between border-b border-line px-4 py-2.5 text-left hover:bg-surface-2">
              <span className="text-[13px] font-semibold text-ink-2">{p.title}</span>
              <span className="inline-flex items-center gap-0.5 text-[12.5px] text-ink-3">
                Details <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </span>
            </button>
            <ul className="divide-y divide-line/70">
              {list.map((g) => {
                const c = g.total.cells[m];
                return (
                  <li key={g.id}>
                    <button type="button" onClick={() => !openCell(c) && goTab(p.tab)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-medium">{g.label}</span>
                        <StatusText status={c.status} className="text-[12px]" />
                      </span>
                      <Money value={c.amount} decimals projected={c.estimated && c.status === "upcoming"} className={cn("shrink-0 text-[15px] font-semibold", AMOUNT_CLS[c.status])} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function monthOpenAll(data: { groups: GridGroup[] }, m: string) {
  return data.groups.some((g) => {
    const c = g.total.cells[m];
    return !!c && Math.abs(c.amount) > 0.005 && c.status !== "paid" && c.status !== "skipped";
  });
}

/** Record a bill on a card, due in the month you tapped. */
function addBill(g: GridGroup, m: string) {
  const card = g.ref?.kind === "card" ? useStore.getState().ds?.credit_cards.find((c) => c.id === g.ref!.id) : undefined;
  if (!card) return;
  const b = billInMonth(card, m);
  useUI.getState().openEditor("statement", undefined, { card_id: card.id, statement_date: b.statement, due_date: b.due, total_due: 0 });
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 lg:grid-cols-8">
        <Fact k="Bill date" v={`${formatDate(nextS, "short")} (every ${ordinal(card.statement_day)})`} />
        <Fact k="Due date" v={`${formatDate(dueDateFor(card, nextS), "short")} (every ${ordinal(card.due_day)})`} />
        <Fact k="Limit" v={formatMoney(card.credit_limit, ctx)} />
        <Fact k="Limit used" v={<span className={cn(util > 0.7 ? "text-danger" : util > 0.3 ? "text-warn" : "text-ok")}>{formatPct(util * 100, 0)}</span>} />
        <Fact k="Minimum to pay" v={lastSt && lastSt.remaining > 0 ? formatMoney(lastSt.statement.min_due, ctx, { decimals: true }) : "–"} />
        <Fact k="New spends (not billed yet)" v={<Money value={cp.unbilled} decimals className="text-ink-2" />} />
        <Fact k="EMIs still to come" v={<Money value={Number(g.meta?.emiLeft ?? 0)} decimals className="text-ink-2" />} />
        <Fact k="All dues on this card" v={<Money value={Number(g.meta?.totalDue ?? 0)} decimals />} />
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
  const { ds, positions, today } = useFinance();
  const months = useGridMonths();
  const events = useRangeEvents(months);
  const data = useMemo(() => chitSipGrid(ds, positions, events, months, today), [ds, positions, events, months, today]);
  const ui = useUI.getState();
  return (
    <MonthGrid
      data={data}
      nameHeader="Item"
      forHeader={null}
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
  const data = useMemo(() => loanGrid(ds, positions, events, months, today), [ds, positions, events, months, today]);
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
        <DataTable
          label="Loans and money borrowed"
          rows={[...loans.map((l) => ({ kind: "loan" as const, id: l.loan.id, l })), ...borrowed.map((b) => ({ kind: "borrow" as const, id: b.l.id, b }))]}
          rowKey={(r) => r.id}
          initiallyOpen={params.get("loan")}
          rowClassName={(r) => ((r.kind === "loan" ? r.l.loan.status !== "active" : (r.b.p?.outstanding ?? 0) <= 0.5) ? "text-ink-3" : undefined)}
          columns={[
            {
              key: "n",
              header: "Name",
              cell: (r) => (r.kind === "loan" ? <Cell2 main={r.l.loan.name} sub={r.l.loan.lender ?? TYPE[r.l.loan.type]} /> : <Cell2 main={r.b.l.person} sub="Borrowed" />),
            },
            { key: "m", header: "Monthly", align: "right", wide: false, cell: (r) => (r.kind === "loan" ? m(r.l.state.emi) : "–") },
            {
              key: "left",
              header: "Still to pay",
              align: "right",
              cell: (r) => <span className="font-semibold">{m(r.kind === "loan" ? r.l.state.outstanding : r.b.p?.outstanding ?? 0)}</span>,
            },
          ]}
          details={(r) =>
            r.kind === "loan" ? (
              <Details
                items={[
                  ["From", r.l.loan.lender ?? "–"],
                  ["Type", TYPE[r.l.loan.type] ?? "Other"],
                  ["Paid so far", m(r.l.state.principalPaid + r.l.state.interestPaid)],
                  ["EMIs left", String(r.l.state.remainingInstallments)],
                  ["Last EMI", formatDate(r.l.state.endDate)],
                ]}
                actions={
                  <>
                    {r.l.loan.status === "active" && (
                      <Button size="sm" variant="primary" onClick={() => ui.openTx({ type: "loan_emi", loan_id: r.l.loan.id })}>
                        EMI paid
                      </Button>
                    )}
                    {r.l.loan.status === "active" && (
                      <Button size="sm" onClick={() => setSheet({ id: r.l.loan.id, view: "extra" })}>
                        Pay extra
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setSheet({ id: r.l.loan.id, view: "plan" })}>
                      Payment plan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => ui.openEditor("loan", r.l.loan.id)}>
                      Edit
                    </Button>
                  </>
                }
              />
            ) : (
              <Details
                items={[
                  ["Borrowed", m(r.b.l.amount)],
                  ["Paid back", m(r.b.p?.repaid ?? 0)],
                  ["Pay back by", r.b.l.expected_date ? formatDate(r.b.l.expected_date) : "No date"],
                  ...(r.b.l.notes ? ([["Note", r.b.l.notes]] as [string, string][]) : []),
                ]}
                actions={
                  <>
                    {(r.b.p?.outstanding ?? 0) > 0.5 && (
                      <Button size="sm" variant="primary" onClick={() => ui.openTx({ type: "borrow_repayment", lending_id: r.b.l.id })}>
                        Paid back
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => ui.openEditor("lending", r.b.l.id)}>
                      Edit
                    </Button>
                  </>
                }
              />
            )
          }
        />
      )}

      <div>
        <h2 className="mb-2 text-[16px] font-semibold">Month by month</h2>
        <MonthGrid
          data={data}
          nameHeader="Loan or person"
          forHeader={null}
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
