// Market Simulator — market data + paper-trading orders. Deploy: supabase functions deploy market-sim
//
// Market data: Yahoo Finance chart/search endpoints (NSE ".NS", BSE ".BO", indices "^NSEI"…). These are
// free, unofficial feeds and may be delayed; the app shows each quote's own timestamp and never calls a
// quote "live" unless it is under a minute old during market hours. Swap the provider by replacing the
// functions in the "provider" section — nothing else depends on Yahoo.
//
// Orders: always simulated. The function fetches the price itself (the app never sends one), checks the
// order against the rules in core.ts and executes it with public.sim_fill(), which locks the account and
// changes cash, position and history in one transaction. Requires a signed-in user's JWT.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  DEFAULT_SETTINGS, charges, checkOrder, fillPrice, ist, limitReached, marketStatus, readSettings, unrealized,
  type AccountState, type MarketStatus, type OrderRequest, type OrderType, type Product, type Side,
} from "./core.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const UA = { "User-Agent": "Mozilla/5.0 (compatible; NudgeChapters/1.0)", Accept: "application/json" };
const SYMBOL = /^[A-Z0-9&.^-]{1,25}$/;
const LIMIT_ORDER_DAYS = 7;

// ============================================================ provider (Yahoo Finance)

export interface Quote {
  symbol: string;
  name: string;
  exchange: string;
  price: number;
  change: number;
  changePct: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volume: number | null;
  /** When the provider says this price was quoted (ISO). */
  time: string;
  status: MarketStatus;
  session: { start: number; end: number } | null;
}

async function getJson(url: string, ms = 8000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (r.status === 429) throw new Error("Market data provider is busy — try again in a minute");
    if (!r.ok) throw new Error(`Market data error ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

const exchangeOf = (sym: string) => (sym.startsWith("^") ? "INDEX" : sym.endsWith(".BO") ? "BSE" : sym.endsWith(".NS") ? "NSE" : "OTHER");

async function providerQuote(sym: string): Promise<Quote> {
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m&includePrePost=false`);
  const res = j?.chart?.result?.[0];
  const m = res?.meta;
  const price = Number(m?.regularMarketPrice);
  if (!m || !Number.isFinite(price) || price <= 0) throw new Error("No price");
  const q = res?.indicators?.quote?.[0] ?? {};
  const firstOpen = (q.open ?? []).find((x: number | null) => x != null) ?? null;
  const prev = Number(m.chartPreviousClose ?? m.previousClose);
  const reg = m.currentTradingPeriod?.regular;
  const session = reg?.start && reg?.end ? { start: Number(reg.start), end: Number(reg.end) } : null;
  const prevClose = Number.isFinite(prev) && prev > 0 ? prev : null;
  return {
    symbol: sym,
    name: m.longName ?? m.shortName ?? sym.replace(/\.(NS|BO)$/, ""),
    exchange: exchangeOf(sym),
    price,
    change: prevClose ? price - prevClose : 0,
    changePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
    open: firstOpen ?? null,
    high: Number.isFinite(m.regularMarketDayHigh) ? m.regularMarketDayHigh : null,
    low: Number.isFinite(m.regularMarketDayLow) ? m.regularMarketDayLow : null,
    prevClose,
    volume: Number.isFinite(m.regularMarketVolume) ? m.regularMarketVolume : null,
    time: new Date((m.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
    status: marketStatus(Date.now(), session),
    session,
  };
}

const TF: Record<string, { interval: string; range: string; ttl: number }> = {
  "1m": { interval: "1m", range: "1d", ttl: 30 },
  "5m": { interval: "5m", range: "5d", ttl: 60 },
  "15m": { interval: "15m", range: "1mo", ttl: 120 },
  "30m": { interval: "30m", range: "1mo", ttl: 300 },
  "1h": { interval: "60m", range: "3mo", ttl: 600 },
  "1d": { interval: "1d", range: "1y", ttl: 1800 },
  "1w": { interval: "1wk", range: "5y", ttl: 3600 },
  "1mo": { interval: "1mo", range: "max", ttl: 3600 },
};

async function providerChart(sym: string, tf: string) {
  const c = TF[tf];
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${c.range}&interval=${c.interval}&includePrePost=false`);
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp ?? [];
  const q = res?.indicators?.quote?.[0] ?? {};
  const candles: [number, number, number, number, number, number][] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], cl = q.close?.[i];
    if ([o, h, l, cl].some((x) => x == null || !Number.isFinite(x))) continue; // gaps are left out, never filled in
    candles.push([ts[i], o, h, l, cl, q.volume?.[i] ?? 0]);
  }
  return { symbol: sym, tf, candles };
}

async function providerSearch(q: string) {
  const j = await getJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&lang=en-IN&region=IN`);
  return ((j?.quotes ?? []) as any[])
    .filter((x) => typeof x.symbol === "string" && ["EQUITY", "ETF"].includes(x.quoteType) && /\.(NS|BO)$/.test(x.symbol) && SYMBOL.test(x.symbol))
    .map((x) => ({ symbol: x.symbol as string, name: (x.longname ?? x.shortname ?? x.symbol) as string, exchange: exchangeOf(x.symbol), type: x.quoteType as string }))
    // NSE first; the BSE line of a company already listed on NSE is left out.
    .sort((a, b) => (a.exchange === b.exchange ? 0 : a.exchange === "NSE" ? -1 : 1))
    .filter((x, i, all) => x.exchange === "NSE" || !all.some((y) => y.exchange === "NSE" && y.name === x.name))
    .slice(0, 12);
}

// ============================================================ shared cache (sim_quote_cache)

async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T & { cachedAt?: string }> {
  const { data } = await admin.from("sim_quote_cache").select("data,fetched_at").eq("key", key).maybeSingle();
  if (data && Date.now() - new Date(data.fetched_at).getTime() < ttlSec * 1000) return { ...(data.data as T), cachedAt: data.fetched_at };
  try {
    const fresh = await load();
    await admin.from("sim_quote_cache").upsert({ key, data: fresh, fetched_at: new Date().toISOString() });
    return fresh as T & { cachedAt?: string };
  } catch (e) {
    // Provider down: serve the last copy we have (the app marks it stale from its timestamp).
    if (data) return { ...(data.data as T), cachedAt: data.fetched_at, stale: true } as T & { cachedAt?: string };
    throw e;
  }
}

/** A quote no older than `maxAge` seconds (shorter while the market is open). */
async function quote(sym: string, maxAge?: number): Promise<Quote> {
  const status = marketStatus(Date.now());
  const ttl = maxAge ?? (status === "open" ? 15 : status === "pre_open" ? 30 : 600);
  const q = await cached<Quote>(`q:${sym}`, ttl, () => providerQuote(sym));
  return { ...q, status: marketStatus(Date.now(), q.session) };
}

async function quotes(syms: string[]): Promise<{ quotes: Quote[]; errors: Record<string, string> }> {
  const list = [...new Set(syms.filter((s) => SYMBOL.test(s)))].slice(0, 80);
  const out: Quote[] = [];
  const errors: Record<string, string> = {};
  for (let i = 0; i < list.length; i += 10) {
    const part = await Promise.allSettled(list.slice(i, i + 10).map((s) => quote(s)));
    part.forEach((r, k) => (r.status === "fulfilled" ? out.push(r.value) : (errors[list[i + k]] = r.reason instanceof Error ? r.reason.message : "No data")));
  }
  return { quotes: out, errors };
}

// ============================================================ accounts & orders

async function activeAccount(user: string) {
  const { data } = await admin.from("sim_accounts").select("*").eq("user_id", user).eq("status", "active").maybeSingle();
  return data;
}

async function accountState(acc: any, prices: Map<string, number>): Promise<AccountState> {
  const [{ data: pos }, { data: open }, { data: fills }] = await Promise.all([
    admin.from("sim_positions").select("symbol,product,qty,avg_price,buy_charges").eq("account_id", acc.id).gt("qty", 0),
    admin.from("sim_orders").select("symbol,product,qty").eq("account_id", acc.id).eq("status", "open").eq("side", "sell"),
    admin.from("sim_fills").select("realized_pnl,executed_at").eq("account_id", acc.id).gte("executed_at", new Date(Date.now() - 36 * 3600_000).toISOString()),
  ]);
  const held: Record<string, number> = {};
  const reservedSell: Record<string, number> = {};
  let unreal = 0;
  for (const p of pos ?? []) {
    held[`${p.symbol}|${p.product}`] = p.qty;
    const ltp = prices.get(p.symbol);
    if (ltp) unreal += unrealized({ qty: p.qty, avg: Number(p.avg_price), buyCharges: Number(p.buy_charges), realized: 0 }, ltp);
  }
  for (const o of open ?? []) reservedSell[`${o.symbol}|${o.product}`] = (reservedSell[`${o.symbol}|${o.product}`] ?? 0) + o.qty;
  const today = ist(Date.now()).date;
  const realizedToday = (fills ?? []).filter((f) => ist(new Date(f.executed_at).getTime()).date === today).reduce((s, f) => s + Number(f.realized_pnl ?? 0), 0);
  return { cash: Number(acc.cash), held, reservedSell, openPositions: new Set((pos ?? []).map((p) => p.symbol)).size, todayPnl: realizedToday + unreal };
}

async function execute(order: any, q: Quote, settings: ReturnType<typeof readSettings>, type: OrderType) {
  const price = fillPrice(order.side, type, q.price, order.limit_price != null ? Number(order.limit_price) : null, settings.slippageBps);
  const ch = charges(order.side, order.product, price * order.qty, settings);
  const { data, error } = await admin.rpc("sim_fill", { p_order_id: order.id, p_price: price, p_ref_price: q.price, p_charges: ch.total, p_detail: ch, p_quote_time: q.time });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; reason?: string; price?: number; realized?: number | null };
}

async function place(user: string, b: any) {
  const acc = await activeAccount(user);
  if (!acc) return json({ error: "Start a simulation first." }, 400);
  const settings = readSettings(acc.settings);
  const req: OrderRequest = {
    symbol: String(b.symbol ?? "").toUpperCase(),
    side: b.side === "sell" ? "sell" : "buy",
    product: b.product === "intraday" ? "intraday" : "delivery",
    type: b.type === "limit" ? "limit" : "market",
    qty: Number(b.qty),
    limit: b.type === "limit" ? Number(b.limit) : null,
  };
  const clientId = String(b.client_id ?? "");
  if (clientId.length < 8 || clientId.length > 64) return json({ error: "Missing order id" }, 400);
  // Same order sent twice (retry, double tap): return the first one.
  const { data: dupe } = await admin.from("sim_orders").select("*").eq("account_id", acc.id).eq("client_id", clientId).maybeSingle();
  if (dupe) return json({ order: dupe, duplicate: true });
  if (req.symbol.startsWith("^")) return json({ error: "Indices can't be traded — pick a stock." }, 400);

  let q: Quote;
  try {
    q = await quote(req.symbol, 10);
  } catch {
    return json({ error: "Couldn't get a market price for this stock right now. Nothing was placed." }, 503);
  }
  const state = await accountState(acc, new Map([[req.symbol, q.price]]));
  const reason = checkOrder(req, q.price, q.status, state, settings, ist(Date.now()).time);
  const base = {
    account_id: acc.id, user_id: user, client_id: clientId, symbol: req.symbol, exchange: q.exchange, name: q.name,
    side: req.side, product: req.product, order_type: req.type, qty: Number.isInteger(req.qty) && req.qty > 0 ? req.qty : 1,
    limit_price: req.type === "limit" && req.limit && req.limit > 0 ? req.limit : null, ref_price: q.price,
  };
  if (reason) {
    const { data: rej } = await admin.from("sim_orders").insert({ ...base, status: "rejected", reason }).select().single();
    return json({ order: rej, rejected: reason, quote: q });
  }
  const { data: order, error } = await admin.from("sim_orders").insert({ ...base, status: "open" }).select().single();
  if (error) {
    if (error.code === "23505") {
      const { data: again } = await admin.from("sim_orders").select("*").eq("account_id", acc.id).eq("client_id", clientId).single();
      return json({ order: again, duplicate: true });
    }
    throw new Error(error.message);
  }
  let result = null;
  if (req.type === "market" || (q.status === "open" && limitReached(req.side, req.limit!, q.price))) result = await execute(order, q, settings, req.type);
  const { data: final } = await admin.from("sim_orders").select("*").eq("id", order.id).single();
  return json({ order: final, result, quote: q });
}

/** Pending limit orders, intraday square-off, expiry and today's snapshot. Safe to call as often as you like. */
async function sync(user: string) {
  const acc = await activeAccount(user);
  if (!acc) return json({ events: [] });
  const settings = readSettings(acc.settings);
  const events: { kind: string; symbol: string; side?: string; qty?: number; price?: number; reason?: string }[] = [];
  const now = Date.now();
  const nowIst = ist(now);

  const [{ data: open }, { data: pos }] = await Promise.all([
    admin.from("sim_orders").select("*").eq("account_id", acc.id).eq("status", "open"),
    admin.from("sim_positions").select("*").eq("account_id", acc.id).gt("qty", 0),
  ]);
  const syms = [...new Set([...(open ?? []).map((o) => o.symbol), ...(pos ?? []).map((p) => p.symbol)])];
  const { quotes: qs } = await quotes(syms);
  const qmap = new Map(qs.map((q) => [q.symbol, q]));

  for (const o of open ?? []) {
    const age = (now - new Date(o.created_at).getTime()) / 86400_000;
    if (age > LIMIT_ORDER_DAYS) {
      const { count } = await admin.from("sim_orders").update({ status: "expired", reason: `Not filled in ${LIMIT_ORDER_DAYS} days`, updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", o.id).eq("status", "open");
      if (count) events.push({ kind: "expired", symbol: o.symbol, side: o.side, qty: o.qty });
      continue;
    }
    if (o.product === "intraday" && (nowIst.time >= settings.squareOffAt || ist(new Date(o.created_at).getTime()).date < nowIst.date)) {
      const { count } = await admin.from("sim_orders").update({ status: "cancelled", reason: "Intraday orders end at square-off time", updated_at: new Date().toISOString() }, { count: "exact" }).eq("id", o.id).eq("status", "open");
      if (count) events.push({ kind: "cancelled", symbol: o.symbol, side: o.side, qty: o.qty, reason: "intraday cut-off" });
      continue;
    }
    const q = qmap.get(o.symbol);
    if (!q || q.status !== "open" || o.order_type !== "limit") continue;
    if (limitReached(o.side, Number(o.limit_price), q.price)) {
      const r = await execute(o, q, settings, "limit");
      if (r?.ok) events.push({ kind: "filled", symbol: o.symbol, side: o.side, qty: o.qty, price: r.price });
      else if (r && r.reason !== "not_open") events.push({ kind: "rejected", symbol: o.symbol, side: o.side, qty: o.qty, reason: r.reason });
    }
  }

  // Intraday positions are closed at the market price at square-off time (or on the next visit after it).
  for (const p of pos ?? []) {
    if (p.product !== "intraday") continue;
    const opened = ist(new Date(p.opened_at).getTime()).date;
    if (!(nowIst.time >= settings.squareOffAt || opened < nowIst.date)) continue;
    const q = qmap.get(p.symbol);
    if (!q) continue;
    const { data: so, error } = await admin
      .from("sim_orders")
      .insert({ account_id: acc.id, user_id: user, client_id: `sqoff-${p.symbol}-${opened}-${p.qty}`.slice(0, 64), symbol: p.symbol, exchange: p.exchange, name: p.name, side: "sell", product: "intraday", order_type: "market", qty: p.qty, ref_price: q.price, status: "open", source: "auto", reason: "Intraday square-off" })
      .select()
      .single();
    if (error || !so) continue; // already being squared off by another request
    const r = await execute(so, q, settings, "market");
    if (r?.ok) events.push({ kind: "squared_off", symbol: p.symbol, side: "sell", qty: p.qty, price: r.price });
  }

  // Today's snapshot (for the value-over-time chart and drawdown).
  const { data: acc2 } = await admin.from("sim_accounts").select("cash,realized_pnl").eq("id", acc.id).single();
  const { data: pos2 } = await admin.from("sim_positions").select("symbol,qty,avg_price").eq("account_id", acc.id).gt("qty", 0);
  const holdings = (pos2 ?? []).reduce((s, p) => s + p.qty * (qmap.get(p.symbol)?.price ?? Number(p.avg_price)), 0);
  if (acc2) {
    await admin.from("sim_snapshots").upsert({
      account_id: acc.id, user_id: user, date: nowIst.date, cash: acc2.cash, holdings_value: Math.round(holdings * 100) / 100,
      equity: Math.round((Number(acc2.cash) + holdings) * 100) / 100, realized_pnl: acc2.realized_pnl,
    });
  }
  return json({ events, quotes: qs });
}

// ============================================================ handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: who } = await admin.auth.getUser(token);
  const user = who?.user?.id;
  let b: any;
  try {
    b = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const action = String(b?.action ?? "");
  try {
    // Market data: not personal, so any valid project key may read it (it's cached and rate-limited by the cache).
    if (action === "quotes") return json({ ...(await quotes(Array.isArray(b.symbols) ? b.symbols.map(String) : [])), serverTime: new Date().toISOString(), status: marketStatus(Date.now()) });
    if (action === "chart") {
      const sym = String(b.symbol ?? "");
      const tf = String(b.tf ?? "1d");
      if (!SYMBOL.test(sym) || !TF[tf]) return json({ error: "bad request" }, 400);
      return json(await cached(`c:${sym}:${tf}`, TF[tf].ttl, () => providerChart(sym, tf)));
    }
    if (action === "search") {
      const q = String(b.q ?? "").trim().slice(0, 60);
      if (q.length < 2) return json({ results: [] });
      return json(await cached(`s:${q.toLowerCase()}`, 86400, async () => ({ results: await providerSearch(q) })));
    }

    // Your simulation: signed-in users only, and only ever their own.
    if (!user) return json({ error: "Sign in to use the simulator." }, 401);
    if (action === "start" || action === "reset") {
      const cap = Number(b.capital ?? 100000);
      if (!Number.isFinite(cap) || cap < 1000 || cap > 1e10) return json({ error: "Starting capital must be between ₹1,000 and ₹1,000 crore." }, 400);
      if (action === "start" && (await activeAccount(user))) return json({ error: "You already have a simulation." }, 400);
      const prev = await activeAccount(user);
      const { data, error } = await admin.rpc("sim_reset", { p_user: user, p_capital: cap, p_settings: prev?.settings ?? {} });
      if (error) throw new Error(error.message);
      return json({ account_id: data });
    }
    if (action === "settings") {
      const acc = await activeAccount(user);
      if (!acc) return json({ error: "Start a simulation first." }, 400);
      const s = readSettings({ ...readSettings(acc.settings), ...(b.settings ?? {}) });
      await admin.from("sim_accounts").update({ settings: s }).eq("id", acc.id);
      return json({ settings: s });
    }
    if (action === "place") return await place(user, b);
    if (action === "cancel") {
      const acc = await activeAccount(user);
      if (!acc) return json({ error: "No simulation" }, 400);
      const { data } = await admin.from("sim_orders").update({ status: "cancelled", reason: "Cancelled by you", updated_at: new Date().toISOString() }).eq("id", String(b.order_id)).eq("account_id", acc.id).eq("status", "open").select().maybeSingle();
      return data ? json({ order: data }) : json({ error: "That order is no longer open." }, 409);
    }
    if (action === "sync") return await sync(user);
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

export { DEFAULT_SETTINGS };
export type { Product, Side };
