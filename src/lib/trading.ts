// Trade journal and IPO maths: profit per trade, win rate, day-by-day P&L, listing gains, and reading broker
// exports (Zerodha / Groww / Upstox tradebooks and P&L sheets) into round trips. Nothing here is stored.

import { addDays, diffDays } from "./dates";
import type { Investment, IpoApplication, Trade, TradeSegment, Transaction } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export const SEGMENT_LABEL: Record<TradeSegment, string> = { intraday: "Intraday", swing: "Swing", delivery: "Delivery", fno: "F&O", other: "Other" };

export const isOpen = (t: Trade) => t.exit_price == null || !t.exit_date;

/** Money put to work on entry. */
export const tradeValue = (t: Trade) => t.entry_price * t.quantity;

/** Profit after charges, or null while the trade is still open. */
export function tradePnl(t: Trade): number | null {
  if (isOpen(t)) return null;
  const gross = (t.exit_price! - t.entry_price) * t.quantity * (t.side === "short" ? -1 : 1);
  return r2(gross - (t.charges || 0));
}

/** Profit as a % of the money put to work. */
export function tradePct(t: Trade): number | null {
  const p = tradePnl(t);
  const v = tradeValue(t);
  return p == null || v <= 0 ? null : (p / v) * 100;
}

/** The day a trade's profit counts on: the day it was closed. */
export const tradeDay = (t: Trade) => t.exit_date || t.entry_date;

export interface TradeStats {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  net: number;
  charges: number;
  avgWin: number;
  avgLoss: number;
  /** Total won ÷ total lost (Infinity with no losses). */
  profitFactor: number;
  best: Trade | null;
  worst: Trade | null;
  /** Average profit per trade. */
  expectancy: number;
}

export function tradeStats(trades: Trade[]): TradeStats {
  const closed = trades.filter((t) => !isOpen(t));
  let won = 0;
  let lost = 0;
  let wins = 0;
  let losses = 0;
  let best: Trade | null = null;
  let worst: Trade | null = null;
  for (const t of closed) {
    const p = tradePnl(t)!;
    if (p > 0) (wins++, (won += p));
    else if (p < 0) (losses++, (lost += -p));
    if (!best || p > tradePnl(best)!) best = t;
    if (!worst || p < tradePnl(worst)!) worst = t;
  }
  const net = r2(won - lost);
  return {
    count: closed.length,
    wins,
    losses,
    winRate: closed.length ? wins / closed.length : 0,
    net,
    charges: r2(closed.reduce((s, t) => s + (t.charges || 0), 0)),
    avgWin: wins ? r2(won / wins) : 0,
    avgLoss: losses ? r2(lost / losses) : 0,
    profitFactor: lost > 0 ? won / lost : won > 0 ? Infinity : 0,
    best,
    worst,
    expectancy: closed.length ? r2(net / closed.length) : 0,
  };
}

export interface DayPnl {
  day: string;
  pnl: number;
  trades: number;
}

/** Profit per day (closed trades only), oldest first. */
export function pnlByDay(trades: Trade[]): DayPnl[] {
  const m = new Map<string, DayPnl>();
  for (const t of trades) {
    const p = tradePnl(t);
    if (p == null) continue;
    const d = tradeDay(t);
    const cur = m.get(d) ?? { day: d, pnl: 0, trades: 0 };
    cur.pnl = r2(cur.pnl + p);
    cur.trades++;
    m.set(d, cur);
  }
  return [...m.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** Longest and current run of green / red days. */
export function dayStreaks(days: DayPnl[]): { current: number; currentGreen: boolean; bestGreen: number; worstRed: number } {
  let bestGreen = 0;
  let worstRed = 0;
  let run = 0;
  let green = true;
  for (const d of days) {
    if (d.pnl === 0) continue;
    const g = d.pnl > 0;
    run = g === green ? run + 1 : 1;
    green = g;
    if (g) bestGreen = Math.max(bestGreen, run);
    else worstRed = Math.max(worstRed, run);
  }
  return { current: run, currentGreen: green, bestGreen, worstRed };
}

// ---------------------------------------------------------------------------
// IPOs
// ---------------------------------------------------------------------------

export const IPO_STATUS_LABEL: Record<IpoApplication["status"], string> = {
  applied: "Applied",
  allotted: "Allotted",
  not_allotted: "Not allotted",
  listed: "Listed",
  sold: "Sold",
  withdrawn: "Withdrawn",
};

/** Money blocked for the bid. */
export const ipoApplied = (i: IpoApplication) => r2(i.price * i.lot_size * i.lots);
/** Money that actually bought shares. */
export const ipoInvested = (i: IpoApplication) => r2(i.price * i.allotted_shares);

/** Gain on listing day (at the listing price), or null before listing. */
export function ipoListingGain(i: IpoApplication): number | null {
  if (i.listing_price == null || !i.allotted_shares) return null;
  return r2((i.listing_price - i.price) * i.allotted_shares);
}
export function ipoListingPct(i: IpoApplication): number | null {
  return i.listing_price == null || i.price <= 0 ? null : ((i.listing_price - i.price) / i.price) * 100;
}

/** Profit booked when sold, or null while still held. */
export function ipoRealised(i: IpoApplication): number | null {
  if (i.status !== "sold" || i.sold_price == null) return null;
  return r2((i.sold_price - i.price) * i.allotted_shares);
}

/** Booked profit if sold, else the listing gain. */
export const ipoGain = (i: IpoApplication) => ipoRealised(i) ?? ipoListingGain(i);

export function ipoStats(list: IpoApplication[]) {
  const decided = list.filter((i) => i.status !== "applied" && i.status !== "withdrawn");
  const got = decided.filter((i) => i.allotted_shares > 0 || ["allotted", "listed", "sold"].includes(i.status));
  return {
    applied: list.length,
    decided: decided.length,
    allotted: got.length,
    allotmentRate: decided.length ? got.length / decided.length : 0,
    pending: list.filter((i) => i.status === "applied"),
    blocked: r2(list.filter((i) => i.status === "applied").reduce((s, i) => s + ipoApplied(i), 0)),
    gains: r2(got.reduce((s, i) => s + (ipoGain(i) ?? 0), 0)),
    booked: r2(got.reduce((s, i) => s + (ipoRealised(i) ?? 0), 0)),
  };
}

// ---------------------------------------------------------------------------
// Holdings: long term vs short term
// ---------------------------------------------------------------------------

/** When you first bought it: the investment's start date, else its first recorded purchase. */
export function boughtOn(i: Investment, txs: Transaction[]): string | null {
  const first = txs.filter((t) => t.investment_id === i.id && t.type === "invest_buy").reduce<string | null>((m, t) => (!m || t.date < m ? t.date : m), null);
  return i.start_date || first;
}

/** Long term once held over a year (as Indian capital-gains tax counts it for shares and equity funds). */
export function holdingTerm(since: string | null, today: string): "long" | "short" | "unknown" {
  if (!since) return "unknown";
  return diffDays(since, today) > 365 ? "long" : "short";
}

/** Days until a short-term holding turns long term. */
export const daysToLongTerm = (since: string, today: string) => Math.max(0, diffDays(today, addDays(since, 366)));

// ---------------------------------------------------------------------------
// Reading broker exports
// ---------------------------------------------------------------------------

/** Splits CSV text into rows (quoted fields, commas or tabs). */
export function parseCsv(text: string): string[][] {
  const delim = (text.split("\n")[0].match(/\t/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"', i++);
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) (row.push(cell.trim()), (cell = ""));
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((x) => x)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell.trim());
  if (row.some((x) => x)) rows.push(row);
  return rows;
}

const num = (s: string | undefined) => {
  if (s == null) return NaN;
  const v = parseFloat(s.replace(/[₹,\s]/g, ""));
  return v;
};

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** 2026-10-03, 03-10-2026, 03/10/2026, 3 Oct 2026, 2026-10-03T09:21:00 → 2026-10-03. */
export function toISODate(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  return null;
}

type Draft = Omit<Trade, "id">;

const segmentFor = (entry: string, exit: string | null, hint?: string): TradeSegment => {
  if (hint && /fo|f&o|nfo|fut|opt|deriv/i.test(hint)) return "fno";
  if (!exit) return "delivery";
  if (entry === exit) return "intraday";
  return diffDays(entry, exit) <= 60 ? "swing" : "delivery";
};

/** Folds partial fills of the same trade (symbol, side, days) into one row with average prices. */
function merge(list: Draft[]): Draft[] {
  const m = new Map<string, Draft>();
  for (const t of list) {
    const k = [t.symbol, t.side, t.entry_date, t.exit_date ?? "", t.segment].join("|");
    const cur = m.get(k);
    if (!cur) {
      m.set(k, { ...t });
      continue;
    }
    const q = cur.quantity + t.quantity;
    cur.entry_price = r2((cur.entry_price * cur.quantity + t.entry_price * t.quantity) / q);
    if (cur.exit_price != null && t.exit_price != null) cur.exit_price = r2((cur.exit_price * cur.quantity + t.exit_price * t.quantity) / q);
    cur.charges = r2(cur.charges + t.charges);
    cur.quantity = q;
  }
  return [...m.values()];
}

export interface TradeImport {
  trades: Draft[];
  format: "tradebook" | "pnl";
  skipped: number;
}

/**
 * Reads a broker export. Two shapes are understood:
 *  - a tradebook (one row per buy or sell: date, symbol, buy/sell, quantity, price) — buys and sells are matched
 *    first-in-first-out into round trips; same-day round trips are intraday; what's left unmatched is an open trade;
 *  - a P&L sheet (one row per closed trade: symbol, quantity, buy price/value, sell price/value, dates).
 */
export function importTrades(text: string, broker?: string): TradeImport {
  const rows = parseCsv(text);
  // The header is the first row that names a symbol and a quantity (exports often start with a title block).
  const hi = rows.findIndex((r) => r.some((c) => /symbol|scrip|stock|instrument|name/i.test(c)) && r.some((c) => /qty|quantity/i.test(c)));
  if (hi < 0) throw new Error("Couldn't find the header row (it needs Symbol and Quantity columns).");
  const head = rows[hi].map((h) => h.toLowerCase().replace(/[^a-z&/ ]/g, " ").replace(/\s+/g, " ").trim());
  const col = (...res: RegExp[]) => {
    for (const re of res) {
      const i = head.findIndex((h) => re.test(h));
      if (i >= 0) return i;
    }
    return -1;
  };
  const cSym = col(/^symbol$/, /^tradingsymbol$/, /symbol/, /scrip/, /instrument/, /stock name/, /^name$/);
  const cQty = col(/^qty$/, /^quantity$/, /qty|quantity/);
  const cSide = col(/^trade type$/, /^type$/, /^side$/, /buy ?\/ ?sell/, /transaction type/, /trade type/);
  const cPrice = col(/^price$/, /^trade price$/, /^avg price$/, /average price/);
  const cDate = col(/^trade date$/, /^date$/, /order execution time/, /trade date|date/);
  const cSeg = col(/^segment$/, /^exchange$/, /segment/);
  const cBuyP = col(/^buy price$/, /avg buy price|buy average|buy avg/, /buy price/);
  const cSellP = col(/^sell price$/, /avg sell price|sell average|sell avg/, /sell price/);
  const cBuyV = col(/^buy value$/, /buy value/);
  const cSellV = col(/^sell value$/, /sell value/);
  const cBuyD = col(/^buy date$/, /buy date/);
  const cSellD = col(/^sell date$/, /sell date/);
  const cChg = col(/charges|brokerage/);
  const body = rows.slice(hi + 1).filter((r) => r.length >= head.length - 2 && r[cSym]);
  const base = { exchange: null, broker: broker ?? null, strategy: null, notes: "Imported", tags: [] as string[], name: null };
  let skipped = 0;

  if (cSide >= 0 && cPrice >= 0) {
    type Fill = { date: string; qty: number; price: number; seg?: string; order: number };
    const by = new Map<string, Fill[]>();
    body.forEach((r, order) => {
      const sym = r[cSym].toUpperCase().replace(/-EQ$|-BE$/, "");
      const side = r[cSide].toLowerCase();
      const qty = Math.abs(num(r[cQty]));
      const price = num(r[cPrice]);
      const date = toISODate(r[cDate]);
      if (!sym || !date || !(qty > 0) || !(price >= 0) || !/^(b|s)/.test(side)) return void skipped++;
      const list = by.get(sym) ?? [];
      list.push({ date, qty: side.startsWith("b") ? qty : -qty, price, seg: cSeg >= 0 ? r[cSeg] : undefined, order });
      by.set(sym, list);
    });
    const out: Draft[] = [];
    for (const [symbol, fills] of by) {
      fills.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order));
      // Open lots, oldest first; positive = long, negative = short.
      const lots: { date: string; qty: number; price: number; seg?: string }[] = [];
      for (const f of fills) {
        let q = f.qty;
        while (q !== 0 && lots.length && Math.sign(lots[0].qty) !== Math.sign(q)) {
          const lot = lots[0];
          const take = Math.min(Math.abs(q), Math.abs(lot.qty));
          const long = lot.qty > 0;
          out.push({
            ...base, symbol, segment: segmentFor(lot.date, f.date, lot.seg ?? f.seg), side: long ? "long" : "short", quantity: take,
            entry_date: lot.date, entry_price: lot.price, exit_date: f.date, exit_price: f.price, charges: 0,
          });
          lot.qty += long ? -take : take;
          q += long ? take : -take;
          if (lot.qty === 0) lots.shift();
        }
        if (q !== 0) lots.push({ date: f.date, qty: q, price: f.price, seg: f.seg });
      }
      for (const lot of lots)
        out.push({ ...base, symbol, segment: segmentFor(lot.date, null, lot.seg), side: lot.qty > 0 ? "long" : "short", quantity: Math.abs(lot.qty), entry_date: lot.date, entry_price: lot.price, exit_date: null, exit_price: null, charges: 0 });
    }
    return { trades: merge(out), format: "tradebook", skipped };
  }

  if ((cBuyP >= 0 || cBuyV >= 0) && (cSellP >= 0 || cSellV >= 0)) {
    const out: Draft[] = [];
    for (const r of body) {
      const symbol = r[cSym].toUpperCase().replace(/-EQ$|-BE$/, "");
      const qty = Math.abs(num(r[cQty]));
      const buy = cBuyP >= 0 ? num(r[cBuyP]) : num(r[cBuyV]) / qty;
      const sell = cSellP >= 0 ? num(r[cSellP]) : num(r[cSellV]) / qty;
      const bd = toISODate(cBuyD >= 0 ? r[cBuyD] : r[cDate]);
      const sd = toISODate(cSellD >= 0 ? r[cSellD] : r[cDate]) ?? bd;
      if (!symbol || !(qty > 0) || !Number.isFinite(buy) || !bd) {
        skipped++;
        continue;
      }
      const closed = Number.isFinite(sell) && sell > 0;
      out.push({
        ...base, symbol, segment: segmentFor(bd, closed ? sd : null, cSeg >= 0 ? r[cSeg] : undefined), side: "long", quantity: qty,
        entry_date: bd, entry_price: r2(buy), exit_date: closed ? sd : null, exit_price: closed ? r2(sell) : null, charges: cChg >= 0 ? Math.max(0, num(r[cChg]) || 0) : 0,
      });
    }
    return { trades: merge(out), format: "pnl", skipped };
  }
  throw new Error("This file has no Buy/Sell column and no buy and sell prices, so the trades can't be read.");
}

/** Same trade already in the journal (so importing the same file twice adds nothing). */
export function sameTrade(a: Pick<Trade, "symbol" | "side" | "quantity" | "entry_date" | "entry_price" | "exit_date">, b: typeof a) {
  return a.symbol === b.symbol && a.side === b.side && a.entry_date === b.entry_date && (a.exit_date ?? null) === (b.exit_date ?? null) && Math.abs(a.quantity - b.quantity) < 1e-6 && Math.abs(a.entry_price - b.entry_price) < 0.01;
}
