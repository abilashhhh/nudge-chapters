"use client";

/**
 * Paper trading in the app: reads your simulator rows (read-only, protected by row-level security) and
 * asks the `market-sim` Edge Function for market data and for every order. The app never sends a price
 * and never changes a balance itself.
 */
import { create } from "zustand";
import { getSupabase } from "@/lib/data/supabase";
import type { SimFill, SimSnapshot } from "./analytics";
import { readSettings, type MarketStatus, type OrderType, type Product, type Side, type SimSettings } from "./core";

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
  time: string;
  status: MarketStatus;
  cachedAt?: string;
  stale?: boolean;
}

export interface SimAccount {
  id: string;
  initial_capital: number;
  cash: number;
  realized_pnl: number;
  charges_paid: number;
  settings: SimSettings;
  created_at: string;
}

export interface SimOrder {
  id: string;
  client_id: string;
  symbol: string;
  name: string | null;
  exchange: string;
  side: Side;
  product: Product;
  order_type: OrderType;
  qty: number;
  limit_price: number | null;
  ref_price: number | null;
  status: "open" | "filled" | "rejected" | "cancelled" | "expired";
  reason: string | null;
  filled_qty: number;
  avg_fill_price: number | null;
  source: "user" | "auto";
  created_at: string;
  updated_at: string;
}

export interface SimPosition {
  symbol: string;
  product: Product;
  name: string | null;
  exchange: string;
  qty: number;
  avg_price: number;
  buy_charges: number;
  realized_pnl: number;
  charges: number;
  opened_at: string;
}

export interface WatchItem {
  symbol: string;
  name: string | null;
  exchange: string;
  position: number;
}

export type Candle = [time: number, o: number, h: number, l: number, c: number, v: number];

export async function simCall<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke<T & { error?: string }>("market-sim", { body: { action, ...body } });
  if (error) {
    // The function's own message (e.g. "Not enough virtual cash") is in the response body.
    let msg = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") msg = ((await ctx.json()) as { error?: string }).error ?? msg;
    } catch {
      /* keep the generic message */
    }
    throw new Error(msg);
  }
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
  return data as T;
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

interface SimState {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  account: SimAccount | null;
  positions: SimPosition[];
  orders: SimOrder[];
  fills: SimFill[];
  snapshots: SimSnapshot[];
  watchlist: WatchItem[];
  quotes: Record<string, Quote>;
  /** When the screen last got prices back (ms) and whether that failed. */
  quotesAt: number | null;
  quotesError: string | null;
  load: () => Promise<void>;
  refreshQuotes: (symbols: string[]) => Promise<void>;
  sync: () => Promise<{ kind: string; symbol: string; side?: string; qty?: number; price?: number; reason?: string }[]>;
}

export const useSim = create<SimState>((set, get) => ({
  status: "idle",
  error: null,
  account: null,
  positions: [],
  orders: [],
  fills: [],
  snapshots: [],
  watchlist: [],
  quotes: {},
  quotesAt: null,
  quotesError: null,

  async load() {
    if (get().status === "idle") set({ status: "loading" });
    try {
      const sb = getSupabase();
      const { data: acc, error } = await sb.from("sim_accounts").select("*").eq("status", "active").maybeSingle();
      if (error) throw error;
      const { data: wl } = await sb.from("sim_watchlist").select("symbol,name,exchange,position").order("position").order("created_at");
      if (!acc) {
        set({ status: "ready", error: null, account: null, positions: [], orders: [], fills: [], snapshots: [], watchlist: (wl ?? []) as WatchItem[] });
        return;
      }
      const [pos, ord, fil, snap] = await Promise.all([
        sb.from("sim_positions").select("*").eq("account_id", acc.id),
        sb.from("sim_orders").select("*").eq("account_id", acc.id).order("created_at", { ascending: false }).limit(500),
        sb.from("sim_fills").select("*").eq("account_id", acc.id).order("executed_at", { ascending: false }).limit(2000),
        sb.from("sim_snapshots").select("date,cash,holdings_value,equity,realized_pnl").eq("account_id", acc.id).order("date"),
      ]);
      set({
        status: "ready",
        error: null,
        account: { ...acc, initial_capital: num(acc.initial_capital), cash: num(acc.cash), realized_pnl: num(acc.realized_pnl), charges_paid: num(acc.charges_paid), settings: readSettings(acc.settings) },
        positions: (pos.data ?? []).map((p) => ({ ...p, qty: num(p.qty), avg_price: num(p.avg_price), buy_charges: num(p.buy_charges), realized_pnl: num(p.realized_pnl), charges: num(p.charges) })),
        orders: (ord.data ?? []).map((o) => ({ ...o, qty: num(o.qty), limit_price: o.limit_price == null ? null : num(o.limit_price), ref_price: o.ref_price == null ? null : num(o.ref_price), avg_fill_price: o.avg_fill_price == null ? null : num(o.avg_fill_price) })),
        fills: (fil.data ?? []).map((f) => ({ ...f, qty: num(f.qty), ref_price: num(f.ref_price), price: num(f.price), value: num(f.value), charges: num(f.charges), realized_pnl: f.realized_pnl == null ? null : num(f.realized_pnl) })),
        snapshots: (snap.data ?? []).map((s) => ({ date: s.date, cash: num(s.cash), holdings_value: num(s.holdings_value), equity: num(s.equity), realized_pnl: num(s.realized_pnl) })),
        watchlist: (wl ?? []) as WatchItem[],
      });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  async refreshQuotes(symbols) {
    const list = [...new Set(symbols)].filter(Boolean);
    if (!list.length) return;
    try {
      const r = await simCall<{ quotes: Quote[]; errors: Record<string, string> }>("quotes", { symbols: list });
      const next = { ...get().quotes };
      for (const q of r.quotes) next[q.symbol] = q;
      set({ quotes: next, quotesAt: Date.now(), quotesError: null });
    } catch (e) {
      set({ quotesError: e instanceof Error ? e.message : "Couldn't get prices" });
    }
  },

  async sync() {
    if (!get().account) return [];
    const r = await simCall<{ events: { kind: string; symbol: string }[]; quotes?: Quote[] }>("sync");
    if (r.quotes?.length) {
      const next = { ...get().quotes };
      for (const q of r.quotes) next[q.symbol] = q;
      set({ quotes: next, quotesAt: Date.now() });
    }
    if (r.events.length) await get().load();
    return r.events;
  },
}));

export function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function addToWatchlist(symbol: string, name: string | null) {
  const sb = getSupabase();
  const { watchlist } = useSim.getState();
  if (watchlist.some((w) => w.symbol === symbol)) return;
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from("sim_watchlist").insert({ user_id: u.user?.id, symbol, name, exchange: symbol.endsWith(".BO") ? "BSE" : "NSE", position: watchlist.length });
  if (error) throw error;
  useSim.setState({ watchlist: [...watchlist, { symbol, name, exchange: symbol.endsWith(".BO") ? "BSE" : "NSE", position: watchlist.length }] });
}

export async function removeFromWatchlist(symbol: string) {
  const { error } = await getSupabase().from("sim_watchlist").delete().eq("symbol", symbol);
  if (error) throw error;
  useSim.setState({ watchlist: useSim.getState().watchlist.filter((w) => w.symbol !== symbol) });
}

/** "Live" only when the market is open and the quote is under a minute old — otherwise say how old it is. */
export function freshness(q: Quote | undefined, now = Date.now()): { label: string; tone: "live" | "delayed" | "closed" | "stale" } {
  if (!q) return { label: "No price yet", tone: "stale" };
  const age = Math.max(0, (now - new Date(q.time).getTime()) / 1000);
  const at = new Date(q.time).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  if (q.stale) return { label: `Couldn't refresh · last ${at}`, tone: "stale" };
  if (q.status !== "open") return { label: q.status === "pre_open" ? `Pre-open · last ${at}` : `Market closed · last ${at}`, tone: "closed" };
  if (age <= 60) return { label: `Live · ${at}`, tone: "live" };
  const mins = Math.round(age / 60);
  return { label: `Delayed ${mins} min · ${at}`, tone: mins > 20 ? "stale" : "delayed" };
}
