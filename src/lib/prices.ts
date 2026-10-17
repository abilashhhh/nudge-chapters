/**
 * Live prices for stocks, ETFs and mutual funds — the pure part (no network, no React).
 * The Supabase Edge Function `market-prices` looks prices up; `components/price-refresher.tsx`
 * calls it when the app opens and saves the new price on each holding.
 */
import type { Investment, ISODate } from "./types";

export type PriceKind = "stock" | "fund";

export interface PriceItem {
  id: string;
  kind: PriceKind;
  /** NSE symbol ("IDEA", or "XYZ.BO" for BSE) or AMFI scheme code ("147946"). Missing = match by name. */
  code: string | null;
  name: string;
}

export interface PriceResult {
  id: string;
  ok: boolean;
  code?: string;
  matched?: string;
  price?: number;
  date?: ISODate;
  error?: string;
}

/** What a holding was matched to, kept in preferences so it isn't looked up by name again. */
export type PriceCodes = Record<string, { code: string; matched?: string }>;

export function priceKind(type: Investment["type"]): PriceKind | null {
  if (type === "stock" || type === "etf") return "stock";
  if (type === "mutual_fund") return "fund";
  return null;
}

/**
 * The symbol or scheme code typed into "Folio, symbol or account no.", if that's what it holds.
 * Folio and account numbers don't qualify, so they're left alone and the name is used instead.
 */
export function codeFromIdentifier(kind: PriceKind, identifier?: string | null): string | null {
  const s = (identifier ?? "").trim();
  if (!s) return null;
  if (kind === "fund") return /^\d{5,7}$/.test(s) ? s : null;
  return /^(?=.*[A-Za-z])[A-Za-z0-9&-]{1,20}(\.(NS|BO))?$/i.test(s) ? s.toUpperCase() : null;
}

/** Holdings that can get a live price: stocks, ETFs and funds with units, not archived. */
export function priceItems(investments: Investment[], codes: PriceCodes = {}): PriceItem[] {
  const out: PriceItem[] = [];
  for (const inv of investments) {
    const kind = priceKind(inv.type);
    if (!kind || inv.archived || inv.units == null || inv.currency !== "INR") continue;
    out.push({ id: inv.id, kind, name: inv.name, code: codeFromIdentifier(kind, inv.identifier) ?? codes[inv.id]?.code ?? null });
  }
  return out;
}

/**
 * The changes to save for each fetched price. A price is skipped when it's for an earlier day than
 * the one already saved (for example, a value you typed in yourself today), or when nothing changed.
 */
export function priceUpdates(investments: Investment[], results: PriceResult[]): { id: string; patch: Pick<Investment, "current_price" | "value_as_of"> }[] {
  const byId = new Map(investments.map((i) => [i.id, i]));
  const out: { id: string; patch: Pick<Investment, "current_price" | "value_as_of"> }[] = [];
  for (const r of results) {
    const inv = byId.get(r.id);
    if (!inv || !r.ok || r.price == null || !(r.price > 0) || !r.date) continue;
    if (inv.value_as_of && r.date < inv.value_as_of) continue;
    const price = Math.round(r.price * 10000) / 10000;
    if (inv.current_price != null && Math.abs(Number(inv.current_price) - price) < 0.00005 && inv.value_as_of === r.date) continue;
    out.push({ id: r.id, patch: { current_price: price, value_as_of: r.date } });
  }
  return out;
}

/** New name matches worth remembering (only ones found by name, not typed in). */
export function newCodes(items: PriceItem[], results: PriceResult[], codes: PriceCodes = {}): PriceCodes | null {
  const typed = new Set(items.filter((i) => i.code && !codes[i.id]).map((i) => i.id));
  let changed = false;
  const next: PriceCodes = { ...codes };
  for (const r of results) {
    if (!r.ok || !r.code || typed.has(r.id)) continue;
    if (next[r.id]?.code === r.code) continue;
    next[r.id] = { code: r.code, matched: r.matched };
    changed = true;
  }
  return changed ? next : null;
}
