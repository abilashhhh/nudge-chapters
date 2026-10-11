"use client";

import { ChevronDown, LineChart, PiggyBank, Plus, Wallet } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
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

const TABS = ["funds", "chits", "other"] as const;
type Tab = (typeof TABS)[number];

const isFund = (p: InvestmentPosition) => p.investment.type === "mutual_fund";

export function SavingsScreen() {
  const [tab, setTab] = useTab(TABS, "funds");
  const { positions, ctx } = useFinance();
  const invs = [...positions.investments.values()].filter((p) => !p.investment.archived);
  const chits = [...positions.chits.values()];
  const value = invs.reduce((s, p) => s + p.valueBase, 0) + chits.reduce((s, c) => s + c.asset, 0);
  const putIn = invs.reduce((s, p) => s + toBase(p.invested, p.investment.currency, ctx), 0) + chits.reduce((s, c) => s + c.asset, 0);
  const profit = value - putIn;
  return (
    <>
      <V2PageHeader title="Savings" meaning="What your savings and investments are worth" />
      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <StatTile label="Total saved" value={value} note="Value today" />
        <StatTile label="Money put in" value={putIn} />
        <StatTile label={profit >= 0 ? "Profit" : "Loss"} value={profit} tone="auto" note={putIn > 0 ? `${formatPct((profit / putIn) * 100)}` : undefined} />
      </div>
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "funds", label: "Mutual funds", count: invs.filter(isFund).length },
          { id: "chits", label: "Chits", count: chits.length },
          { id: "other", label: "Other savings", count: invs.filter((p) => !isFund(p)).length },
        ]}
      />
      {tab === "funds" && <Funds list={invs.filter(isFund)} />}
      {tab === "chits" && <Chits />}
      {tab === "other" && <Other list={invs.filter((p) => !isFund(p))} />}
      <p className="mt-4 text-[12.5px] text-ink-3">Values are what you type in — this app doesn&apos;t fetch live prices.</p>
    </>
  );
}

// ---------------------------------------------------------------------------

function Funds({ list }: { list: InvestmentPosition[] }) {
  const { ctx } = useFinance();
  const [update, setUpdate] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
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
      <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
        <table className="v2-table w-full min-w-[52rem] text-[13.5px]">
          <thead className="text-left text-[12px] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-3 py-2.5 font-medium">Fund</th>
              <th className="px-3 py-2.5 text-right font-medium">Monthly SIP</th>
              <th className="px-3 py-2.5 font-medium">SIP date</th>
              <th className="px-3 py-2.5 text-right font-medium">Money put in</th>
              <th className="px-3 py-2.5 text-right font-medium">Value today</th>
              <th className="px-3 py-2.5 text-right font-medium">Profit</th>
              <th className="px-3 py-2.5 text-right font-medium">Profit %</th>
              <th className="px-3 py-2.5 font-medium">Last updated</th>
              <th className="px-3 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="num">
            {list.map((p) => {
              const i = p.investment;
              const isOpen = open === i.id;
              return (
                <Fragment key={i.id}>
                  <tr className="border-t border-line">
                    <td className="px-3 py-2.5">
                      <button type="button" className="flex items-center gap-1 text-left font-medium hover:underline" onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen}>
                        {i.name}
                        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform", isOpen && "rotate-180")} aria-hidden />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right">{i.sip_active && i.sip_amount > 0 ? m(i.sip_amount) : "–"}</td>
                    <td className="px-3 py-2.5">{i.sip_active && i.sip_day ? `Every ${i.sip_day}` : "–"}</td>
                    <td className="px-3 py-2.5 text-right">{m(p.invested)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">
                      <Money value={p.value} decimals currency={i.currency} />
                    </td>
                    <td className={cn("px-3 py-2.5 text-right", p.gain < 0 ? "text-danger" : "text-ok")}>
                      <Money value={p.gain} decimals sign className="text-inherit" />
                    </td>
                    <td className={cn("px-3 py-2.5 text-right", p.gain < 0 ? "text-danger" : "text-ok")}>{formatPct(p.gainPct)}</td>
                    <td className="px-3 py-2.5 text-ink-2">{i.value_as_of ? formatDate(i.value_as_of, "short") : "–"}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => ui.openTx({ type: "invest_buy", investment_id: i.id, account_id: i.sip_account_id ?? undefined })}>
                          Buy
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => ui.openTx({ type: "invest_sell", investment_id: i.id })}>
                          Sell
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => ui.openEditor("investment", i.id)}>
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t border-line/70 bg-surface-2/60 text-[13px]">
                      <td colSpan={9} className="px-3 py-2.5">
                        <span className="mr-5">
                          Yearly return: <strong>{p.xirr != null ? formatPct(p.xirr) : "not enough history yet"}</strong>
                        </span>
                        {p.units != null && (
                          <span className="mr-5">
                            Units: <strong>{p.units.toLocaleString("en-IN", { maximumFractionDigits: 4 })}</strong>
                          </span>
                        )}
                        {p.price != null && (
                          <span className="mr-5">
                            Price: <strong>{p.price}</strong>
                          </span>
                        )}
                        {i.institution && <span className="text-ink-3">{i.institution}</span>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="num">
            <tr className="border-t-2 border-ink font-bold">
              <td className="px-3 py-2.5">Total</td>
              <td className="px-3 py-2.5 text-right">{m(tot.sip)}</td>
              <td />
              <td className="px-3 py-2.5 text-right">{m(tot.inv)}</td>
              <td className="px-3 py-2.5 text-right">
                <Money value={tot.val} decimals />
              </td>
              <td className={cn("px-3 py-2.5 text-right", tot.val - tot.inv < 0 ? "text-danger" : "text-ok")}>
                <Money value={tot.val - tot.inv} decimals sign className="text-inherit" />
              </td>
              <td className="px-3 py-2.5 text-right">{tot.inv > 0 ? formatPct(((tot.val - tot.inv) / tot.inv) * 100) : "–"}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
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
      <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
        <table className="v2-table w-full min-w-[60rem] text-[13.5px]">
          <thead className="text-left text-[12px] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-3 py-2.5 font-medium">Chit</th>
              <th className="px-3 py-2.5 text-right font-medium">Chit value</th>
              <th className="px-3 py-2.5 text-right font-medium">Monthly</th>
              <th className="px-3 py-2.5 font-medium">Months paid</th>
              <th className="px-3 py-2.5 text-right font-medium">Paid so far</th>
              <th className="px-3 py-2.5 text-right font-medium">Discount got</th>
              <th className="px-3 py-2.5 font-medium">Amount received?</th>
              <th className="px-3 py-2.5 text-right font-medium">Expected amount</th>
              <th className="px-3 py-2.5 font-medium">Ends</th>
              <th className="px-3 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="num">
            {list.map((cp) => {
              const c = cp.chit;
              const s = cp.summary;
              const received = c.payout_status === "received" || s.payoutReceived != null;
              return (
                <tr key={c.id} className="border-t border-line align-top">
                  <td className="px-3 py-2.5">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => ui.openChitSheet(c.id)}>
                      {c.name}
                    </button>
                    {c.provider && <span className="block text-[11.5px] text-ink-3">{c.provider}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">{m(c.chit_value)}</td>
                  <td className="px-3 py-2.5 text-right">{m(c.monthly_contribution)}</td>
                  <td className="px-3 py-2.5">
                    {s.paidCount} of {c.installments}
                  </td>
                  <td className="px-3 py-2.5 text-right">{m(s.actualPaid)}</td>
                  <td className="px-3 py-2.5 text-right text-ok">{m(s.auctionSavings)}</td>
                  <td className="px-3 py-2.5">{received ? `✓ ${c.payout_date ? formatDate(c.payout_date, "short") : "Received"}` : "Not yet"}</td>
                  <td className="px-3 py-2.5 text-right">
                    {received ? m(s.payoutReceived ?? c.payout_amount ?? 0) : <Money value={s.payoutExpected} decimals projected />}
                    {!received && s.tbdCount > 0 && (
                      <span className="block text-[11.5px] text-ink-3">
                        Still to pay <span className="projected">{formatMoney(s.projectedRemainingLow, ctx)}–{formatMoney(s.projectedRemainingHigh, ctx)}</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{formatDate(cp.endDate, "short")}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
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
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12.5px] text-ink-3">
        <span className="projected">Violet</span> amounts are estimates: future discounts depend on each month&apos;s auction.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Other({ list }: { list: InvestmentPosition[] }) {
  const { ctx } = useFinance();
  const ui = useUI.getState();
  const m = (n: number) => formatMoney(n, ctx, { decimals: true });
  const sorted = useMemo(() => [...list].sort((a, b) => b.valueBase - a.valueBase), [list]);
  if (!list.length)
    return (
      <EmptyState
        icon={Wallet}
        title="Nothing else saved yet"
        body="FDs, RDs, gold, stocks, EPF, PPF, NPS, property or a vehicle — add each with what you put in and its value today."
        action={
          <Button variant="primary" onClick={() => ui.openEditor("investment", undefined, { type: "fd" })}>
            Add savings
          </Button>
        }
      />
    );
  const retirement = (t: string) => t === "epf" || t === "ppf" || t === "nps";
  return (
    <div>
      <div className="mb-3">
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("investment", undefined, { type: "fd" })}>
          Add savings
        </Button>
      </div>
      <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
        <table className="v2-table w-full min-w-[40rem] text-[13.5px]">
          <thead className="text-left text-[12px] text-ink-3">
            <tr className="border-b border-line">
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 text-right font-medium">Money put in</th>
              <th className="px-3 py-2.5 text-right font-medium">Value today</th>
              <th className="px-3 py-2.5 font-medium">Last updated</th>
              <th className="px-3 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="num">
            {sorted.map((p) => {
              const i = p.investment;
              const monthly = i.employee_contribution + i.employer_contribution;
              return (
                <tr key={i.id} className="border-t border-line align-top">
                  <td className="px-3 py-2.5">
                    <span className="font-medium">{i.name}</span>
                    {retirement(i.type) && monthly > 0 && <span className="block text-[11.5px] text-ink-3">{formatMoney(monthly, ctx)} a month goes in</span>}
                  </td>
                  <td className="px-3 py-2.5">{INVESTMENT_TYPE_LABEL[i.type] ?? "Other"}</td>
                  <td className="px-3 py-2.5 text-right">{m(p.invested)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">
                    <Money value={p.value} decimals currency={i.currency} />
                  </td>
                  <td className="px-3 py-2.5 text-ink-2">{i.value_as_of ? formatDate(i.value_as_of, "short") : "–"}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => ui.openEditor("valuation", undefined, { investment_id: i.id })}>
                        Update value
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => ui.openEditor("investment", i.id)}>
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="num">
            <tr className="border-t-2 border-ink font-bold">
              <td className="px-3 py-2.5">Total</td>
              <td />
              <td className="px-3 py-2.5 text-right">{m(list.reduce((s, p) => s + toBase(p.invested, p.investment.currency, ctx), 0))}</td>
              <td className="px-3 py-2.5 text-right">
                <Money value={list.reduce((s, p) => s + p.valueBase, 0)} decimals />
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
