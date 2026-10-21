"use client";

import { ChartCandlestick, ChevronLeft, ChevronRight, FileUp, Plus, Rocket, Search, TrendingUp, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { addDays, addMonths, formatDate, formatMonth, monthKey, parseISO } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct, toBase } from "@/lib/money";
import {
  IPO_STATUS_LABEL, SEGMENT_LABEL, boughtOn, dayStreaks, daysToLongTerm, holdingTerm, ipoApplied, ipoGain, ipoListingPct, ipoStats, isOpen, pnlByDay, tradeDay, tradePct, tradePnl,
  tradeStats, tradeValue,
} from "@/lib/trading";
import type { IpoApplication, Trade, TradeSegment } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";
import { Button } from "../ui/button";
import { EmptyState, Segmented, Tabs } from "../ui/misc";
import { HoldingTile } from "./detail-pages";
import Link from "next/link";
import { TRAINING_PATH } from "../training/nav";
import { useTraining } from "../training/actions";
import { EntityIcon } from "./entity-icon";
import { ImportTradesSheet, IpoSheet, TradeSheet } from "./trading-sheets";
import { StatTile, V2PageHeader } from "./ui";

const TABS = ["overview", "intraday", "trades", "holdings", "funds", "ipos"] as const;
type Tab = (typeof TABS)[number];

const tick = { fill: "var(--ink-3)", fontSize: 11.5 };
const kfmt = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
const plc = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.005 ? "text-ink" : v > 0 ? "text-ok" : "text-danger");

function Tip({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] shadow-panel">
      <p className="mb-0.5 font-semibold">{title}</p>
      {rows.map(([k, v, cls]) => (
        <p key={k} className="flex justify-between gap-4 text-ink-2">
          <span>{k}</span>
          <span className={cn("num font-medium text-ink", cls)}>{v}</span>
        </p>
      ))}
    </div>
  );
}

function Card({ title, sub, children, className, action }: { title: string; sub?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface p-4", className)}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {sub && <p className="text-[12px] text-ink-3">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Mini({ label, value, tone, note }: { label: string; value: string; tone?: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-3">
      <p className="truncate text-[12px] text-ink-3">{label}</p>
      <p className={cn("num mt-0.5 truncate text-[18px] font-semibold", tone)}>{value}</p>
      {note && <p className="truncate text-[11.5px] text-ink-3">{note}</p>}
    </div>
  );
}

export function TradingScreen() {
  const [tab, setTab] = useTab(TABS, "overview");
  const { ds, today, ctx, positions } = useFinance();
  const [editing, setEditing] = useState<{ trade?: Trade | null; preset?: Partial<Trade> } | null>(null);
  const [ipoEdit, setIpoEdit] = useState<{ ipo?: IpoApplication | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const trades = ds.trades ?? [];
  const ipos = ds.ipo_applications ?? [];
  const all = useMemo(() => tradeStats(trades), [trades]);
  const month = monthKey(today);
  const monthNet = trades.filter((t) => !isOpen(t) && tradeDay(t).startsWith(month)).reduce((s, t) => s + (tradePnl(t) ?? 0), 0);
  const ist = ipoStats(ipos);
  const stocks = [...positions.investments.values()].filter((p) => !p.investment.archived && (p.investment.type === "stock" || p.investment.type === "etf"));
  const holdGain = stocks.reduce((s, p) => s + p.valueBase - toBase(p.invested, p.investment.currency, ctx), 0);
  const fundCount = [...positions.investments.values()].filter((p) => !p.investment.archived && p.investment.type === "mutual_fund").length;
  const router = useRouter();
  const openTrade = (trade: Trade) => setEditing({ trade });
  const addTrade = (segment: TradeSegment = "intraday") => setEditing({ preset: { segment } });
  return (
    <>
      <V2PageHeader
        title="Trading"
        actions={
          <div className="flex gap-2">
            <Button size="sm" icon={<FileUp className="h-4 w-4" />} onClick={() => setImporting(true)}>Import</Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => (tab === "ipos" ? setIpoEdit({}) : tab === "funds" ? useUI.getState().openEditor("investment", undefined, { type: "mutual_fund" }) : addTrade(tab === "trades" ? "swing" : "intraday"))}
            >
              {tab === "ipos" ? "Add IPO" : tab === "funds" ? "Add fund" : "Add trade"}
            </Button>
          </div>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile label="Trading profit" value={all.net} tone="pl" note={`${all.count} closed trade${all.count === 1 ? "" : "s"}`} onClick={() => setTab("overview")} />
        <StatTile label={`This month (${formatMonth(month, false)})`} value={monthNet} tone="pl" onClick={() => setTab("intraday")} />
        <StatTile label="Holdings profit" value={holdGain} tone="pl" note={`${stocks.length} stock${stocks.length === 1 ? "" : "s"}`} onClick={() => setTab("holdings")} />
        <StatTile label="IPO gains" value={ist.gains} tone="pl" note={`${ist.allotted} of ${ist.decided} allotted`} onClick={() => setTab("ipos")} />
      </div>
      <Tabs<Tab | "training">
        className="mb-4"
        value={tab}
        onChange={(t) => (t === "training" ? router.push(TRAINING_PATH) : setTab(t))}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "intraday", label: "Intraday", count: trades.filter((t) => t.segment === "intraday").length },
          { id: "trades", label: "Swing & F&O", count: trades.filter((t) => t.segment !== "intraday").length },
          { id: "holdings", label: "Holdings", count: stocks.length },
          { id: "funds", label: "Mutual funds", count: fundCount },
          { id: "ipos", label: "IPOs", count: ipos.length },
          { id: "training", label: "Training" },
        ]}
      />
      {tab === "overview" && <TrainingTile />}
      {tab === "overview" && <Overview trades={trades} onOpen={openTrade} onAdd={() => addTrade()} onImport={() => setImporting(true)} />}
      {tab === "intraday" && <Intraday trades={trades.filter((t) => t.segment === "intraday")} onOpen={openTrade} onAdd={() => addTrade("intraday")} />}
      {tab === "trades" && <Positional trades={trades.filter((t) => t.segment !== "intraday")} onOpen={openTrade} onAdd={() => addTrade("swing")} />}
      {tab === "holdings" && <Holdings />}
      {tab === "funds" && <Funds />}
      {tab === "ipos" && <Ipos list={ipos} onOpen={(ipo) => setIpoEdit({ ipo })} onAdd={() => setIpoEdit({})} />}
      <p className="mt-4 text-[12px] text-ink-3">
        Your trade journal and IPOs are a record only: they don&apos;t move money in your bank accounts. Profits shown are after the charges you enter.
      </p>
      <TradeSheet open={!!editing} trade={editing?.trade} preset={editing?.preset} onClose={() => setEditing(null)} />
      <IpoSheet open={!!ipoEdit} ipo={ipoEdit?.ipo} onClose={() => setIpoEdit(null)} />
      <ImportTradesSheet open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({ trades, onOpen, onAdd, onImport }: { trades: Trade[]; onOpen: (t: Trade) => void; onAdd: () => void; onImport: () => void }) {
  const { ctx, today } = useFinance();
  const [range, setRange] = useState<"1m" | "3m" | "1y" | "all">("3m");
  const days = useMemo(() => pnlByDay(trades), [trades]);
  const m = (n: number) => formatMoney(n, ctx);
  if (!trades.length)
    return (
      <EmptyState
        icon={TrendingUp}
        title="No trades yet"
        body="Add your trades one by one, or import your broker's tradebook to see your profit, win rate and best days."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>Add a trade</Button>
            <Button icon={<FileUp className="h-4 w-4" />} onClick={onImport}>Import from broker</Button>
          </div>
        }
      />
    );
  const from = range === "all" ? "0000" : addDays(today, range === "1m" ? -30 : range === "3m" ? -91 : -365);
  let run = 0;
  const curve = days.filter((d) => d.day >= from).map((d) => ({ day: d.day, pnl: d.pnl, total: Math.round((run += d.pnl) * 100) / 100 }));
  const months = Array.from({ length: 6 }, (_, i) => monthKey(addMonths(today, i - 5))).map((mo) => ({ month: mo, pnl: Math.round(days.filter((d) => d.day.startsWith(mo)).reduce((s, d) => s + d.pnl, 0)) }));
  const segs = (Object.keys(SEGMENT_LABEL) as TradeSegment[]).map((s) => ({ seg: s, st: tradeStats(trades.filter((t) => t.segment === s)) })).filter((x) => x.st.count > 0);
  const bySym = new Map<string, { sym: string; name: string; pnl: number; n: number }>();
  for (const t of trades) {
    const p = tradePnl(t);
    if (p == null) continue;
    const cur = bySym.get(t.symbol) ?? { sym: t.symbol, name: t.name || t.symbol, pnl: 0, n: 0 };
    cur.pnl += p;
    cur.n++;
    bySym.set(t.symbol, cur);
  }
  const syms = [...bySym.values()].sort((a, b) => b.pnl - a.pnl);
  const maxAbs = Math.max(1, ...syms.map((s) => Math.abs(s.pnl)));
  const up = (curve.at(-1)?.total ?? 0) >= 0;
  const st = tradeStats(trades);
  const recent = [...trades].sort((a, b) => (tradeDay(a) < tradeDay(b) ? 1 : -1)).slice(0, 6);
  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Profit over time"
        sub={`Closed trades, after charges · ${curve.length} trading day${curve.length === 1 ? "" : "s"}`}
        action={<Segmented size="sm" value={range} onChange={setRange} options={[{ id: "1m", label: "1M" }, { id: "3m", label: "3M" }, { id: "1y", label: "1Y" }, { id: "all", label: "All" }]} />}
      >
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tpnl" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={up ? "var(--ok)" : "var(--danger)"} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={up ? "var(--ok)" : "var(--danger)"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="day" tickFormatter={(d) => formatDate(d, "short")} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={40} />
              <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={kfmt} />
              <ReferenceLine y={0} stroke="var(--line-strong)" />
              <Tooltip content={({ active, payload }) => (active && payload?.[0] ? <Tip title={formatDate(String(payload[0].payload.day), "long")} rows={[["That day", formatMoney(Number(payload[0].payload.pnl), ctx, { sign: true }), plc(Number(payload[0].payload.pnl))], ["Running total", formatMoney(Number(payload[0].value), ctx, { sign: true }), plc(Number(payload[0].value))]]} /> : null)} />
              <Area type="monotone" dataKey="total" stroke={up ? "var(--ok)" : "var(--danger)"} strokeWidth={2} fill="url(#tpnl)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Month by month" sub="Green months made money, red ones lost it.">
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="month" tickFormatter={(mo) => formatMonth(mo, false)} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={kfmt} />
                <ReferenceLine y={0} stroke="var(--line-strong)" />
                <Tooltip cursor={{ fill: "var(--surface-3)", opacity: 0.6 }} content={({ active, payload }) => (active && payload?.[0] ? <Tip title={formatMonth(String(payload[0].payload.month))} rows={[["Profit", formatMoney(Number(payload[0].value), ctx, { sign: true }), plc(Number(payload[0].value))]]} /> : null)} />
                <Bar dataKey="pnl" radius={[4, 4, 4, 4]}>
                  {months.map((r) => <Cell key={r.month} fill={r.pnl >= 0 ? "var(--candle-up, var(--ok))" : "var(--candle-down, var(--danger))"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="By kind of trade">
          <ul className="flex flex-col gap-2">
            {segs.map(({ seg, st }) => (
              <li key={seg} className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-3 text-[13.5px]">
                <span className="font-medium">{SEGMENT_LABEL[seg]}</span>
                <span className="flex items-center gap-2">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-danger-soft">
                    <span className="block h-full rounded-full bg-ok" style={{ width: `${st.winRate * 100}%` }} />
                  </span>
                  <span className="num w-20 shrink-0 text-[12px] text-ink-3">{Math.round(st.winRate * 100)}% won · {st.count}</span>
                </span>
                <span className={cn("num font-semibold", plc(st.net))}>{formatMoney(st.net, ctx, { sign: true })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-ink-3">Bar = share of trades that made money.</p>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="By stock" sub="What each stock made or lost you, all time.">
          <ul className="flex flex-col gap-1.5">
            {syms.slice(0, 8).map((s) => (
              <li key={s.sym} className="flex items-center gap-3">
                <EntityIcon kind="stock" name={s.name} size="sm" />
                <span className="w-24 shrink-0 truncate text-[13.5px] font-medium">{s.sym}</span>
                <span className="relative h-2.5 flex-1">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                  <span className={cn("absolute inset-y-0 rounded-full", s.pnl >= 0 ? "left-1/2 bg-ok" : "right-1/2 bg-danger")} style={{ width: `${(Math.abs(s.pnl) / maxAbs) * 50}%` }} />
                </span>
                <span className={cn("num w-24 shrink-0 text-right text-[13px] font-semibold", plc(s.pnl))}>{formatMoney(s.pnl, ctx, { sign: true })}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Latest trades">
          <TradeRows list={recent} onOpen={onOpen} />
        </Card>
      </div>
      <p className="text-[12px] text-ink-3">
        Best trade: {st.best ? `${st.best.symbol} ${m(tradePnl(st.best)!)}` : "—"} · Worst: {st.worst ? `${st.worst.symbol} ${m(tradePnl(st.worst)!)}` : "—"}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function TradeRows({ list, onOpen }: { list: Trade[]; onOpen: (t: Trade) => void }) {
  const { ctx } = useFinance();
  if (!list.length) return <p className="py-2 text-[13.5px] text-ink-3">Nothing here.</p>;
  return (
    <ul className="-mx-2 flex flex-col">
      {list.map((t) => {
        const p = tradePnl(t);
        const pct = tradePct(t);
        return (
          <li key={t.id}>
            <button type="button" onClick={() => onOpen(t)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2">
              <EntityIcon kind="stock" name={t.name || t.symbol} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[14.5px] font-semibold">{t.symbol}</span>
                  <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-ink-2">{SEGMENT_LABEL[t.segment]}</span>
                  {t.side === "short" && <span className="shrink-0 rounded-full bg-future-soft px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-future-ink">Short</span>}
                </span>
                <span className="num block truncate text-[12px] text-ink-3">
                  {t.quantity.toLocaleString("en-IN")} × {formatMoney(t.entry_price, ctx, { decimals: true })}
                  {t.exit_price != null ? ` → ${formatMoney(t.exit_price, ctx, { decimals: true })}` : " · open"}
                  {t.strategy ? ` · ${t.strategy}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {p == null ? (
                  <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-semibold text-warn">Open</span>
                ) : (
                  <>
                    <span className={cn("num block text-[14.5px] font-semibold", plc(p))}>{formatMoney(p, ctx, { sign: true, decimals: true })}</span>
                    {pct != null && <span className={cn("num block text-[11.5px]", plc(p))}>{pct >= 0 ? "+" : ""}{formatPct(pct, 2)}</span>}
                  </>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Trades grouped by day with each day's total; search and winners / losers filters. */
function DayList({ trades, onOpen, day, setDay }: { trades: Trade[]; onOpen: (t: Trade) => void; day?: string | null; setDay?: (d: string | null) => void }) {
  const { ctx } = useFinance();
  const [f, setF] = useState<"all" | "win" | "loss" | "open">("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(20);
  const needle = q.trim().toLowerCase();
  const shown = trades
    .filter((t) => (f === "all" ? true : f === "open" ? isOpen(t) : f === "win" ? (tradePnl(t) ?? 0) > 0 : (tradePnl(t) ?? 0) < 0))
    .filter((t) => !day || tradeDay(t) === day)
    .filter((t) => !needle || `${t.symbol} ${t.name ?? ""} ${t.strategy ?? ""} ${t.notes ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => (tradeDay(a) < tradeDay(b) ? 1 : tradeDay(a) > tradeDay(b) ? -1 : 0));
  const groups = new Map<string, Trade[]>();
  for (const t of shown) groups.set(tradeDay(t), [...(groups.get(tradeDay(t)) ?? []), t]);
  const keys = [...groups.keys()];
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:px-4">
        <h2 className="mr-auto text-[15px] font-semibold">Trades</h2>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol or setup" aria-label="Search trades" className="h-9 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-[13.5px] outline-none focus:border-future" />
        </div>
      </div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pt-3 sm:px-4" role="radiogroup" aria-label="Show">
        {([["all", "All"], ["win", "Winners"], ["loss", "Losers"], ["open", "Open"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={f === id} onClick={() => setF(id)} className={cn("h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium", f === id ? "bg-inverse text-on-inverse" : "bg-surface-3/70 text-ink-2 hover:text-ink")}>
            {label}
          </button>
        ))}
        {day && setDay && (
          <button type="button" onClick={() => setDay(null)} className="h-8 shrink-0 rounded-full bg-future-soft px-3 text-[12.5px] font-medium text-future-ink">
            {formatDate(day, "medium")} ×
          </button>
        )}
      </div>
      <div className="px-2 pb-2 sm:px-3">
        {keys.length === 0 && <p className="p-3 text-[13.5px] text-ink-3">Nothing here.</p>}
        {keys.slice(0, limit).map((d) => {
          const list = groups.get(d)!;
          const net = list.reduce((s, t) => s + (tradePnl(t) ?? 0), 0);
          return (
            <div key={d}>
              <p className="flex items-baseline justify-between px-2 pb-0.5 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                <span>{formatDate(d, "medium")}</span>
                <span className={cn("num normal-case", plc(net))}>{formatMoney(net, ctx, { sign: true })}</span>
              </p>
              <TradeRows list={list} onOpen={onOpen} />
            </div>
          );
        })}
        {keys.length > limit && (
          <Button variant="ghost" className="m-2" onClick={() => setLimit(limit + 20)}>
            Show more days ({keys.length - limit} left)
          </Button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Intraday: calendar of green and red days
// ---------------------------------------------------------------------------

function Intraday({ trades, onOpen, onAdd }: { trades: Trade[]; onOpen: (t: Trade) => void; onAdd: () => void }) {
  const { ctx, today } = useFinance();
  const days = useMemo(() => pnlByDay(trades), [trades]);
  const last = days.at(-1)?.day ?? today;
  const [mo, setMo] = useState(monthKey(last));
  const [day, setDay] = useState<string | null>(null);
  if (!trades.length)
    return <EmptyState icon={TrendingUp} title="No intraday trades yet" body="Add each day's trades, or import your tradebook, to see your green and red days." action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>Add a trade</Button>} />;
  const st = tradeStats(trades);
  const streak = dayStreaks(days);
  const inMonth = days.filter((d) => d.day.startsWith(mo));
  const monthNet = inMonth.reduce((s, d) => s + d.pnl, 0);
  const map = new Map(inMonth.map((d) => [d.day, d]));
  const maxAbs = Math.max(1, ...inMonth.map((d) => Math.abs(d.pnl)));
  const first = `${mo}-01`;
  const lead = (parseISO(first).getUTCDay() + 6) % 7; // Monday first
  const count = new Date(Date.UTC(+mo.slice(0, 4), +mo.slice(5, 7), 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];
  const bestDay = days.reduce<(typeof days)[number] | null>((b, d) => (!b || d.pnl > b.pnl ? d : b), null);
  const worstDay = days.reduce<(typeof days)[number] | null>((b, d) => (!b || d.pnl < b.pnl ? d : b), null);
  const green = inMonth.filter((d) => d.pnl > 0).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Mini label="Win rate" value={formatPct(st.winRate * 100, 0)} note={`${st.wins} won · ${st.losses} lost`} tone={st.winRate >= 0.5 ? "text-ok" : "text-danger"} />
        <Mini label="Average win" value={formatMoney(st.avgWin, ctx)} tone="text-ok" />
        <Mini label="Average loss" value={formatMoney(-st.avgLoss, ctx)} tone="text-danger" />
        <Mini label="Profit factor" value={Number.isFinite(st.profitFactor) ? st.profitFactor.toFixed(2) : "∞"} note="Won ÷ lost; above 1 is profitable" tone={st.profitFactor >= 1 ? "text-ok" : "text-danger"} />
        <Mini label="Best day" value={bestDay ? formatMoney(bestDay.pnl, ctx, { sign: true }) : "—"} note={bestDay ? formatDate(bestDay.day, "medium") : undefined} tone="text-ok" />
        <Mini label={streak.currentGreen ? "Green-day streak" : "Red-day streak"} value={`${streak.current} day${streak.current === 1 ? "" : "s"}`} note={`Longest green run ${streak.bestGreen}`} tone={streak.currentGreen ? "text-ok" : "text-danger"} />
      </div>
      <Card
        title={formatMonth(mo)}
        sub={`${inMonth.length} trading day${inMonth.length === 1 ? "" : "s"} · ${green} green · ${inMonth.length - green} red`}
        action={
          <div className="flex items-center gap-1">
            <span className={cn("num mr-2 text-[15px] font-semibold", plc(monthNet))}>{formatMoney(monthNet, ctx, { sign: true })}</span>
            <button type="button" aria-label="Previous month" onClick={() => setMo(monthKey(addMonths(first, -1)))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line hover:bg-surface-2"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Next month" onClick={() => setMo(monthKey(addMonths(first, 1)))} disabled={mo >= monthKey(today)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line hover:bg-surface-2 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        }
      >
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-ink-3">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const v = map.get(d);
            const a = v ? 0.18 + 0.72 * (Math.abs(v.pnl) / maxAbs) : 0;
            return (
              <button
                key={d}
                type="button"
                disabled={!v}
                onClick={() => setDay(day === d ? null : d)}
                aria-label={v ? `${formatDate(d, "medium")}: ${formatMoney(v.pnl, ctx, { sign: true })}` : formatDate(d, "medium")}
                className={cn("flex aspect-square min-h-10 flex-col items-center justify-center rounded-lg border text-[11px] transition-transform sm:aspect-[1.4]", v ? "border-transparent hover:scale-[1.04]" : "border-line/60 text-ink-3", day === d && "ring-2 ring-ink")}
                style={v ? { background: v.pnl >= 0 ? `color-mix(in oklab, var(--ok) ${a * 100}%, transparent)` : `color-mix(in oklab, var(--danger) ${a * 100}%, transparent)` } : undefined}
              >
                <span className={cn("font-semibold", v && a > 0.55 ? "text-white" : "")}>{+d.slice(8)}</span>
                {v && <span className={cn("num hidden text-[10px] font-semibold sm:block", a > 0.55 ? "text-white" : plc(v.pnl))}>{kfmt(v.pnl)}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-ink-3">Darker = bigger day. Tap a day to see its trades.{worstDay ? ` Worst day ever: ${formatMoney(worstDay.pnl, ctx, { sign: true })} on ${formatDate(worstDay.day, "medium")}.` : ""}</p>
      </Card>
      <DayList trades={trades} onOpen={onOpen} day={day} setDay={setDay} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swing, delivery and F&O
// ---------------------------------------------------------------------------

function Positional({ trades, onOpen, onAdd }: { trades: Trade[]; onOpen: (t: Trade) => void; onAdd: () => void }) {
  const { ctx, today } = useFinance();
  const [seg, setSeg] = useState<"all" | TradeSegment>("all");
  if (!trades.length)
    return <EmptyState icon={TrendingUp} title="No swing or F&O trades yet" body="Trades you hold for days or weeks, delivery trades and F&O go here." action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>Add a trade</Button>} />;
  const list = trades.filter((t) => seg === "all" || t.segment === seg);
  const open = list.filter(isOpen);
  const st = tradeStats(list);
  const segs = (["swing", "delivery", "fno", "other"] as TradeSegment[]).filter((s) => trades.some((t) => t.segment === s));
  return (
    <div className="flex flex-col gap-4">
      {segs.length > 1 && (
        <div className="no-scrollbar flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Kind">
          {(["all", ...segs] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={seg === s} onClick={() => setSeg(s)} className={cn("h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium", seg === s ? "bg-inverse text-on-inverse" : "bg-surface-3/70 text-ink-2 hover:text-ink")}>
              {s === "all" ? "All" : SEGMENT_LABEL[s]}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Profit (closed)" value={formatMoney(st.net, ctx, { sign: true })} tone={plc(st.net)} />
        <Mini label="Win rate" value={formatPct(st.winRate * 100, 0)} note={`${st.count} closed`} />
        <Mini label="Open positions" value={String(open.length)} note={open.length ? `${formatMoney(open.reduce((s, t) => s + tradeValue(t), 0), ctx)} put in` : undefined} />
        <Mini label="Average hold" value={(() => { const c = list.filter((t) => !isOpen(t)); return c.length ? `${Math.round(c.reduce((s, t) => s + Math.max(0, (parseISO(t.exit_date!).getTime() - parseISO(t.entry_date).getTime()) / 864e5), 0) / c.length)} days` : "—"; })()} />
      </div>
      {open.length > 0 && (
        <Card title="Open positions" sub="Still holding. Tap one to record the exit.">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {open.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onOpen(t)} className="lift flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-3 text-left">
                  <EntityIcon kind="stock" name={t.name || t.symbol} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{t.symbol} <span className="text-[11px] font-semibold uppercase text-ink-3">{SEGMENT_LABEL[t.segment]}</span></span>
                    <span className="num block text-[12.5px] text-ink-2">{t.quantity} × {formatMoney(t.entry_price, ctx, { decimals: true })}</span>
                    <span className="block text-[11.5px] text-ink-3">since {formatDate(t.entry_date, "medium")} · {Math.round((parseISO(today).getTime() - parseISO(t.entry_date).getTime()) / 864e5)} days</span>
                  </span>
                  <span className="num shrink-0 text-[15px] font-semibold">{formatMoney(tradeValue(t), ctx)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <DayList trades={list.filter((t) => !isOpen(t))} onOpen={onOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Holdings: the stocks you own, long term vs short term
// ---------------------------------------------------------------------------

function Holdings() {
  const { positions, ds, today, ctx } = useFinance();
  const router = useRouter();
  const list = [...positions.investments.values()].filter((p) => !p.investment.archived && (p.investment.type === "stock" || p.investment.type === "etf")).sort((a, b) => b.valueBase - a.valueBase);
  if (!list.length)
    return <EmptyState icon={Wallet} title="No stocks yet" body="Stocks and ETFs you own show here, with long-term and short-term holdings split out." action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("investment", undefined, { type: "stock" })}>Add a stock</Button>} />;
  const rows = list.map((p) => {
    const since = boughtOn(p.investment, ds.transactions);
    return { p, since, term: holdingTerm(since, today) };
  });
  const groups: { id: "long" | "short" | "unknown"; title: string; sub: string }[] = [
    { id: "long", title: "Long term", sub: "Held over a year: gains are long-term capital gains." },
    { id: "short", title: "Short term", sub: "Held a year or less." },
    { id: "unknown", title: "Purchase date not set", sub: "Edit the stock and add when you bought it to see which it is." },
  ];
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Your stocks" className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {list.map((p, i) => (
          <div key={p.investment.id} className="w-[82%] max-w-[340px] shrink-0 snap-center sm:w-auto sm:max-w-none">
            <HoldingTile id={p.investment.id} index={i} onClick={() => router.push(`/my-money/holding?id=${p.investment.id}`)} />
          </div>
        ))}
      </section>
      {groups.map((g) => {
        const rs = rows.filter((r) => r.term === g.id);
        if (!rs.length) return null;
        const val = rs.reduce((s, r) => s + r.p.valueBase, 0);
        const gain = rs.reduce((s, r) => s + r.p.gain, 0);
        return (
          <Card key={g.id} title={g.title} sub={g.sub} action={<span className="text-right"><span className="num block text-[15px] font-semibold">{formatMoney(val, ctx)}</span><span className={cn("num block text-[12px]", plc(gain))}>{formatMoney(gain, ctx, { sign: true })}</span></span>}>
            <ul className="-mx-2 flex flex-col">
              {rs.map(({ p, since }) => (
                <li key={p.investment.id}>
                  <button type="button" onClick={() => router.push(`/my-money/holding?id=${p.investment.id}`)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
                    <EntityIcon kind="stock" name={p.investment.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{p.investment.name}</span>
                      <span className="num block truncate text-[12px] text-ink-3">
                        {p.units != null ? `${p.units.toLocaleString("en-IN")} shares` : ""}
                        {p.price != null ? ` · ${formatMoney(p.price, ctx, { decimals: true })}` : ""}
                        {since ? ` · since ${formatDate(since, "medium")}` : ""}
                        {since && g.id === "short" ? ` · long term in ${daysToLongTerm(since, today)} days` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-[14.5px] font-semibold">{formatMoney(p.value, ctx)}</span>
                      <span className={cn("num block text-[11.5px]", plc(p.gain))}>{formatMoney(p.gain, ctx, { sign: true })} ({p.gainPct >= 0 ? "+" : ""}{formatPct(p.gainPct)})</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mutual funds: the same funds as My Money, with live NAVs, SIPs and profit
// ---------------------------------------------------------------------------

function Funds() {
  const { positions, ctx } = useFinance();
  const router = useRouter();
  const list = [...positions.investments.values()].filter((p) => !p.investment.archived && p.investment.type === "mutual_fund").sort((a, b) => b.valueBase - a.valueBase);
  if (!list.length)
    return <EmptyState icon={Wallet} title="No mutual funds yet" body="Funds you hold show here with today's NAV, your SIP and your profit." action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("investment", undefined, { type: "mutual_fund" })}>Add a fund</Button>} />;
  const inv = list.reduce((s, p) => s + toBase(p.invested, p.investment.currency, ctx), 0);
  const val = list.reduce((s, p) => s + p.valueBase, 0);
  const sip = list.reduce((s, p) => s + (p.investment.sip_active ? p.investment.sip_amount : 0), 0);
  const open = (id: string) => router.push(`/my-money/holding?id=${id}`);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Mini label="Invested" value={formatMoney(inv, ctx)} />
        <Mini label="Current" value={formatMoney(val, ctx)} />
        <Mini label={val - inv >= 0 ? "Profit" : "Loss"} value={formatMoney(val - inv, ctx, { sign: true })} tone={plc(val - inv)} note={inv > 0 ? formatPct(((val - inv) / inv) * 100) : undefined} />
        <Mini label="SIPs a month" value={formatMoney(sip, ctx)} />
      </div>
      <section aria-label="Your funds" className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {list.map((p, i) => (
          <div key={p.investment.id} className="w-[82%] max-w-[340px] shrink-0 snap-center sm:w-auto sm:max-w-none">
            <HoldingTile id={p.investment.id} index={i} onClick={() => open(p.investment.id)} />
          </div>
        ))}
      </section>
      <Card title="All funds" sub="NAVs update from AMFI when you open the app.">
        <ul className="-mx-2 flex flex-col">
          {list.map((p) => {
            const i = p.investment;
            const cost = p.units ? p.invested / p.units : null;
            return (
              <li key={i.id}>
                <button type="button" onClick={() => open(i.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-surface-2">
                  <EntityIcon kind="fund" name={i.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{i.name}</span>
                    <span className="num block truncate text-[12px] text-ink-3">
                      {p.units != null ? `${p.units.toLocaleString("en-IN", { maximumFractionDigits: 3 })} units` : ""}
                      {cost != null && p.price != null ? ` · ${formatMoney(cost, ctx, { decimals: true })} → ${formatMoney(p.price, ctx, { decimals: true })}` : ""}
                      {i.sip_active && i.sip_amount > 0 ? ` · SIP ${formatMoney(i.sip_amount, ctx)}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-[14.5px] font-semibold">{formatMoney(p.value, ctx)}</span>
                    <span className={cn("num block text-[11.5px]", plc(p.gain))}>{formatMoney(p.gain, ctx, { sign: true })} ({p.gainPct >= 0 ? "+" : ""}{formatPct(p.gainPct)})</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// IPOs
// ---------------------------------------------------------------------------

const STEPS = ["Applied", "Allotment", "Listed", "Sold"];
function stepOf(i: IpoApplication): number {
  return i.status === "applied" ? 0 : i.status === "allotted" || i.status === "not_allotted" || i.status === "withdrawn" ? 1 : i.status === "listed" ? 2 : 3;
}

function Ipos({ list, onOpen, onAdd }: { list: IpoApplication[]; onOpen: (i: IpoApplication) => void; onAdd: () => void }) {
  const { ctx } = useFinance();
  if (!list.length)
    return <EmptyState icon={Rocket} title="No IPOs yet" body="Add the IPOs you apply for to track allotment, listing gains and what you booked." action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onAdd}>Add an IPO</Button>} />;
  const st = ipoStats(list);
  const sorted = [...list].sort((a, b) => (a.status === "applied" ? -1 : 0) - (b.status === "applied" ? -1 : 0) || (a.apply_date < b.apply_date ? 1 : -1));
  const quick = async (i: IpoApplication, patch: Partial<IpoApplication>) => useStore.getState().patch("ipo_applications", i.id, patch);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="Applied" value={String(st.applied)} note={st.pending.length ? `${st.pending.length} waiting for allotment` : undefined} />
        <Mini label="Allotment rate" value={formatPct(st.allotmentRate * 100, 0)} note={`${st.allotted} of ${st.decided} decided`} />
        <Mini label="Gains" value={formatMoney(st.gains, ctx, { sign: true })} tone={plc(st.gains)} note={`${formatMoney(st.booked, ctx, { sign: true })} booked`} />
        <Mini label="Money blocked" value={formatMoney(st.blocked, ctx)} note="Released if not allotted" />
      </div>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {sorted.map((i, k) => {
          const step = stepOf(i);
          const failed = i.status === "not_allotted" || i.status === "withdrawn";
          const gain = ipoGain(i);
          const lp = ipoListingPct(i);
          return (
            <li key={i.id} className="anim-rise" style={{ animationDelay: `${k * 50}ms` }}>
              <div className="rounded-2xl border border-line bg-surface p-4">
                <button type="button" onClick={() => onOpen(i)} className="flex w-full items-start gap-3 text-left">
                  <EntityIcon kind="stock" name={i.name} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold">{i.name}</span>
                    <span className="num block text-[12.5px] text-ink-3">
                      {formatDate(i.apply_date, "medium")} · {i.lots} lot{i.lots === 1 ? "" : "s"} × {i.lot_size} @ {formatMoney(i.price, ctx)} = {formatMoney(ipoApplied(i), ctx)}
                    </span>
                  </span>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold", failed ? "bg-danger-soft text-danger" : i.status === "applied" ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>
                    {IPO_STATUS_LABEL[i.status]}
                  </span>
                </button>
                <ol className="mt-3 flex items-center" aria-label="Progress">
                  {STEPS.map((s, n) => {
                    const done = n < step || (n === step && !failed);
                    const bad = failed && n === step;
                    return (
                      <li key={s} className="flex flex-1 items-center last:flex-none">
                        <span className="flex flex-col items-center gap-1">
                          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold", bad ? "bg-danger text-white" : done ? "bg-ok text-white" : "bg-surface-3 text-ink-3")}>{bad ? "×" : done ? "✓" : n + 1}</span>
                          <span className={cn("text-[10.5px]", done || bad ? "text-ink-2" : "text-ink-3")}>{bad && n === 1 ? (i.status === "withdrawn" ? "Withdrawn" : "Not allotted") : s}</span>
                        </span>
                        {n < STEPS.length - 1 && <span className={cn("mx-1 mb-4 h-0.5 flex-1 rounded-full", n < step && !(failed && n + 1 >= step) ? "bg-ok" : "bg-surface-3")} />}
                      </li>
                    );
                  })}
                </ol>
                {(i.allotted_shares > 0 || gain != null) && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-[13px]">
                    <span className="text-ink-2"><span className="num font-semibold text-ink">{i.allotted_shares}</span> shares</span>
                    {i.listing_price != null && <span className="text-ink-2">Listed at <span className="num font-semibold text-ink">{formatMoney(i.listing_price, ctx, { decimals: true })}</span>{lp != null && <span className={cn("num ml-1 font-semibold", plc(lp))}>({lp >= 0 ? "+" : ""}{formatPct(lp)})</span>}</span>}
                    {gain != null && <span className={cn("num ml-auto text-[15px] font-semibold", plc(gain))}>{formatMoney(gain, ctx, { sign: true })}{i.status === "sold" ? " booked" : ""}</span>}
                  </div>
                )}
                {i.status === "applied" && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="primary" onClick={() => quick(i, { status: "allotted", allotted_shares: i.lot_size })}>Got allotted</Button>
                    <Button size="sm" onClick={() => quick(i, { status: "not_allotted", allotted_shares: 0 })}>Not allotted</Button>
                  </div>
                )}
                {i.status === "allotted" && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                    <Button size="sm" variant="primary" onClick={() => onOpen(i)}>Add listing price</Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Trading Training: lessons, quizzes and daily chart practice, with your level and streak. */
function TrainingTile() {
  const t = useTraining();
  const started = t.data.attempts.length > 0 || t.data.lessons.length > 0;
  return (
    <Link href={TRAINING_PATH} className="lift group mb-4 flex items-center gap-4 rounded-2xl bg-inverse p-4 text-on-inverse">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
        <ChartCandlestick className="h-7 w-7 text-warn" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-tight">Trading Training</span>
        <span className="mt-0.5 block text-[12.5px] opacity-75">
          {started ? `Level ${t.level.level} · ${t.streak.current}-day streak · ${t.todayStats.xp} XP today` : "Learn to read candlestick charts: lessons, quizzes and daily practice"}
        </span>
      </span>
      <span className="text-[13px] font-semibold text-warn">Open →</span>
    </Link>
  );
}
