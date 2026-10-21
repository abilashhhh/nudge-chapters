"use client";

import { ArrowLeft, Plus, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { charges, fillPrice, ist, type OrderType, type Product, type Side } from "@/lib/sim/core";
import { addToWatchlist, newClientId, removeFromWatchlist, simCall, useSim, type Candle, type SimOrder } from "@/lib/sim/store";
import { ticker } from "@/lib/sim/universe";
import { Button } from "../ui/button";
import { Field, NumberInput } from "../ui/form";
import { Segmented } from "../ui/misc";
import { INDICATORS, PriceChart, type Indicator } from "./price-chart";
import { Box, Fresh, Mono, inr, pct, plTone, price, signed, usePortfolio } from "./shared";

const TFS = [
  { id: "1m", label: "1m", intraday: true },
  { id: "5m", label: "5m", intraday: true },
  { id: "15m", label: "15m", intraday: true },
  { id: "30m", label: "30m", intraday: true },
  { id: "1h", label: "1h", intraday: true },
  { id: "1d", label: "1D", intraday: false },
  { id: "1w", label: "1W", intraday: false },
  { id: "1mo", label: "1M", intraday: false },
] as const;
type Tf = (typeof TFS)[number]["id"];

const IND_KEY = "nudge:sim:indicators";

export function StockView({ symbol, onBack }: { symbol: string; onBack: () => void }) {
  const { quotes, watchlist, account, refreshQuotes } = useSim();
  const q = quotes[symbol];
  const [tf, setTf] = useState<Tf>("1d");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [chartErr, setChartErr] = useState<string | null>(null);
  const [ind, setInd] = useState<Indicator[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(IND_KEY) ?? "null") ?? ["ma20"];
    } catch {
      return ["ma20"];
    }
  });
  const intraday = TFS.find((t) => t.id === tf)!.intraday;

  useEffect(() => {
    void refreshQuotes([symbol]);
  }, [symbol, refreshQuotes]);
  useEffect(() => {
    let live = true;
    setCandles(null);
    setChartErr(null);
    simCall<{ candles: Candle[] }>("chart", { symbol, tf })
      .then((r) => live && setCandles(r.candles))
      .catch((e) => live && setChartErr(e instanceof Error ? e.message : "Couldn't load the chart"));
    return () => {
      live = false;
    };
  }, [symbol, tf]);
  const toggle = (i: Indicator) => {
    const next = ind.includes(i) ? ind.filter((x) => x !== i) : [...ind, i];
    setInd(next);
    try {
      localStorage.setItem(IND_KEY, JSON.stringify(next));
    } catch {
      /* fine */
    }
  };
  const starred = watchlist.some((w) => w.symbol === symbol);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-3 inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13.5px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </button>
      <div className="mb-4 flex items-start gap-3">
        <Mono name={q?.name} symbol={symbol} />
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-[20px] font-semibold leading-tight lg:text-[24px]">{q?.name ?? ticker(symbol)}</h1>
          <p className="text-[12.5px] text-ink-3">{ticker(symbol)} · {symbol.endsWith(".BO") ? "BSE" : symbol.startsWith("^") ? "Index" : "NSE"}</p>
        </div>
        {account && <Button
          size="sm"
          variant="ghost"
          icon={starred ? <Star className="h-4 w-4 fill-warn text-warn" /> : <Plus className="h-4 w-4" />}
          onClick={async () => {
            try {
              if (starred) await removeFromWatchlist(symbol);
              else await addToWatchlist(symbol, q?.name ?? null);
            } catch {
              toast.error("Couldn't update your watchlist");
            }
          }}
        >
          {starred ? "Watching" : "Watch"}
        </Button>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Box>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="num text-[28px] font-semibold leading-none">{q ? price(q.price) : "–"}</p>
                <p className={cn("num mt-1 text-[13px]", plTone(q?.change))}>{q ? `${q.change >= 0 ? "+" : "−"}${price(Math.abs(q.change))} (${pct(q.changePct)}) today` : "Getting price…"}</p>
                <Fresh q={q} className="mt-1" />
              </div>
              <Segmented size="sm" value={tf} onChange={setTf} options={TFS.map((t) => ({ id: t.id, label: t.label }))} />
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {INDICATORS.filter((i) => !i.intraday || intraday).map((i) => (
                <button key={i.id} type="button" aria-pressed={ind.includes(i.id)} onClick={() => toggle(i.id)} className={cn("rounded-full border px-2.5 py-0.5 text-[12px]", ind.includes(i.id) ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:border-line-strong")}>
                  {i.label}
                </button>
              ))}
            </div>
            {chartErr ? (
              <p className="py-16 text-center text-[13px] text-warn">{chartErr}</p>
            ) : !candles ? (
              <div className="h-[360px] animate-pulse rounded-xl bg-surface-2" />
            ) : !candles.length ? (
              <p className="py-16 text-center text-[13px] text-ink-3">No candles for this timeframe.</p>
            ) : (
              <PriceChart candles={candles} intraday={intraday} indicators={ind} lastPrice={q?.price} />
            )}
            <p className="mt-2 text-[11.5px] text-ink-3">Scroll or pinch to zoom, drag to move. Candles are real market data from Yahoo Finance and may be delayed.</p>
          </Box>
          <Box title="Today">
            <dl className="num grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
              {(
                [
                  ["Open", price(q?.open)],
                  ["Previous close", price(q?.prevClose)],
                  ["Day high", price(q?.high)],
                  ["Day low", price(q?.low)],
                  ["Volume", q?.volume != null ? q.volume.toLocaleString("en-IN") : "–"],
                  ["Market", q ? (q.status === "open" ? "Open" : q.status === "pre_open" ? "Pre-open" : "Closed") : "–"],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-ink-3">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Box>
          <HoldingHistory symbol={symbol} />
        </div>
        {!symbol.startsWith("^") && account && <OrderPanel symbol={symbol} />}
      </div>
    </div>
  );
}

function OrderPanel({ symbol }: { symbol: string }) {
  const { account, quotes, positions, orders, load } = useSim();
  const pf = usePortfolio();
  const s = account!.settings;
  const q = quotes[symbol];
  const [side, setSide] = useState<Side>("buy");
  const [product, setProduct] = useState<Product>(s.defaultProduct);
  const [type, setType] = useState<OrderType>(s.defaultOrderType);
  const [qty, setQty] = useState<string>("1");
  const [limit, setLimit] = useState<string>("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(newClientId);

  useEffect(() => {
    if (q && !limit) setLimit(String(q.price));
  }, [q, limit]);
  useEffect(() => {
    setReview(false);
  }, [side, product, type, qty, limit]);

  const pos = positions.find((p) => p.symbol === symbol && p.product === product && p.qty > 0);
  const reserved = orders.filter((o) => o.status === "open" && o.side === "sell" && o.symbol === symbol && o.product === product).reduce((a, o) => a + o.qty, 0);
  const free = Math.max(0, (pos?.qty ?? 0) - reserved);
  const n = Math.floor(Number(qty));
  const lim = Number(limit);
  const ref = q?.price ?? 0;
  const est = type === "limit" && lim > 0 ? fillPrice(side, "limit", ref, lim, s.slippageBps) : fillPrice(side, "market", ref, null, s.slippageBps);
  const worst = type === "limit" && lim > 0 ? lim : est;
  const value = n > 0 ? worst * n : 0;
  const ch = charges(side, product, value, s);
  const cost = side === "buy" ? value + ch.total : value - ch.total;
  const realized = side === "sell" && pos && n > 0 ? (worst - pos.avg_price) * n - ch.total - (pos.buy_charges * n) / pos.qty : null;
  const maxBuy = ref > 0 ? Math.floor(account!.cash / (est * (1 + (s.chargesOn ? 0.0013 : 0)))) : 0;
  const closed = q?.status !== "open";
  const afterCut = ist(Date.now()).time >= s.squareOffAt;
  const problem =
    !q ? "Waiting for a price…"
    : !(n > 0) || n !== Number(qty) ? "Enter a whole number of shares."
    : type === "limit" && !(lim > 0) ? "Enter a limit price."
    : type === "market" && closed ? "Market is closed — use a limit order."
    : product === "intraday" && (closed || afterCut) ? (closed ? "Intraday needs the market open." : `Intraday stops at ${s.squareOffAt}.`)
    : side === "buy" && cost > account!.cash ? "Not enough virtual cash."
    : side === "sell" && n > free ? (free ? `You can sell up to ${free}.` : `You don't hold this as ${product}.`)
    : null;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await simCall<{ order: SimOrder; rejected?: string; result?: { ok: boolean; reason?: string; price?: number } | null }>("place", { client_id: clientId, symbol, side, product, type, qty: n, limit: type === "limit" ? lim : null });
      if (r.rejected) toast.error(`Order rejected: ${r.rejected}`);
      else if (r.order.status === "filled") toast.success(`Simulated ${side === "buy" ? "buy" : "sale"}: ${n} ${ticker(symbol)} at ${price(r.order.avg_fill_price)}`);
      else if (r.order.status === "open") toast.success(`Limit order placed — it fills if the price reaches ${price(lim)}.`);
      else toast.error(r.order.reason ?? "Order not filled");
      setClientId(newClientId());
      setReview(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't place the order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <Box>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-3 p-1" role="radiogroup" aria-label="Buy or sell">
          {(["buy", "sell"] as const).map((x) => (
            <button key={x} type="button" role="radio" aria-checked={side === x} onClick={() => setSide(x)} className={cn("rounded-lg py-2 text-[14px] font-semibold", side === x ? (x === "buy" ? "bg-ok text-white" : "bg-danger text-white") : "text-ink-2")}>
              {x === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Segmented size="sm" value={product} onChange={setProduct} options={[{ id: "delivery", label: "Delivery" }, { id: "intraday", label: "Intraday" }]} />
          <Segmented size="sm" value={type} onChange={setType} options={[{ id: "market", label: "Market" }, { id: "limit", label: "Limit" }]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" htmlFor="sim-qty" help={side === "buy" ? `Up to ~${maxBuy.toLocaleString("en-IN")}` : `You can sell ${free}`}>
            <NumberInput id="sim-qty" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          {type === "limit" ? (
            <Field label="Limit price" htmlFor="sim-limit">
              <NumberInput id="sim-limit" min={0.05} step={0.05} value={limit} onChange={(e) => setLimit(e.target.value)} />
            </Field>
          ) : (
            <Field label="Market price" help={s.slippageBps ? `+${(s.slippageBps / 100).toFixed(2)}% slippage` : undefined}>
              <p className="num flex h-11 items-center text-[15px] font-semibold">{price(ref || null)}</p>
            </Field>
          )}
        </div>

        <dl className="num mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[13px]">
          {side === "sell" && pos && (
            <>
              <Row k="You hold" v={`${pos.qty} · avg ${price(pos.avg_price)}`} />
            </>
          )}
          <Row k="Price used" v={`${price(worst || null)}${type === "limit" ? " or better" : ""}`} />
          <Row k="Order value" v={inr(value)} />
          <details className="group">
            <summary className="flex cursor-pointer list-none justify-between text-ink-2">
              <span className="underline decoration-dotted underline-offset-2">Charges (estimate)</span>
              <span>{inr(ch.total)}</span>
            </summary>
            <div className="mt-1 flex flex-col gap-0.5 rounded-lg bg-surface-2 p-2 text-[12px] text-ink-3">
              <Row k="Brokerage" v={inr(ch.brokerage)} />
              <Row k="STT" v={inr(ch.stt)} />
              <Row k="Exchange" v={inr(ch.exchange)} />
              <Row k="SEBI" v={inr(ch.sebi)} />
              <Row k="GST" v={inr(ch.gst)} />
              <Row k="Stamp duty" v={inr(ch.stamp)} />
            </div>
          </details>
          <Row k={side === "buy" ? "Total cost" : "You get"} v={inr(Math.max(0, cost))} strong />
          {realized != null && <Row k="Profit on this sale" v={signed(realized)} tone={plTone(realized)} />}
          <Row k="Cash left after" v={inr(side === "buy" ? account!.cash - cost : account!.cash + cost)} />
        </dl>

        {problem ? (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-ink-2">{problem}</p>
        ) : review ? (
          <div className="mt-3 rounded-xl border border-line p-3">
            <p className="text-[13.5px]">
              {side === "buy" ? "Buy" : "Sell"} <b>{n}</b> {ticker(symbol)} · {product} · {type === "market" ? "at market" : `limit ${price(lim)}`}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-3">Simulated — no real order is placed and no real money moves. Market reference {price(ref)} ({q ? new Date(q.time).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" }) : ""}).</p>
            <div className="mt-2 flex gap-2">
              <Button className="flex-1" onClick={() => setReview(false)}>Edit</Button>
              <Button className={cn("flex-1", side === "buy" ? "bg-ok text-white hover:opacity-90" : "")} variant={side === "buy" ? "primary" : "danger"} loading={busy} onClick={submit}>
                Confirm {side}
              </Button>
            </div>
          </div>
        ) : (
          <Button className="mt-3 w-full" variant={side === "buy" ? "primary" : "danger"} onClick={() => setReview(true)}>
            Review {side === "buy" ? "buy" : "sell"} order
          </Button>
        )}
        <p className="mt-3 text-[11.5px] text-ink-3">
          Cash {inr(pf.cash)} · Charges are estimates and may not match your broker.
        </p>
      </Box>
    </aside>
  );
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-2">{k}</dt>
      <dd className={cn(strong && "font-semibold", tone)}>{v}</dd>
    </div>
  );
}

/** Every simulated trade in this stock. */
function HoldingHistory({ symbol }: { symbol: string }) {
  const { fills, positions, quotes } = useSim();
  const mine = useMemo(() => fills.filter((f) => f.symbol === symbol), [fills, symbol]);
  const open = positions.filter((p) => p.symbol === symbol && p.qty > 0);
  if (!mine.length) return null;
  const ltp = quotes[symbol]?.price;
  return (
    <Box title="Your trades in this stock">
      {open.map((p) => {
        const un = ltp != null ? (ltp - p.avg_price) * p.qty - p.buy_charges : null;
        return (
          <p key={p.product} className="num mb-2 text-[13px]">
            Holding <b>{p.qty}</b> ({p.product}) at avg {price(p.avg_price)}
            {un != null && <span className={cn("ml-2", plTone(un))}>{signed(un)}</span>}
          </p>
        );
      })}
      <ul className="num flex flex-col divide-y divide-line text-[13px]">
        {mine.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              <span className={cn("font-semibold", f.side === "buy" ? "text-ok" : "text-danger")}>{f.side === "buy" ? "Bought" : "Sold"}</span> {f.qty} at {price(f.price)}
              <span className="block text-[11.5px] text-ink-3">{new Date(f.executed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "medium" })} · {f.product} · charges {inr(f.charges)}</span>
            </span>
            {f.realized_pnl != null && <span className={plTone(f.realized_pnl)}>{signed(f.realized_pnl)}</span>}
          </li>
        ))}
      </ul>
    </Box>
  );
}
