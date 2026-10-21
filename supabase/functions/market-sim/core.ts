// Market Simulator — the rules, in one place. Pure TypeScript (no Deno or browser APIs), used by the
// `market-sim` Edge Function to execute orders and by the app (src/lib/sim) to preview them, so the
// preview and the fill always agree. Covered by src/lib/sim/core.test.ts.
//
// This is a PAPER-TRADING simulator. Nothing here places a real order or moves real money.

export type Side = "buy" | "sell";
export type Product = "delivery" | "intraday";
export type OrderType = "market" | "limit";
export type MarketStatus = "open" | "pre_open" | "closed";

// ------------------------------------------------------------------ settings

/**
 * Simulated charges, as fractions of trade value unless noted. Defaults are estimates modelled on a
 * typical Indian discount broker for NSE equity (rates as of 2024-10-01); they are NOT what any broker
 * will actually charge you. Every rate can be changed in the simulator's settings.
 */
export interface ChargeRates {
  /** From this date (YYYY-MM-DD). Shown in settings so it's clear which rates apply. */
  effective: string;
  /** Brokerage per order: fraction of value, capped at `brokerageCap` rupees. Delivery is often free. */
  brokerageDelivery: number;
  brokerageIntraday: number;
  brokerageCap: number;
  /** Securities transaction tax: delivery on buy and sell, intraday on sell only. */
  sttDelivery: number;
  sttIntradaySell: number;
  /** NSE transaction charge. */
  exchange: number;
  /** SEBI turnover fee (₹10 per crore = 0.000001). */
  sebi: number;
  /** GST on brokerage + exchange + SEBI fees. */
  gst: number;
  /** Stamp duty, buy side only. */
  stampDelivery: number;
  stampIntraday: number;
}

export const DEFAULT_RATES: ChargeRates = {
  effective: "2024-10-01",
  brokerageDelivery: 0,
  brokerageIntraday: 0.0003,
  brokerageCap: 20,
  sttDelivery: 0.001,
  sttIntradaySell: 0.00025,
  exchange: 0.0000297,
  sebi: 0.000001,
  gst: 0.18,
  stampDelivery: 0.00015,
  stampIntraday: 0.00003,
};

export interface SimSettings {
  /** Market orders fill this much worse than the quote (basis points; 5 = 0.05%). */
  slippageBps: number;
  chargesOn: boolean;
  rates: ChargeRates;
  defaultOrderType: OrderType;
  defaultProduct: Product;
  /** Largest value (₹) one order may be. null = no limit. */
  maxOrderValue: number | null;
  /** Most different stocks held at once. null = no limit. */
  maxOpenPositions: number | null;
  /** Stop new buys for the day once today's loss reaches this (₹). null = off. */
  dailyLossLimit: number | null;
  /** Intraday positions are closed at the market price after this time (IST, "HH:MM"). */
  squareOffAt: string;
  /** How often the screen asks for new prices while the market is open (seconds). */
  refreshSeconds: number;
  /** Show a note when an order fills or a limit triggers. */
  notify: boolean;
}

export const DEFAULT_SETTINGS: SimSettings = {
  slippageBps: 5,
  chargesOn: true,
  rates: DEFAULT_RATES,
  defaultOrderType: "market",
  defaultProduct: "delivery",
  maxOrderValue: null,
  maxOpenPositions: null,
  dailyLossLimit: null,
  squareOffAt: "15:20",
  refreshSeconds: 30,
  notify: true,
};

/** Settings saved on the account, merged over the defaults and clamped to sane values. */
export function readSettings(raw: unknown): SimSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SimSettings>;
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const opt = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(hi, Math.max(lo, v)) : null);
  const rates = { ...DEFAULT_RATES };
  const rr = (r.rates ?? {}) as Partial<ChargeRates>;
  for (const k of Object.keys(DEFAULT_RATES) as (keyof ChargeRates)[]) {
    if (k === "effective") rates.effective = typeof rr.effective === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rr.effective) ? rr.effective : DEFAULT_RATES.effective;
    else (rates as Record<string, number | string>)[k] = num(rr[k], DEFAULT_RATES[k] as number, 0, k === "brokerageCap" ? 1000 : 0.5);
  }
  return {
    slippageBps: num(r.slippageBps, DEFAULT_SETTINGS.slippageBps, 0, 200),
    chargesOn: typeof r.chargesOn === "boolean" ? r.chargesOn : true,
    rates,
    defaultOrderType: r.defaultOrderType === "limit" ? "limit" : "market",
    defaultProduct: r.defaultProduct === "intraday" ? "intraday" : "delivery",
    maxOrderValue: opt(r.maxOrderValue, 1, 1e12),
    maxOpenPositions: opt(r.maxOpenPositions, 1, 500),
    dailyLossLimit: opt(r.dailyLossLimit, 1, 1e12),
    squareOffAt: typeof r.squareOffAt === "string" && /^(09|1[0-5]):[0-5]\d$/.test(r.squareOffAt) && r.squareOffAt <= "15:29" && r.squareOffAt >= "09:16" ? r.squareOffAt : DEFAULT_SETTINGS.squareOffAt,
    refreshSeconds: num(r.refreshSeconds, DEFAULT_SETTINGS.refreshSeconds, 15, 300),
    notify: typeof r.notify === "boolean" ? r.notify : true,
  };
}

// ------------------------------------------------------------------ money

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface ChargeBreakdown {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  gst: number;
  stamp: number;
  total: number;
}

export function charges(side: Side, product: Product, value: number, s: Pick<SimSettings, "chargesOn" | "rates">): ChargeBreakdown {
  if (!s.chargesOn || value <= 0) return { brokerage: 0, stt: 0, exchange: 0, sebi: 0, gst: 0, stamp: 0, total: 0 };
  const R = s.rates;
  const brokerage = r2(Math.min(R.brokerageCap, value * (product === "delivery" ? R.brokerageDelivery : R.brokerageIntraday)));
  const stt = r2(product === "delivery" ? value * R.sttDelivery : side === "sell" ? value * R.sttIntradaySell : 0);
  const exchange = r2(value * R.exchange);
  const sebi = r2(value * R.sebi);
  const gst = r2((brokerage + exchange + sebi) * R.gst);
  const stamp = r2(side === "buy" ? value * (product === "delivery" ? R.stampDelivery : R.stampIntraday) : 0);
  return { brokerage, stt, exchange, sebi, gst, stamp, total: r2(brokerage + stt + exchange + sebi + gst + stamp) };
}

/** NSE prices move in 5-paise steps. */
export const tick = (p: number) => Math.round(p * 20) / 20;

/**
 * The simulated fill price. Market orders: the quote moved against you by the slippage. Limit orders:
 * the quote if it's at least as good as your limit (you get the better price), never worse than the limit.
 */
export function fillPrice(side: Side, type: OrderType, quote: number, limit: number | null, slippageBps: number): number {
  if (type === "limit" && limit != null) return tick(side === "buy" ? Math.min(limit, quote) : Math.max(limit, quote));
  const slip = quote * (slippageBps / 10000);
  return tick(side === "buy" ? quote + slip : Math.max(0.05, quote - slip));
}

/** Has a pending limit order's price been reached by the latest quote? (Only the quote is used — see README.) */
export function limitReached(side: Side, limit: number, quote: number): boolean {
  return side === "buy" ? quote <= limit : quote >= limit;
}

// ------------------------------------------------------------------ market hours (NSE, IST)

const IST_MS = 5.5 * 3600_000;

/** Date and time in India for a moment: { date: "YYYY-MM-DD", time: "HH:MM", weekday: 0–6 }. */
export function ist(ms: number): { date: string; time: string; weekday: number } {
  const d = new Date(ms + IST_MS);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16), weekday: d.getUTCDay() };
}

/**
 * Open / pre-open / closed, from the exchange's own session times when the data has them (that's how
 * holidays are caught), else from the regular NSE timetable (Mon–Fri, pre-open 09:00–09:15, open 09:15–15:30).
 */
export function marketStatus(now: number, session?: { start: number; end: number } | null): MarketStatus {
  const t = ist(now);
  if (session && session.start > 0 && session.end > session.start) {
    if (now >= session.start * 1000 && now < session.end * 1000) return "open";
    const sd = ist(session.start * 1000);
    if (sd.date === t.date && t.time >= "09:00" && now < session.start * 1000) return "pre_open";
    return "closed";
  }
  if (t.weekday === 0 || t.weekday === 6) return "closed";
  if (t.time >= "09:15" && t.time < "15:30") return "open";
  if (t.time >= "09:00" && t.time < "09:15") return "pre_open";
  return "closed";
}

// ------------------------------------------------------------------ order checks

export interface OrderRequest {
  symbol: string;
  side: Side;
  product: Product;
  type: OrderType;
  qty: number;
  limit?: number | null;
}

export interface AccountState {
  cash: number;
  /** Quantity held per "SYMBOL|product". */
  held: Record<string, number>;
  /** Quantity already promised to open sell orders per "SYMBOL|product". */
  reservedSell: Record<string, number>;
  openPositions: number;
  /** Today's P&L so far (realized + unrealized), for the daily loss limit. */
  todayPnl: number;
}

/** Checks done before an order is accepted. Returns a reason to reject it, or null when it's fine. */
export function checkOrder(o: OrderRequest, quote: number, status: MarketStatus, a: AccountState, s: SimSettings, nowIst: string): string | null {
  if (!/^[A-Z0-9&.^-]{1,25}$/.test(o.symbol)) return "Unknown stock symbol.";
  if (!Number.isInteger(o.qty) || o.qty <= 0) return "Quantity must be a whole number above 0.";
  if (o.qty > 1_000_000) return "Quantity is too large for the simulator.";
  if (o.type === "limit" && (o.limit == null || !Number.isFinite(o.limit) || o.limit <= 0)) return "Enter a limit price above 0.";
  if (o.type === "limit" && o.limit != null && quote > 0 && Math.abs(o.limit - quote) / quote > 0.2) return "Limit price is more than 20% away from the market price.";
  if (!(quote > 0)) return "No market price for this stock right now.";
  if (o.type === "market" && status !== "open") return "The market is closed. Place a limit order — it's checked when the market opens.";
  if (o.product === "intraday" && status !== "open") return "Intraday orders can only be placed while the market is open.";
  if (o.product === "intraday" && nowIst >= s.squareOffAt) return `Intraday orders stop at ${s.squareOffAt} (positions are squared off then).`;
  const price = o.type === "limit" ? o.limit! : fillPrice(o.side, "market", quote, null, s.slippageBps);
  const value = price * o.qty;
  if (s.maxOrderValue != null && value > s.maxOrderValue) return `Order value is above your limit of ₹${s.maxOrderValue.toLocaleString("en-IN")} per order.`;
  const key = `${o.symbol}|${o.product}`;
  if (o.side === "buy") {
    const cost = value + charges("buy", o.product, value, s).total;
    if (cost > a.cash + 1e-6) return "Not enough virtual cash.";
    if (s.maxOpenPositions != null && !a.held[key] && a.openPositions >= s.maxOpenPositions) return `You already hold ${a.openPositions} stocks — your limit is ${s.maxOpenPositions}.`;
    if (s.dailyLossLimit != null && a.todayPnl <= -s.dailyLossLimit) return "Today's loss limit is reached — no new buys until tomorrow.";
  } else {
    const free = (a.held[key] ?? 0) - (a.reservedSell[key] ?? 0);
    if (o.qty > free) return free > 0 ? `You can sell up to ${free} (${o.product === "intraday" ? "intraday" : "delivery"}).` : `You don't hold ${o.symbol} as ${o.product === "intraday" ? "intraday" : "delivery"}.`;
  }
  return null;
}

// ------------------------------------------------------------------ positions (mirrors the SQL in sim_fill)

export interface Position {
  qty: number;
  avg: number;
  /** Buy charges not yet set against a sale. */
  buyCharges: number;
  realized: number;
}

/** Apply one fill to a position — the same arithmetic the database does, kept here for tests and previews. */
export function applyFill(p: Position, side: Side, qty: number, price: number, fee: number): { pos: Position; realized: number } {
  if (side === "buy") {
    const q = p.qty + qty;
    return { pos: { qty: q, avg: (p.avg * p.qty + price * qty) / q, buyCharges: p.buyCharges + fee, realized: p.realized }, realized: 0 };
  }
  const alloc = p.qty > 0 ? p.buyCharges * (qty / p.qty) : 0;
  const realized = r2((price - p.avg) * qty - fee - alloc);
  const q = p.qty - qty;
  return { pos: { qty: q, avg: q > 0 ? p.avg : 0, buyCharges: p.buyCharges - alloc, realized: r2(p.realized + realized) }, realized };
}

/** Unrealized P&L of a position at a price, after the buy charges already paid. */
export const unrealized = (p: Position, ltp: number) => r2((ltp - p.avg) * p.qty - p.buyCharges);
