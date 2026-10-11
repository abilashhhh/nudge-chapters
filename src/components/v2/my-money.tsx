"use client";

import { AlertTriangle, Landmark, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate, relativeDays } from "@/lib/dates";
import { reimbursements, type ReimbursementGroup } from "@/lib/engine/reimburse";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";
import { owedGrid } from "@/lib/v2/grids";
import type { Account } from "@/lib/types";
import { TxRow } from "../event-row";
import { Money } from "../money";
import { Button } from "../ui/button";
import { AmountInput, Field, Select } from "../ui/form";
import { EmptyState, Tabs } from "../ui/misc";
import { Sheet } from "../ui/sheet";
import { MonthGrid, useGridMonths } from "./month-grid";
import { StatTile, StatusText, useRangeEvents, V2PageHeader } from "./ui";
import { Cell2, DataTable, Details } from "./data-table";

const TABS = ["accounts", "owed"] as const;
type Tab = (typeof TABS)[number];

const TYPE_LABEL: Record<Account["type"], string> = { savings: "Savings", current: "Current", cash: "Cash", wallet: "Wallet (UPI)", other: "Other" };

export function MyMoneyScreen() {
  const [tab, setTab] = useTab(TABS, "accounts");
  const { positions } = useFinance();
  return (
    <>
      <V2PageHeader title="My Money" meaning="Money in your bank and money others owe you" />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:max-w-xl">
        <StatTile label="Money in bank" value={positions.totals.cash} onClick={() => setTab("accounts")} />
        <StatTile label="People owe me" value={positions.totals.receivables} onClick={() => setTab("owed")} />
      </div>
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "accounts", label: "Bank accounts" },
          { id: "owed", label: "People owe me" },
        ]}
      />
      {tab === "accounts" ? <Accounts /> : <Owed />}
    </>
  );
}

// ---------------------------------------------------------------------------

function Accounts() {
  const { ds, positions, ctx } = useFinance();
  const [showClosed, setShowClosed] = useState(false);
  const [fix, setFix] = useState<Account | null>(null);
  const [history, setHistory] = useState<Account | null>(null);
  const ui = useUI.getState();
  const list = ds.accounts.filter((a) => showClosed || !a.archived);
  const total = list.filter((a) => !a.archived && a.include_in_cash).reduce((s, a) => s + (positions.accounts.get(a.id)?.balanceBase ?? 0), 0);
  if (!ds.accounts.length) {
    return (
      <EmptyState
        icon={Landmark}
        title="No bank accounts yet"
        body="Add your savings account, salary account, cash in hand or UPI wallet with today's balance."
        action={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("account")}>
            Add account
          </Button>
        }
      />
    );
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("account")}>
          Add account
        </Button>
        {ds.accounts.some((a) => a.archived) && (
          <label className="flex items-center gap-2 text-[13.5px] text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            Show closed accounts
          </label>
        )}
      </div>
      <DataTable
        label="Bank accounts"
        rows={list}
        rowKey={(a) => a.id}
        rowClassName={(a) => (a.archived ? "text-ink-3" : undefined)}
        columns={[
          {
            key: "name",
            header: "Account",
            cell: (a) => {
              const bal = positions.accounts.get(a.id)?.balance ?? 0;
              return (
                <Cell2
                  main={a.name}
                  sub={
                    a.archived ? "Closed" : a.min_balance > 0 && bal < a.min_balance ? (
                      <span className="inline-flex items-center gap-1 text-warn">
                        <AlertTriangle className="h-3 w-3" aria-hidden /> Below minimum
                      </span>
                    ) : !a.include_in_cash ? "Not in money in bank" : undefined
                  }
                />
              );
            },
          },
          {
            key: "bal",
            header: "Balance",
            align: "right",
            cell: (a) => {
              const bal = positions.accounts.get(a.id)?.balance ?? 0;
              return <Money value={bal} decimals currency={a.currency} className={cn("font-semibold", bal < 0 && "text-danger")} />;
            },
          },
        ]}
        details={(a) => {
          const p = positions.accounts.get(a.id);
          return (
            <Details
              items={[
                ["Type", TYPE_LABEL[a.type]],
                ["Last checked", a.last_verified_at ? relativeDays(positions.asOf, a.last_verified_at) : "Not yet"],
                ...(a.min_balance > 0 ? ([["Keep at least", formatMoney(a.min_balance, ctx)]] as [string, string][]) : []),
                ...(a.currency !== ctx.currency ? ([["In " + ctx.currency, formatMoney(p?.balanceBase ?? 0, ctx)]] as [string, string][]) : []),
                ["Counted in money in bank", a.include_in_cash ? "Yes" : "No"],
              ]}
              actions={
                <>
                  <Button size="sm" variant="primary" onClick={() => setFix(a)}>
                    Fix balance
                  </Button>
                  <Button size="sm" onClick={() => setHistory(a)}>
                    History
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => ui.openEditor("account", a.id)}>
                    Edit
                  </Button>
                </>
              }
            />
          );
        }}
        footer={["Total", <Money key="t" value={total} decimals className="font-bold" />]}
      />
      {fix && <FixBalanceSheet a={fix} onClose={() => setFix(null)} />}
      {history && <HistorySheet a={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function FixBalanceSheet({ a, onClose }: { a: Account; onClose: () => void }) {
  const { positions, today, ctx } = useFinance();
  const add = useStore((s) => s.add);
  const patch = useStore((s) => s.patch);
  const balance = positions.accounts.get(a.id)?.balance ?? 0;
  const [actual, setActual] = useState<number | null>(balance);
  const [busy, setBusy] = useState(false);
  const diff = Math.round(((actual ?? 0) - balance) * 100) / 100;
  const c = { ...ctx, currency: a.currency };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Fix balance · ${a.name}`}
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
                if (Math.abs(diff) >= 0.01)
                  await add("transactions", { date: today, type: "adjustment", amount: diff, account_id: a.id, description: "Balance matched with bank", is_partial: false, reconciled: true, tags: ["reconcile"] });
                await patch("accounts", a.id, { last_verified_at: today });
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {Math.abs(diff) >= 0.01 ? "Fix balance" : "Looks right"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-ink-2">
          This app shows <span className="num font-semibold text-ink">{formatMoney(balance, c, { decimals: true })}</span>.
        </p>
        <Field label="What does your bank app show?" htmlFor="fix-actual">
          <AmountInput id="fix-actual" large value={actual} onChange={setActual} currency={a.currency} allowNegative />
        </Field>
        <p className={cn("rounded-xl px-3 py-2 text-[13.5px]", Math.abs(diff) < 0.01 ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
          {Math.abs(diff) < 0.01 ? "They match." : `We'll record the difference of ${formatMoney(diff, c, { sign: true, decimals: true })} so the two match. It doesn't count as spending or income.`}
        </p>
      </div>
    </Sheet>
  );
}

function HistorySheet({ a, onClose }: { a: Account; onClose: () => void }) {
  const { ds } = useFinance();
  const txs = useMemo(() => ds.transactions.filter((t) => t.account_id === a.id || t.to_account_id === a.id).slice(0, 20), [ds.transactions, a.id]);
  return (
    <Sheet open onClose={onClose} title={`History · ${a.name}`} description="The last 20 entries. Tap one to change it." size="md">
      {txs.length ? txs.map((t) => <TxRow key={t.id} t={t} accountId={a.id} />) : <p className="text-[14px] text-ink-3">Nothing recorded yet.</p>}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

function Owed() {
  const { ds, positions, today, events: nearEvents, ctx } = useFinance();
  const months = useGridMonths();
  const events = useRangeEvents(months);
  const groups = useMemo(() => reimbursements(ds, positions, today, nearEvents), [ds, positions, today, nearEvents]);
  const data = useMemo(() => owedGrid(ds, events, months, today), [ds, events, months, today]);
  const [repay, setRepay] = useState<ReimbursementGroup | null>(null);
  const ui = useUI.getState();
  const STATUS = { active: "upcoming", completed: "paid", overdue: "late", written_off: "skipped" } as const;

  if (!groups.length) {
    return (
      <EmptyState
        icon={Users}
        title="Nobody owes you money"
        body="When you lend money or pay for someone (like a laptop EMI on your card), add it here and see when they should pay you back."
        action={
          <Button variant="primary" onClick={() => ui.openEditor("lending", undefined, { direction: "lent" })}>
            I lent money
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("lending", undefined, { direction: "lent" })}>
            I lent money
          </Button>
        </div>
        <DataTable
          label="People who owe me"
          rows={groups}
          rowKey={(g) => g.key}
          columns={[
            {
              key: "p",
              header: "Person",
              cell: (g) => (
                <Cell2
                  main={g.person}
                  sub={
                    g.cardRisk ? (
                      <span className="inline-flex items-center gap-1 text-warn">
                        <AlertTriangle className="h-3 w-3" aria-hidden /> You pay first
                      </span>
                    ) : (
                      <StatusText status={STATUS[g.status]} incoming className="text-[11.5px]" />
                    )
                  }
                />
              ),
            },
            { key: "next", header: "Next", cell: (g) => (g.next ? formatDate(g.next.date, "short") : "–") },
            { key: "left", header: "Still to get", align: "right", cell: (g) => <Money value={g.outstanding} decimals className="font-semibold" /> },
          ]}
          details={(g) => (
            <Details
              items={[
                ["Reason", g.description],
                ["Total", formatMoney(g.total, ctx, { decimals: true })],
                ["Got back", formatMoney(g.received, ctx, { decimals: true })],
                ["Next amount", g.next ? formatMoney(g.next.amount, ctx, { decimals: true }) : "–"],
              ]}
              actions={
                g.outstanding > 0.5 ? (
                  <Button size="sm" variant="primary" onClick={() => setRepay(g)}>
                    Got money back
                  </Button>
                ) : undefined
              }
            >
              {g.cardRisk && (
                <p className="mt-2 flex items-start gap-1 text-[12.5px] text-warn">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  Your {g.cardRisk.card} bill is due {formatDate(g.cardRisk.billDate, "short")}, {g.person} pays {formatDate(g.cardRisk.repaymentDate, "short")} — you pay first.
                </p>
              )}
            </Details>
          )}
          footer={["Total", null, <Money key="t" value={groups.reduce((s, g) => s + g.outstanding, 0)} decimals className="font-bold" />]}
        />
      </div>
      <div>
        <h2 className="mb-2 text-[16px] font-semibold">When they should pay back</h2>
        <MonthGrid
          data={data}
          nameHeader="Person"
          forHeader={null}
          grandLabel="Total"
          exportName="people-owe-me"
          incoming
          onRow={(row) => {
            const g = groups.find((x) => x.person.toLowerCase() === row.ref?.id.toLowerCase());
            if (g) setRepay(g);
          }}
          empty={<p className="rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-ink-2">No repayments expected in these months. Add an expected date to a loan you gave to see it here.</p>}
          footnote="An EMI on your card that someone else pays for is linked here automatically (the “For” column in Credit cards)."
        />
      </div>
      {repay && <RepaySheet g={repay} onClose={() => setRepay(null)} />}
    </div>
  );
}

/** "Got money back": pick which of the person's amounts it's for, then record the repayment (full or part). */
function RepaySheet({ g, onClose }: { g: ReimbursementGroup; onClose: () => void }) {
  const { ctx } = useFinance();
  const open = g.items.filter((i) => i.outstanding > 0.5);
  const [id, setId] = useState(open[0]?.lending.id ?? "");
  const item = open.find((i) => i.lending.id === id);
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Got money back from ${g.person}`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!item}
            onClick={() => {
              onClose();
              if (item) useUI.getState().openTx({ type: "lend_repayment", lending_id: item.lending.id, amount: item.outstanding });
            }}
          >
            Next
          </Button>
        </div>
      }
    >
      {open.length === 0 ? (
        <p className="text-[14px] text-ink-2">Nothing left to get back.</p>
      ) : (
        <Field label="Which amount is this for?" htmlFor="repay-item" help="You can change the amount on the next step if they paid only part.">
          <Select id="repay-item" value={id} onChange={(e) => setId(e.target.value)}>
            {open.map((i) => (
              <option key={i.lending.id} value={i.lending.id}>
                {i.lending.person} · {formatMoney(i.outstanding, ctx, { decimals: true })} left{i.lending.expected_date ? ` · due ${formatDate(i.lending.expected_date, "short")}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Sheet>
  );
}
