"use client";

import { Briefcase, ListOrdered } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { byStock, maxDrawdown, realizedByPeriod, tradeStats } from "@/lib/sim/analytics";
import { DEFAULT_RATES, type SimSettings } from "@/lib/sim/core";
import { simCall, useSim, type SimOrder } from "@/lib/sim/store";
import { ticker } from "@/lib/sim/universe";
import { Button } from "../ui/button";
import { Field, Input, NumberInput, Select, Switch } from "../ui/form";
import { EmptyState, Segmented } from "../ui/misc";
import { ConfirmSheet } from "../ui/sheet";
import { Box, Metric, Mono, inr, pct, plTone, price, signed, usePortfolio } from "./shared";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// ------------------------------------------------------------------ Portfolio

export function PortfolioTab({ open }: { open: (s: string) => void }) {
  const pf = usePortfolio();
  const groups = [
    { id: "delivery", title: "Holdings", sub: "Delivery — kept until you sell." },
    { id: "intraday", title: "Intraday positions", sub: "Closed automatically at square-off time." },
  ] as const;
  if (!pf.holdings.length)
    return <EmptyState icon={Briefcase} title="Nothing bought yet" body="Open any stock from Market and place a simulated buy. Your holdings and their profit show here." />;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Invested" value={inr(pf.invested, true)} />
        <Metric label="Current value" value={inr(pf.holdingsValue, true)} />
        <Metric label="Unrealized P&L" value={signed(pf.unrealized, true)} tone={plTone(pf.unrealized)} note={pf.invested ? pct((pf.unrealized / pf.invested) * 100) : undefined} />
        <Metric label="Today's change" value={signed(pf.dayChange, true)} tone={plTone(pf.dayChange)} />
      </div>
      {groups.map((g) => {
        const rows = pf.holdings.filter((h) => h.product === g.id);
        if (!rows.length) return null;
        return (
          <Box key={g.id} title={g.title} sub={g.sub}>
            {/* Table on wider screens, cards on phones. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="num w-full text-[13px]">
                <thead className="text-left text-[11.5px] text-ink-3">
                  <tr className="border-b border-line">
                    <th className="py-2 font-medium">Stock</th>
                    <th className="py-2 text-right font-medium">Qty</th>
                    <th className="py-2 text-right font-medium">Avg buy</th>
                    <th className="py-2 text-right font-medium">Price now</th>
                    <th className="py-2 text-right font-medium">Invested</th>
                    <th className="py-2 text-right font-medium">Current</th>
                    <th className="py-2 text-right font-medium">Unrealized</th>
                    <th className="py-2 text-right font-medium">Realized</th>
                    <th className="py-2 text-right font-medium">Charges</th>
                    <th className="py-2 text-right font-medium">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => (
                    <tr key={h.symbol + h.product} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => open(h.symbol)}>
                      <td className="py-2.5">
                        <span className="block font-medium">{ticker(h.symbol)}</span>
                        <span className="block max-w-[14rem] truncate text-[11.5px] text-ink-3">{h.name}</span>
                      </td>
                      <td className="text-right">{h.qty}</td>
                      <td className="text-right">{price(h.avg_price)}</td>
                      <td className="text-right">{h.hasPrice ? price(h.ltp) : "–"}</td>
                      <td className="text-right">{inr(h.invested)}</td>
                      <td className="text-right font-semibold">{inr(h.current)}</td>
                      <td className={cn("text-right", plTone(h.unrealized))}>
                        {signed(h.unrealized)}
                        <span className="block text-[11px]">{pct(h.unrealizedPct)}</span>
                      </td>
                      <td className={cn("text-right", plTone(h.realized_pnl))}>{signed(h.realized_pnl)}</td>
                      <td className="text-right text-ink-3">{inr(h.charges)}</td>
                      <td className="text-right text-ink-3">{pf.holdingsValue ? `${((h.current / pf.holdingsValue) * 100).toFixed(1)}%` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="-mx-2 flex flex-col md:hidden">
              {rows.map((h) => (
                <li key={h.symbol + h.product}>
                  <button type="button" onClick={() => open(h.symbol)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
                    <Mono name={h.name} symbol={h.symbol} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{ticker(h.symbol)}</span>
                      <span className="num block truncate text-[12px] text-ink-3">{h.qty} × {price(h.avg_price)} → {h.hasPrice ? price(h.ltp) : "–"}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-[14px] font-semibold">{inr(h.current)}</span>
                      <span className={cn("num block text-[12px]", plTone(h.unrealized))}>{signed(h.unrealized)} ({pct(h.unrealizedPct)})</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Box>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Orders

const STATUS: Record<SimOrder["status"], { label: string; cls: string }> = {
  open: { label: "Pending", cls: "bg-warn-soft text-warn" },
  filled: { label: "Executed", cls: "bg-ok/15 text-ok" },
  rejected: { label: "Rejected", cls: "bg-danger/15 text-danger" },
  cancelled: { label: "Cancelled", cls: "bg-surface-3 text-ink-2" },
  expired: { label: "Expired", cls: "bg-surface-3 text-ink-2" },
};

export function OrdersTab({ open }: { open: (s: string) => void }) {
  const { orders, fills, load } = useSim();
  const [view, setView] = useState<"open" | "orders" | "trades">(orders.some((o) => o.status === "open") ? "open" : "orders");
  const pending = orders.filter((o) => o.status === "open");
  const list = view === "open" ? pending : orders;
  const cancel = async (o: SimOrder) => {
    try {
      await simCall("cancel", { order_id: o.id });
      toast.success("Order cancelled");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't cancel");
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Segmented value={view} onChange={setView} options={[{ id: "open", label: `Open (${pending.length})` }, { id: "orders", label: "All orders" }, { id: "trades", label: "Trades" }]} />
      {view !== "trades" ? (
        !list.length ? (
          <EmptyState icon={ListOrdered} title={view === "open" ? "No pending orders" : "No orders yet"} body={view === "open" ? "Limit orders waiting for their price show here." : "Every order you place — executed, rejected or cancelled — is kept here."} />
        ) : (
          <Box>
            <ul className="num -mx-1 flex flex-col divide-y divide-line text-[13px]">
              {list.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2.5">
                  <button type="button" onClick={() => open(o.symbol)} className="min-w-0 flex-1 text-left">
                    <span className="block">
                      <span className={cn("font-semibold", o.side === "buy" ? "text-ok" : "text-danger")}>{o.side === "buy" ? "BUY" : "SELL"}</span> {o.qty} {ticker(o.symbol)}
                      <span className="text-ink-3"> · {o.product} · {o.order_type === "limit" ? `limit ${price(o.limit_price)}` : "market"}{o.source === "auto" ? " · auto" : ""}</span>
                    </span>
                    <span className="block text-[11.5px] text-ink-3">
                      {when(o.created_at)}
                      {o.status === "filled" && o.avg_fill_price != null ? ` · filled ${o.filled_qty} at ${price(o.avg_fill_price)} (market ${price(o.ref_price)})` : ""}
                      {o.reason && o.status !== "filled" ? ` · ${o.reason}` : ""}
                    </span>
                  </button>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-medium", STATUS[o.status].cls)}>{STATUS[o.status].label}</span>
                  {o.status === "open" && (
                    <Button size="sm" variant="ghost" onClick={() => cancel(o)}>
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Box>
        )
      ) : !fills.length ? (
        <EmptyState icon={ListOrdered} title="No trades yet" body="Each simulated execution shows here with its price, charges and realized profit." />
      ) : (
        <Box>
          <ul className="num -mx-1 flex flex-col divide-y divide-line text-[13px]">
            {fills.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block">
                    <span className={cn("font-semibold", f.side === "buy" ? "text-ok" : "text-danger")}>{f.side === "buy" ? "BUY" : "SELL"}</span> {f.qty} {ticker(f.symbol)} at {price(f.price)}
                  </span>
                  <span className="block text-[11.5px] text-ink-3">
                    Simulated {when(f.executed_at)} · {f.product} · value {inr(f.value)} · charges {inr(f.charges)}
                    {f.quote_time ? ` · price quoted ${new Date(f.quote_time).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })}` : ""}
                  </span>
                </span>
                {f.realized_pnl != null && <span className={cn("shrink-0 font-semibold", plTone(f.realized_pnl))}>{signed(f.realized_pnl)}</span>}
              </li>
            ))}
          </ul>
        </Box>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Analytics

export function AnalyticsTab() {
  const { fills, snapshots, account } = useSim();
  const pf = usePortfolio();
  const st = useMemo(() => tradeStats(fills), [fills]);
  const per = useMemo(() => realizedByPeriod(fills), [fills]);
  const dd = useMemo(() => maxDrawdown(snapshots), [snapshots]);
  const stocks = useMemo(() => byStock(fills), [fills]);
  const series = snapshots.map((s) => ({ date: s.date, equity: s.equity, ret: account ? ((s.equity - account.initial_capital) / account.initial_capital) * 100 : 0 }));
  const n = (v: number | null, f: (x: number) => string) => (v == null ? "–" : f(v));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Realized today" value={signed(per.day)} tone={plTone(per.day)} />
        <Metric label="This week" value={signed(per.week)} tone={plTone(per.week)} />
        <Metric label="This month" value={signed(per.month)} tone={plTone(per.month)} />
        <Metric label="All time (realized)" value={signed(per.all)} tone={plTone(per.all)} />
        <Metric label="Unrealized" value={signed(pf.unrealized)} tone={plTone(pf.unrealized)} note="Not counted as realized" />
        <Metric label="Total P&L" value={signed(pf.total)} tone={plTone(pf.total)} note={pct(pf.totalPct)} />
        <Metric label="Max drawdown" value={dd.amount ? `−${inr(dd.amount, true)}` : "–"} note={dd.amount ? `${dd.pct}% from a high` : "From daily values"} />
        <Metric label="Charges paid" value={inr(pf.charges)} />
      </div>
      <Box title="Account value over time" sub="One point a day, saved when you open the simulator.">
        {series.length < 2 ? (
          <p className="py-8 text-center text-[13px] text-ink-3">The chart starts once there are two days of history.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="simEq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--ink-3)", fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                <YAxis tick={{ fill: "var(--ink-3)", fontSize: 11 }} width={56} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} domain={["auto", "auto"]} />
                <Tooltip formatter={(v) => inr(Number(v))} labelStyle={{ color: "var(--ink)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }} />
                {account && <ReferenceLine y={account.initial_capital} stroke="var(--ink-3)" strokeDasharray="4 4" />}
                <Area type="monotone" dataKey="equity" name="Value" stroke="var(--brand)" fill="url(#simEq)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Box>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Box title="How your trades went" sub="A trade = one sale. Win = sold for a profit after charges.">
          <dl className="num grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            {(
              [
                ["Closed trades", String(st.trades)],
                ["Win rate", n(st.winRate, (v) => `${v.toFixed(0)}%`)],
                ["Winning / losing", `${st.wins} / ${st.losses}`],
                ["Reward : risk", n(st.rewardRisk, (v) => `${v.toFixed(2)} : 1`)],
                ["Average win", n(st.avgWin, (v) => signed(v))],
                ["Average loss", n(st.avgLoss, (v) => signed(v))],
                ["Average holding", n(st.avgHoldDays, (v) => (v < 1 ? `${Math.round(v * 24 * 60)} min` : `${v.toFixed(1)} days`))],
                ["Trading frequency", n(st.perWeek, (v) => `${v.toFixed(1)} orders / week`)],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-ink-3">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {(st.best || st.worst) && (
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-[12.5px]">
              {st.best && (
                <p>
                  <span className="block text-ink-3">Best trade</span>
                  <span className="num font-medium text-ok">{signed(st.best.pnl)}</span> {ticker(st.best.fill.symbol)}
                </p>
              )}
              {st.worst && (
                <p>
                  <span className="block text-ink-3">Worst trade</span>
                  <span className={cn("num font-medium", plTone(st.worst.pnl))}>{signed(st.worst.pnl)}</span> {ticker(st.worst.fill.symbol)}
                </p>
              )}
            </div>
          )}
        </Box>
        <Box title="By stock" sub="Realized profit after charges.">
          {!stocks.length ? (
            <p className="text-[13px] text-ink-3">No trades yet.</p>
          ) : (
            <ul className="num flex flex-col gap-1.5 text-[13px]">
              {stocks.map((s) => (
                <li key={s.symbol} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {ticker(s.symbol)} <span className="text-ink-3">· {s.trades} order{s.trades === 1 ? "" : "s"}</span>
                  </span>
                  <span className={plTone(s.realized)}>{signed(s.realized)}</span>
                </li>
              ))}
            </ul>
          )}
        </Box>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Settings

export function SettingsTab() {
  const { account, load } = useSim();
  const [s, setS] = useState<SimSettings>(account!.settings);
  const [busy, setBusy] = useState(false);
  const [capital, setCapital] = useState(String(account!.initial_capital));
  const [resetting, setResetting] = useState(false);
  const set = <K extends keyof SimSettings>(k: K, v: SimSettings[K]) => setS({ ...s, [k]: v });
  const rate = (k: keyof typeof DEFAULT_RATES, label: string, help?: string) => (
    <Field label={label} help={help}>
      <NumberInput step="any" value={k === "effective" ? "" : Number(((s.rates[k] as number) * (k === "brokerageCap" ? 1 : 100)).toFixed(6))} onChange={(e) => setS({ ...s, rates: { ...s.rates, [k]: Number(e.target.value) / (k === "brokerageCap" ? 1 : 100) } })} />
    </Field>
  );
  const save = async () => {
    setBusy(true);
    try {
      await simCall("settings", { settings: s });
      toast.success("Simulator settings saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };
  const opt = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <div className="flex flex-col gap-4">
      <Box title="Trading defaults">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Default order type">
            <Select value={s.defaultOrderType} onChange={(e) => set("defaultOrderType", e.target.value as SimSettings["defaultOrderType"])}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </Select>
          </Field>
          <Field label="Default product">
            <Select value={s.defaultProduct} onChange={(e) => set("defaultProduct", e.target.value as SimSettings["defaultProduct"])}>
              <option value="delivery">Delivery</option>
              <option value="intraday">Intraday</option>
            </Select>
          </Field>
          <Field label="Intraday square-off time (IST)" help="Intraday positions are sold at the market price after this time.">
            <Input type="time" min="09:16" max="15:29" value={s.squareOffAt} onChange={(e) => set("squareOffAt", e.target.value)} />
          </Field>
          <Field label="Refresh prices every (seconds)" help="While the market is open and this page is showing. 15–300.">
            <NumberInput min={15} max={300} value={s.refreshSeconds} onChange={(e) => set("refreshSeconds", Number(e.target.value))} />
          </Field>
          <Field label="Slippage on market orders (%)" help="Market orders fill this much worse than the quote.">
            <NumberInput step="0.01" min={0} max={2} value={s.slippageBps / 100} onChange={(e) => set("slippageBps", Math.round(Number(e.target.value) * 100))} />
          </Field>
          <div className="flex flex-col justify-end gap-3">
            <Switch checked={s.notify} onChange={(v) => set("notify", v)} label="Notify me when orders fill, are rejected or expire" />
          </div>
        </div>
      </Box>
      <Box title="Risk limits" sub="Leave blank for no limit.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Max value per order (₹)">
            <NumberInput min={1} value={s.maxOrderValue ?? ""} onChange={(e) => set("maxOrderValue", opt(e.target.value))} />
          </Field>
          <Field label="Max stocks held at once">
            <NumberInput min={1} value={s.maxOpenPositions ?? ""} onChange={(e) => set("maxOpenPositions", opt(e.target.value))} />
          </Field>
          <Field label="Daily loss limit (₹)" help="No new buys once today's loss reaches this.">
            <NumberInput min={1} value={s.dailyLossLimit ?? ""} onChange={(e) => set("dailyLossLimit", opt(e.target.value))} />
          </Field>
        </div>
      </Box>
      <Box title="Simulated charges" sub={`Estimates, rates from ${s.rates.effective}. Real brokers may charge differently.`}>
        <Switch checked={s.chargesOn} onChange={(v) => set("chargesOn", v)} label="Apply charges to simulated trades" />
        {s.chargesOn && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {rate("brokerageDelivery", "Brokerage, delivery (%)")}
            {rate("brokerageIntraday", "Brokerage, intraday (%)")}
            {rate("brokerageCap", "Brokerage cap (₹ per order)")}
            {rate("sttDelivery", "STT delivery (%)", "Buy and sell")}
            {rate("sttIntradaySell", "STT intraday (%)", "Sell only")}
            {rate("exchange", "Exchange charge (%)")}
            {rate("sebi", "SEBI fee (%)")}
            {rate("gst", "GST (%)", "On brokerage + fees")}
            {rate("stampDelivery", "Stamp duty delivery (%)", "Buy only")}
            {rate("stampIntraday", "Stamp duty intraday (%)", "Buy only")}
          </div>
        )}
        {s.chargesOn && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setS({ ...s, rates: DEFAULT_RATES })}>
            Use the default rates
          </Button>
        )}
      </Box>
      <div className="flex justify-end">
        <Button variant="primary" loading={busy} onClick={save}>
          Save settings
        </Button>
      </div>
      <Box title="Start again" sub="Closes this simulation and opens a fresh one. Your past simulation is kept as history; nothing else in the app changes.">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="New starting capital (₹)" className="w-48">
            <NumberInput min={1000} value={capital} onChange={(e) => setCapital(e.target.value)} />
          </Field>
          <Button variant="danger" onClick={() => setResetting(true)}>
            Reset simulation
          </Button>
        </div>
      </Box>
      <ConfirmSheet
        open={resetting}
        onClose={() => setResetting(false)}
        danger
        title="Reset the simulation?"
        confirmLabel="Reset"
        body={`Your simulated holdings, pending orders and balance start over with ${inr(Number(capital) || 0, true)}. The old simulation is archived. Your real accounts and data aren't touched.`}
        onConfirm={async () => {
          try {
            await simCall("reset", { capital: Number(capital) });
            toast.success("New simulation started");
            await load();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't reset");
          }
        }}
      />
    </div>
  );
}
