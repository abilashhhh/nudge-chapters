"use client";

import { LineChart, PiggyBank, Plus, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { INVESTMENT_TYPE_LABEL } from "@/lib/engine/defaults";
import type { InvestmentPosition } from "@/lib/engine/ledger";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct, toBase } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";
import { Money } from "../money";
import { Button } from "../ui/button";
import { NumberInput } from "../ui/form";
import { EmptyState, Tabs } from "../ui/misc";
import { Sheet } from "../ui/sheet";
import { StatTile, V2PageHeader } from "./ui";
import { Cell2, DataTable, Details } from "./data-table";
import { AllSavings } from "./all-money";

const TABS = ["all", "funds", "stocks", "epf", "chits", "commodities", "other"] as const;
type Tab = (typeof TABS)[number];

const isFund = (p: InvestmentPosition) => p.investment.type === "mutual_fund";
/** Each saving goes to exactly one section. */
function sectionOf(p: InvestmentPosition): Exclude<Tab, "chits" | "all"> {
  const t = p.investment.type;
  if (t === "mutual_fund") return "funds";
  if (t === "stock" || t === "etf") return "stocks";
  if (t === "epf" || t === "ppf" || t === "nps") return "epf";
  if (t === "gold" || p.investment.asset_class === "gold") return "commodities";
  return "other";
}
const SECTION: Record<"stocks" | "epf" | "commodities" | "other", { label: string; addType: string; empty: string; table: string }> = {
  stocks: { label: "Stocks", addType: "stock", empty: "Shares and ETFs you hold", table: "Stocks" },
  epf: { label: "EPF & PF", addType: "epf", empty: "EPF, PPF and NPS", table: "EPF and PF" },
  commodities: { label: "Commodities", addType: "gold", empty: "Gold, silver and other commodities", table: "Commodities" },
  other: { label: "Other savings", addType: "fd", empty: "FDs, RDs, bonds, property or a vehicle", table: "Other savings" },
};

export function SavingsScreen() {
  const [tab0, setTab] = useTab(TABS, "all");
  const { positions, ctx } = useFinance();
  const invs = [...positions.investments.values()].filter((p) => !p.investment.archived);
  const chits = [...positions.chits.values()];
  const value = invs.reduce((s, p) => s + p.valueBase, 0) + chits.reduce((s, c) => s + c.asset, 0);
  const putIn = invs.reduce((s, p) => s + toBase(p.invested, p.investment.currency, ctx), 0) + chits.reduce((s, c) => s + c.asset, 0);
  const profit = value - putIn;
  const count = (t: Tab) => invs.filter((p) => sectionOf(p) === t).length;
  // Mutual funds and Chits are always there; the others show up once you have something in them.
  const visible = TABS.filter((t) => t === "all" || t === "funds" || t === "chits" || count(t) > 0);
  const tab: Tab = visible.includes(tab0) ? tab0 : "all";
  return (
    <>
      <V2PageHeader title="Savings" />
      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="Total saved" value={value} note="Value today" />
        <StatTile label="Money put in" value={putIn} />
        <StatTile label={profit >= 0 ? "Profit" : "Loss"} value={profit} tone="auto" note={putIn > 0 ? `${formatPct((profit / putIn) * 100)}` : undefined} />
      </div>
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={visible.map((id) => ({ id, label: id === "all" ? "All" : id === "funds" ? "Mutual funds" : id === "chits" ? "Chits" : SECTION[id].label, count: id === "all" ? undefined : id === "chits" ? chits.length : count(id) }))}
      />
      {tab === "all" && <AllSavings />}
      {tab === "funds" && <Funds list={invs.filter(isFund)} />}
      {tab === "chits" && <Chits />}
      {(tab === "stocks" || tab === "epf" || tab === "commodities" || tab === "other") && <Other list={invs.filter((p) => sectionOf(p) === tab)} section={tab} />}
      <p className="mt-4 hidden text-[12.5px] text-ink-3 lg:block">Values are what you type in — this app doesn&apos;t fetch live prices.</p>
    </>
  );
}

// ---------------------------------------------------------------------------

function Funds({ list }: { list: InvestmentPosition[] }) {
  const { ctx } = useFinance();
  const [update, setUpdate] = useState(false);
  const ui = useUI.getState();
  const m = (n: number) => formatMoney(n, ctx, { decimals: true });
  if (!list.length)
    return (
      <EmptyState
        icon={LineChart}
        title="No mutual funds yet"
        body="Add a fund with the money you put in and its value today. Add a monthly investment (SIP) to see it in To Pay too."
        action={
          <Button variant="primary" onClick={() => ui.openEditor("investment", undefined, { type: "mutual_fund" })}>
            Add a fund
          </Button>
        }
      />
    );
  const tot = list.reduce((s, p) => ({ sip: s.sip + (p.investment.sip_active ? p.investment.sip_amount : 0), inv: s.inv + p.invested, val: s.val + p.valueBase }), { sip: 0, inv: 0, val: 0 });
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => setUpdate(true)}>
          Update value
        </Button>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("investment", undefined, { type: "mutual_fund" })}>
          Add a fund
        </Button>
      </div>
      <DataTable
        label="Mutual funds"
        rows={list}
        rowKey={(p) => p.investment.id}
        columns={[
          { key: "n", header: "Fund", cell: (p) => <Cell2 main={p.investment.name} sub={p.investment.sip_active && p.investment.sip_amount > 0 ? `SIP ${formatMoney(p.investment.sip_amount, ctx)} a month` : undefined} /> },
          { key: "v", header: "Value today", align: "right", cell: (p) => <Money value={p.value} decimals currency={p.investment.currency} className="font-semibold" /> },
          {
            key: "g",
            header: "Profit",
            align: "right",
            wide: true,
            cell: (p) => <Money value={p.gain} decimals sign className={cn(p.gain < 0 ? "text-danger" : "text-ok")} />,
          },
        ]}
        details={(p) => {
          const i = p.investment;
          return (
            <Details
              items={[
                ["Money put in", m(p.invested)],
                ["Profit", `${m(p.gain)} (${formatPct(p.gainPct)})`],
                ["Monthly SIP", i.sip_active && i.sip_amount > 0 ? `${m(i.sip_amount)} · every ${i.sip_day ?? "month"}` : "–"],
                ["Yearly return", p.xirr != null ? formatPct(p.xirr) : "Not enough history"],
                ...(p.units != null ? ([["Units", p.units.toLocaleString("en-IN", { maximumFractionDigits: 4 })]] as [string, string][]) : []),
                ["Last updated", i.value_as_of ? formatDate(i.value_as_of, "short") : "–"],
              ]}
              actions={
                <>
                  <Button size="sm" onClick={() => ui.openTx({ type: "invest_buy", investment_id: i.id, account_id: i.sip_account_id ?? undefined })}>
                    Buy
                  </Button>
                  <Button size="sm" onClick={() => ui.openTx({ type: "invest_sell", investment_id: i.id })}>
                    Sell
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => ui.openEditor("investment", i.id)}>
                    Edit
                  </Button>
                </>
              }
            />
          );
        }}
        footer={[
          "Total",
          <Money key="v" value={tot.val} decimals className="font-bold" />,
          <Money key="g" value={tot.val - tot.inv} decimals sign className={cn("font-bold", tot.val - tot.inv < 0 ? "text-danger" : "text-ok")} />,
        ]}
      />
      {update && <UpdateValueSheet list={list} onClose={() => setUpdate(false)} />}
    </div>
  );
}

/** One sheet listing every fund with a box for today's value; saves them all at once. */
function UpdateValueSheet({ list, onClose }: { list: InvestmentPosition[]; onClose: () => void }) {
  const { today, ctx } = useFinance();
  const patch = useStore((s) => s.patch);
  const add = useStore((s) => s.add);
  const [vals, setVals] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Update value"
      description="Type each one's value today from your app or statement. Leave a box empty to keep it as it is."
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
                  if (p.units != null && p.units > 0) await patch("investments", p.investment.id, { current_price: Math.round((v / p.units) * 10000) / 10000, value_as_of: today });
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
            Save all
          </Button>
        </div>
      }
    >
      <ul className="divide-y divide-line">
        {list.map((p) => (
          <li key={p.investment.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium">{p.investment.name}</p>
              <p className="num text-[12px] text-ink-3">
                Now {formatMoney(p.value, { ...ctx, currency: p.investment.currency }, { decimals: true })}
                {p.investment.value_as_of ? ` · ${formatDate(p.investment.value_as_of, "short")}` : ""}
              </p>
            </div>
            <NumberInput
              aria-label={`Value today for ${p.investment.name}`}
              className="w-36"
              placeholder="Value today"
              value={vals[p.investment.id] ?? ""}
              onChange={(e) => setVals({ ...vals, [p.investment.id]: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

function Chits() {
  const { positions, ctx } = useFinance();
  const ui = useUI.getState();
  const list = [...positions.chits.values()];
  const m = (n: number) => formatMoney(n, ctx, { decimals: true });
  if (!list.length)
    return (
      <EmptyState
        icon={PiggyBank}
        title="No chits yet"
        body="Add a chit to see what you've paid, the discounts you got and the amount you'll receive."
        action={
          <Button variant="primary" onClick={() => ui.openEditor("chit")}>
            Add a chit
          </Button>
        }
      />
    );
  return (
    <div>
      <div className="mb-3">
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("chit")}>
          Add a chit
        </Button>
      </div>
      <DataTable
        label="Chits"
        rows={list}
        rowKey={(cp) => cp.chit.id}
        columns={[
          { key: "n", header: "Chit", cell: (cp) => <Cell2 main={cp.chit.name} sub={`${cp.summary.paidCount} of ${cp.chit.installments} paid`} /> },
          { key: "d", header: "Dividend", align: "right", wide: true, cell: (cp) => <span className="text-ok">{m(cp.summary.auctionSavings)}</span> },
          { key: "p", header: "Paid so far", align: "right", cell: (cp) => <span className="font-semibold">{m(cp.summary.actualPaid + (cp.summary.unrecordedEstimate || 0))}</span> },
        ]}
        details={(cp) => {
          const c = cp.chit;
          const s = cp.summary;
          const received = c.payout_status === "received" || s.payoutReceived != null;
          return (
            <Details
              items={[
                ["Chit value", m(c.chit_value)],
                ["Monthly", m(c.monthly_contribution)],
                ["Dividend earned", <span key="d" className="text-ok">{m(s.auctionSavings)}</span>],
                ["Amount received?", received ? `✓ ${c.payout_date ? formatDate(c.payout_date, "short") : "Yes"}` : "Not yet"],
                ["Expected amount", received ? m(s.payoutReceived ?? c.payout_amount ?? 0) : <span className="projected">{m(s.payoutExpected)}</span>],
                ["Ends", formatDate(cp.endDate)],
              ]}
              actions={
                <>
                  {c.status === "active" && s.nextUnpaid && (
                    <Button size="sm" variant="primary" onClick={() => ui.openTx({ type: "chit_installment", chit_id: c.id })}>
                      Pay
                    </Button>
                  )}
                  {!received && (
                    <Button size="sm" onClick={() => ui.openTx({ type: "chit_payout", chit_id: c.id })}>
                      Got chit amount
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => ui.openChitSheet(c.id)}>
                    Installments
                  </Button>
                </>
              }
            />
          );
        }}
      />
      <p className="mt-2 hidden text-[12.5px] text-ink-3 lg:block">
        <span className="projected">Violet</span> amounts are estimates: future discounts depend on each month&apos;s auction.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Other({ list, section }: { list: InvestmentPosition[]; section: "stocks" | "epf" | "commodities" | "other" }) {
  const meta = SECTION[section];
  const { ctx } = useFinance();
  const ui = useUI.getState();
  const m = (n: number) => formatMoney(n, ctx, { decimals: true });
  const sorted = useMemo(() => [...list].sort((a, b) => b.valueBase - a.valueBase), [list]);
  if (!list.length)
    return (
      <EmptyState
        icon={Wallet}
        title={`No ${meta.label.toLowerCase()} yet`}
        body={`${meta.empty} — add each with what you put in and its value today.`}
        action={
          <Button variant="primary" onClick={() => ui.openEditor("investment", undefined, { type: meta.addType })}>
            Add savings
          </Button>
        }
      />
    );
  const retirement = (t: string) => t === "epf" || t === "ppf" || t === "nps";
  return (
    <div>
      <div className="mb-3">
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("investment", undefined, { type: meta.addType })}>
          {section === "other" ? "Add savings" : `Add to ${meta.label}`}
        </Button>
      </div>
      <DataTable
        label={meta.table}
        rows={sorted}
        rowKey={(p) => p.investment.id}
        columns={[
          { key: "n", header: "Name", cell: (p) => <Cell2 main={p.investment.name} sub={INVESTMENT_TYPE_LABEL[p.investment.type] ?? "Other"} /> },
          { key: "v", header: "Value today", align: "right", cell: (p) => <Money value={p.value} decimals currency={p.investment.currency} className="font-semibold" /> },
        ]}
        details={(p) => {
          const i = p.investment;
          const monthly = i.employee_contribution + i.employer_contribution;
          return (
            <Details
              items={[
                ["Money put in", m(p.invested)],
                ["Last updated", i.value_as_of ? formatDate(i.value_as_of, "short") : "–"],
                ...(retirement(i.type) ? ([["Goes in each month", monthly > 0 ? m(monthly) : "–"]] as [string, string][]) : []),
                ...(i.institution ? ([["Where", i.institution]] as [string, string][]) : []),
              ]}
              actions={
                <>
                  <Button size="sm" variant="primary" onClick={() => ui.openEditor("valuation", undefined, { investment_id: i.id })}>
                    Update value
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => ui.openEditor("investment", i.id)}>
                    Edit
                  </Button>
                </>
              }
            />
          );
        }}
        footer={["Total", <Money key="v" value={list.reduce((s, p) => s + p.valueBase, 0)} decimals className="font-bold" />]}
      />
    </div>
  );
}
