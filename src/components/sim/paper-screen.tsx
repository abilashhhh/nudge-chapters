"use client";

import { AlertTriangle, ChartCandlestick, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { marketStatus } from "@/lib/sim/core";
import { simCall, useSim } from "@/lib/sim/store";
import { INDICES, LARGE_CAPS, ticker } from "@/lib/sim/universe";
import { useStore } from "@/lib/store";
import { Button } from "../ui/button";
import { Field, NumberInput } from "../ui/form";
import { EmptyState, Tabs } from "../ui/misc";
import { V2PageHeader } from "../v2/ui";
import { MarketTab } from "./market";
import { AnalyticsTab, OrdersTab, PortfolioTab, SettingsTab } from "./panels";
import { Metric, inr, pct, plTone, signed, usePortfolio, useSimView, type SimTab } from "./shared";
import { StockView } from "./stock-view";

/** Paper Trading: a market simulator with real prices and a virtual account. No real money or orders. */
export function PaperTradingScreen() {
  const repoKind = useStore((s) => s.repo?.kind);
  const sim = useSim();
  const [view, go] = useSimView();

  useEffect(() => {
    if (repoKind === "supabase" && sim.status === "idle") void sim.load();
  }, [repoKind, sim]);

  usePolling(view.tab, view.stock);

  if (repoKind && repoKind !== "supabase")
    return (
      <>
        <V2PageHeader title="Paper Trading" />
        <EmptyState icon={ChartCandlestick} title="Sign in to use Paper Trading" body="The simulator keeps your virtual account on the server and gets market prices there, so it needs a signed-in account (it isn't available in demo mode)." />
      </>
    );
  if (sim.status === "idle" || sim.status === "loading")
    return (
      <>
        <V2PageHeader title="Paper Trading" />
        <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      </>
    );
  if (sim.status === "error")
    return (
      <>
        <V2PageHeader title="Paper Trading" />
        <EmptyState icon={AlertTriangle} title="Paper Trading couldn't load" body={sim.error ?? undefined} action={<Button onClick={() => void sim.load()}>Try again</Button>} />
      </>
    );
  if (!sim.account) return <StartScreen />;
  if (view.stock) return <StockView symbol={view.stock} onBack={() => go({ stock: null })} />;

  const open = (s: string) => go({ stock: s });
  return (
    <>
      <V2PageHeader title="Paper Trading" shortTitle="Paper Trading" actions={<MarketPill />} />
      <AccountStrip />
      <Tabs<SimTab>
        className="mb-4"
        value={view.tab}
        onChange={(tab) => go({ tab, stock: null })}
        tabs={[
          { id: "market", label: "Market" },
          { id: "portfolio", label: "Portfolio", count: sim.positions.filter((p) => p.qty > 0).length || undefined },
          { id: "orders", label: "Orders", count: sim.orders.filter((o) => o.status === "open").length || undefined },
          { id: "analytics", label: "Analytics" },
          { id: "settings", label: "Settings" },
        ]}
      />
      {view.tab === "market" && <MarketTab open={open} />}
      {view.tab === "portfolio" && <PortfolioTab open={open} />}
      {view.tab === "orders" && <OrdersTab open={open} />}
      {view.tab === "analytics" && <AnalyticsTab />}
      {view.tab === "settings" && <SettingsTab />}
      <p className="mt-6 text-[12px] leading-relaxed text-ink-3">
        Practice only: every order here is simulated against market prices — nothing is sent to an exchange and no real money moves. Prices come from Yahoo Finance and can be delayed; each price shows when it was quoted. Limit orders are checked against the latest price when the simulator refreshes, and stay open up to 7 days. Charges are estimates.
      </p>
    </>
  );
}

function MarketPill() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const nifty = useSim((s) => s.quotes["^NSEI"]);
  const st = nifty?.status ?? marketStatus(Date.now());
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", st === "open" ? "bg-ok/15 text-ok" : st === "pre_open" ? "bg-warn-soft text-warn" : "bg-surface-3 text-ink-2")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", st === "open" ? "animate-pulse bg-ok" : st === "pre_open" ? "bg-warn" : "bg-ink-3")} aria-hidden />
      {st === "open" ? "Market open" : st === "pre_open" ? "Pre-open" : "Market closed"}
    </span>
  );
}

function AccountStrip() {
  const pf = usePortfolio();
  const { quotesAt, quotesError } = useSim();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mb-4">
      <div className="mb-2 rounded-2xl bg-inverse p-4 text-on-inverse">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] opacity-75">Virtual account value</p>
            <p className="num text-[28px] font-semibold leading-tight">{inr(pf.equity)}</p>
            <p className={cn("num text-[13px]", pf.total >= 0 ? "text-[#7ee2b8]" : "text-[#ffb4b6]")}>
              {signed(pf.total)} ({pct(pf.totalPct)}) since you started with {inr(pf.initial, true)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[12px] opacity-75">Cash to trade</p>
            <p className="num text-[20px] font-semibold">{inr(pf.cash)}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Metric label="Invested" value={inr(pf.invested, true)} />
        <Metric label="Holdings now" value={inr(pf.holdingsValue, true)} />
        <Metric label="Unrealized" value={signed(pf.unrealized, true)} tone={plTone(pf.unrealized)} />
        <Metric label="Realized" value={signed(pf.realized, true)} tone={plTone(pf.realized)} />
        <Metric label="Trades closed" value={String(pf.completed)} />
        <Metric label="Open positions" value={String(pf.openPositions)} />
      </div>
      <div className="mt-2 flex items-center justify-end gap-2 text-[11.5px] text-ink-3">
        {quotesError ? <span className="text-warn">Prices couldn&apos;t refresh — showing the last ones</span> : quotesAt ? <span>Prices checked {new Date(quotesAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span> : <span>Getting prices…</span>}
        <button
          type="button"
          aria-label="Refresh prices"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await refreshAll(true);
            } finally {
              setBusy(false);
            }
          }}
          className="grid h-7 w-7 place-items-center rounded-full text-ink-2 hover:bg-surface-3 disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
        </button>
      </div>
    </div>
  );
}

function StartScreen() {
  const [capital, setCapital] = useState("100000");
  const [busy, setBusy] = useState(false);
  const load = useSim((s) => s.load);
  return (
    <>
      <V2PageHeader title="Paper Trading" />
      <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface p-6">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-inverse text-warn">
          <ChartCandlestick className="h-7 w-7" aria-hidden />
        </span>
        <h2 className="display text-[22px] font-semibold">Practise trading with virtual money</h2>
        <p className="mt-1 text-[14px] text-ink-2">
          Buy and sell real NSE and BSE stocks at real market prices, with a virtual balance. Orders are simulated — nothing reaches an exchange and none of your real money is used.
        </p>
        <Field label="Starting virtual capital (₹)" className="mt-5" help="You can reset and start again with a different amount later.">
          <NumberInput min={1000} value={capital} onChange={(e) => setCapital(e.target.value)} />
        </Field>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[50000, 100000, 500000, 1000000].map((v) => (
            <button key={v} type="button" onClick={() => setCapital(String(v))} className={cn("rounded-full border px-3 py-1 text-[12.5px]", Number(capital) === v ? "border-ink bg-ink text-surface" : "border-line text-ink-2")}>
              {inr(v, true)}
            </button>
          ))}
        </div>
        <Button
          className="mt-5 w-full"
          variant="primary"
          size="lg"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await simCall("start", { capital: Number(capital) });
              await load();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Couldn't start");
            } finally {
              setBusy(false);
            }
          }}
        >
          Start with {inr(Number(capital) || 0, true)}
        </Button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ refreshing

let lastSync = 0;

/** Prices for everything on screen, and the simulator's checks (limit orders, square-off). */
async function refreshAll(force = false) {
  const st = useSim.getState();
  const syms = new Set<string>(INDICES.map((i) => i.symbol));
  for (const w of st.watchlist) syms.add(w.symbol);
  for (const p of st.positions) if (p.qty > 0) syms.add(p.symbol);
  for (const o of st.orders) if (o.status === "open") syms.add(o.symbol);
  const path = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const tab = path?.get("tab") ?? "market";
  const stock = path?.get("s");
  if (stock) syms.add(stock);
  if (tab === "market" && !stock) for (const s of LARGE_CAPS) syms.add(s.symbol);
  await st.refreshQuotes([...syms]);
  const needsSync = st.orders.some((o) => o.status === "open") || st.positions.some((p) => p.qty > 0);
  if (st.account && (needsSync || force || Date.now() - lastSync > 10 * 60_000)) {
    lastSync = Date.now();
    try {
      const events = await st.sync();
      if (st.account.settings.notify) for (const e of events) notify(e);
    } catch {
      /* shown as stale prices */
    }
  }
}

function notify(e: { kind: string; symbol: string; side?: string; qty?: number; price?: number; reason?: string }) {
  const name = ticker(e.symbol);
  if (e.kind === "filled") toast.success(`Limit order filled: ${e.side === "buy" ? "bought" : "sold"} ${e.qty} ${name} at ₹${e.price?.toLocaleString("en-IN")}`);
  else if (e.kind === "squared_off") toast(`Intraday ${name} squared off at ₹${e.price?.toLocaleString("en-IN")}`);
  else if (e.kind === "rejected") toast.error(`${name} order rejected: ${e.reason}`);
  else if (e.kind === "expired") toast(`${name} limit order expired`);
  else if (e.kind === "cancelled") toast(`${name} intraday order cancelled at cut-off`);
}

function usePolling(tab: string, stock: string | null) {
  const status = useSim((s) => s.status);
  const account = useSim((s) => s.account);
  const watchCount = useSim((s) => s.watchlist.length);
  const every = account?.settings.refreshSeconds ?? 30;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = useMemo(() => `${tab}|${stock}|${watchCount}|${account?.id}`, [tab, stock, watchCount, account?.id]);
  useEffect(() => {
    if (status !== "ready") return;
    let alive = true;
    const loop = async () => {
      if (!alive) return;
      if (document.visibilityState === "visible") await refreshAll().catch(() => undefined);
      const open = marketStatus(Date.now()) !== "closed";
      timer.current = setTimeout(loop, (open ? every : 300) * 1000);
    };
    void loop();
    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (timer.current) clearTimeout(timer.current);
        void loop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status, key, every]);
}
