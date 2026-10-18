"use client";

import { LineChart, PiggyBank, Plus, RefreshCw, Wallet } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { INVESTMENT_TYPE_LABEL } from "@/lib/engine/defaults";
import type { InvestmentPosition } from "@/lib/engine/ledger";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct, toBase, type MoneyContext } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { Money } from "../money";
import { Button } from "../ui/button";
import { NumberInput } from "../ui/form";
import { EmptyState, Tabs } from "../ui/misc";
import { Sheet } from "../ui/sheet";
import { StatTile, V2PageHeader } from "./ui";
import { Cell2, DataTable, Details, type Column } from "./data-table";
import { AllSavings } from "./all-money";
import { HoldingTile } from "./detail-pages";
import { useRouter } from "next/navigation";
import { refreshPrices, usePrices } from "../price-refresher";
import { priceItems } from "@/lib/prices";
import { toast } from "sonner";

export const SAVINGS_TABS = ["savings", "funds", "stocks", "epf", "chits", "commodities", "other"] as const;
export type SavingsTab = (typeof SAVINGS_TABS)[number];
type Tab = SavingsTab;

const isFund = (p: InvestmentPosition) => p.investment.type === "mutual_fund";
/** Each saving goes to exactly one section. */
function sectionOf(p: InvestmentPosition): Exclude<Tab, "chits" | "savings"> {
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

/** Savings totals and the savings tabs worth showing (Mutual funds and Chits always; the rest once they hold something). */
export function useSavings() {
  const { positions, ctx } = useFinance();
  const invs = [...positions.investments.values()].filter((p) => !p.investment.archived);
  const chits = [...positions.chits.values()];
  const value = invs.reduce((s, p) => s + p.valueBase, 0) + chits.reduce((s, c) => s + c.asset, 0);
  const putIn = invs.reduce((s, p) => s + toBase(p.invested, p.investment.currency, ctx), 0) + chits.reduce((s, c) => s + c.asset, 0);
  const count = (t: Tab) => (t === "chits" ? chits.length : invs.filter((p) => sectionOf(p) === t).length);
  const visible = SAVINGS_TABS.filter((t) => t === "savings" || t === "funds" || t === "chits" || count(t) > 0);
  const tabs = visible.map((id) => ({ id, label: id === "savings" ? "All savings" : id === "funds" ? "Mutual funds" : id === "chits" ? "Chits" : SECTION[id].label, count: id === "savings" ? undefined : count(id) }));
  return { invs, value, putIn, profit: value - putIn, tabs };
}

/** The body of one savings tab inside My Money. */
export function SavingsTabBody({ tab }: { tab: Tab }) {
  const { invs } = useSavings();
  return (
    <>
      {tab === "savings" && <AllSavings />}
      {tab === "funds" && <Funds list={invs.filter(isFund)} />}
      {tab === "chits" && <Chits />}
      {(tab === "stocks" || tab === "epf" || tab === "commodities" || tab === "other") && <Other list={invs.filter((p) => sectionOf(p) === tab)} section={tab} />}
      {(tab === "funds" || tab === "stocks" || tab === "chits") && <LivePricesNote />}
      <p className="mt-4 hidden text-[12.5px] text-ink-3 lg:block">
        Stocks and mutual funds update with the latest NSE/BSE price and AMFI NAV when you open the app. Other savings are the values you type in.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------

/** Each holding as a tile: tap one to open its page (value history, purchases, edit). */
function HoldingStrip({ ids, label }: { ids: string[]; label: string }) {
  const router = useRouter();
  if (!ids.length) return null;
  return (
    <section aria-label={label} className="no-scrollbar -mx-4 mb-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
      {ids.map((id, i) => (
        <div key={id} className="w-[82%] max-w-[340px] shrink-0 snap-center sm:w-auto sm:max-w-none">
          <HoldingTile id={id} index={i} onClick={() => router.push(`/my-money/holding?id=${id}`)} />
        </div>
      ))}
    </section>
  );
}

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
      <HoldingStrip label="Your mutual funds" ids={[...list].sort((a, b) => b.valueBase - a.valueBase).map((p) => p.investment.id)} />
      <DataTable
        label="Mutual funds"
        rows={list}
        rowKey={(p) => p.investment.id}
        columns={marketColumns(ctx, "Fund")}
        details={(p) => {
          const i = p.investment;
          return (
            <Details
              items={[
                ["Money put in", m(p.invested)],
                [p.gain < 0 ? "Loss" : "Profit", <span key="g" className={plClass(p.gain)}>{`${m(p.gain)} (${formatPct(p.gainPct)})`}</span>],
                ["Monthly SIP", i.sip_active && i.sip_amount > 0 ? `${m(i.sip_amount)} · every ${i.sip_day ?? "month"}` : "–"],
                ["Yearly return", p.xirr != null ? formatPct(p.xirr) : "Not enough history"],
                ...priceDetails(p, m),
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
        footer={marketFooter(tot.inv, tot.val)}
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
            <div className="w-32 shrink-0 sm:w-40">
              <NumberInput
                aria-label={`Value today for ${p.investment.name}`}
                className="w-full"
                placeholder="Value today"
                value={vals[p.investment.id] ?? ""}
                onChange={(e) => setVals({ ...vals, [p.investment.id]: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
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
      {section === "stocks" && <HoldingStrip label="Your stocks" ids={sorted.map((p) => p.investment.id)} />}
      <DataTable
        label={meta.table}
        rows={sorted}
        rowKey={(p) => p.investment.id}
        columns={
          section === "stocks"
            ? marketColumns(ctx, "Stock")
            : [
                { key: "n", header: "Name", cell: (p) => <Cell2 main={p.investment.name} sub={INVESTMENT_TYPE_LABEL[p.investment.type] ?? "Other"} /> },
                { key: "v", header: "Value today", align: "right", cell: (p) => <Money value={p.value} decimals currency={p.investment.currency} className="font-semibold" /> },
              ]
        }
        details={(p) => {
          const i = p.investment;
          const monthly = i.employee_contribution + i.employer_contribution;
          return (
            <Details
              items={[
                ["Money put in", m(p.invested)],
                ...(section === "stocks" ? ([[p.gain < 0 ? "Loss" : "Profit", <span key="g" className={plClass(p.gain)}>{`${m(p.gain)} (${formatPct(p.gainPct)})`}</span>], ...priceDetails(p, m)] as [ReactNode, ReactNode][]) : []),
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
        footer={
          section === "stocks"
            ? marketFooter(
                list.reduce((s, p) => s + toBase(p.invested, p.investment.currency, ctx), 0),
                list.reduce((s, p) => s + p.valueBase, 0),
              )
            : ["Total", <Money key="v" value={list.reduce((s, p) => s + p.valueBase, 0)} decimals className="font-bold" />]
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Average buy price per unit (what you put in ÷ units held). */
const boughtAt = (p: InvestmentPosition) => (p.units && p.units > 0 ? p.invested / p.units : null);
const unitsText = (u: number) => `${u.toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${u === 1 ? "unit" : "units"}`;

/** Fund and stock tables: bought at, price now, invested, value today, profit or loss. */
function marketColumns(ctx: MoneyContext, title: string): Column<InvestmentPosition>[] {
  const price = (n: number | null, cur: string) => (n != null ? formatMoney(n, { ...ctx, currency: cur }, { decimals: true }) : "–");
  return [
    {
      key: "n",
      header: title,
      cell: (p) => {
        const i = p.investment;
        const sip = i.sip_active && i.sip_amount > 0 ? `SIP ${formatMoney(i.sip_amount, ctx)} a month` : null;
        return (
          <Cell2
            main={i.name}
            sub={
              <>
                {p.units != null && <span>{unitsText(p.units)}</span>}
                {/* Prices are columns on wider screens; on phones they sit here. */}
                {p.units != null && (
                  <span className="sm:hidden">
                    {" "}
                    · {price(boughtAt(p), i.currency)} → {price(p.price, i.currency)}
                  </span>
                )}
                {sip && <span className="block">{sip}</span>}
              </>
            }
          />
        );
      },
    },
    { key: "b", header: "Bought at", align: "right", wide: true, cell: (p) => <span className="text-ink-2">{price(boughtAt(p), p.investment.currency)}</span> },
    {
      key: "c",
      header: "Price now",
      align: "right",
      wide: true,
      cell: (p) => (
        <span className="block">
          {price(p.price, p.investment.currency)}
          {p.investment.value_as_of && <span className="block text-[11.5px] text-ink-3">{formatDate(p.investment.value_as_of, "short")}</span>}
        </span>
      ),
    },
    { key: "i", header: "Invested", align: "right", cell: (p) => <Money value={p.invested} decimals currency={p.investment.currency} /> },
    { key: "v", header: "Current", align: "right", main: true, cell: (p) => <Money value={p.value} decimals currency={p.investment.currency} className="font-semibold" /> },
    {
      key: "g",
      header: "Profit / loss",
      align: "right",
      cell: (p) => (
        <span className={cn("block", plClass(p.gain))}>
          <Money value={p.gain} decimals sign currency={p.investment.currency} />
          {p.invested > 0 && <span className="block text-[11.5px]">{formatPct(p.gainPct)}</span>}
        </span>
      ),
    },
  ];
}

/** Green for a profit, red for a loss. */
function plClass(n: number) {
  return n > 0 ? "text-ok" : n < 0 ? "text-danger" : "text-ink";
}

function marketFooter(invested: number, value: number): ReactNode[] {
  const gain = value - invested;
  return [
    "Total",
    null,
    null,
    <Money key="i" value={invested} decimals className="font-bold" />,
    <Money key="v" value={value} decimals className="font-bold" />,
    <span key="g" className={cn("block font-bold", plClass(gain))}>
      <Money value={gain} decimals sign />
      {invested > 0 && <span className="block text-[11.5px]">{formatPct((gain / invested) * 100)}</span>}
    </span>,
  ];
}

function priceDetails(p: InvestmentPosition, m: (n: number) => string): [string, string][] {
  if (p.units == null) return [];
  const b = boughtAt(p);
  return [
    ["Units", p.units.toLocaleString("en-IN", { maximumFractionDigits: 4 })],
    ["Bought at", b != null ? `${m(b)} each` : "–"],
    ["Price now", p.price != null ? `${m(p.price)} each` : "–"],
  ];
}

// ---------------------------------------------------------------------------

/** Small "Prices checked 4:21 pm ⟳" line at the bottom of the Mutual funds, Stocks and Chits tabs. */
function LivePricesNote() {
  const ds = useStore((s) => s.ds);
  const kind = useStore((s) => s.repo?.kind);
  const { busy, at, failed } = usePrices();
  if (!ds || kind !== "supabase" || ds.profile.preferences.livePrices?.off) return null;
  if (!priceItems(ds.investments, ds.profile.preferences.livePrices?.codes).length) return null;
  const names = new Map(ds.investments.map((i) => [i.id, i.name]));
  const when = at ? new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div className="mt-3 flex items-center justify-end gap-1.5 text-[12px] text-ink-3">
      <span className="min-w-0 truncate">{busy ? "Getting the latest prices…" : when ? `Prices checked ${when}` : "Live prices"}</span>
      <button
        type="button"
        aria-label="Refresh prices"
        title="Refresh prices"
        disabled={busy}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2 disabled:opacity-60"
        onClick={async () => {
          try {
            const n = await refreshPrices(true);
            toast.success(n ? `Updated ${n} price${n === 1 ? "" : "s"}` : "Prices are already up to date");
          } catch {
            toast.error("Couldn't get prices right now. Try again in a bit.");
          }
        }}
      >
        <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
      </button>
      {failed.length > 0 && !busy && (
        <span className="text-warn" title={`No price for ${failed.map((f) => names.get(f.id) ?? "a holding").join(", ")}. Put its NSE symbol or AMFI scheme code in "Folio, symbol" (Edit).`}>
          · {failed.length} not found
        </span>
      )}
    </div>
  );
}
