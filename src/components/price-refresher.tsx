"use client";

/**
 * Fetches the latest stock prices and fund NAVs when the app opens (and when you come back to it
 * after a while), then saves them on each holding. Signed-in accounts only — the lookup runs in the
 * Supabase Edge Function `market-prices`, because stock-price sites can't be called from a browser.
 */
import { useEffect } from "react";
import { create } from "zustand";
import { getSupabase } from "@/lib/data/supabase";
import { newCodes, priceItems, priceUpdates, type PriceResult } from "@/lib/prices";
import { useStore } from "@/lib/store";

/** Don't look prices up again within this long (they only change once a trading day for funds). */
const MIN_GAP_MS = 15 * 60_000;
const LAST_KEY = "nudge:prices:last";

interface PriceState {
  busy: boolean;
  /** When prices were last checked on this device (ms). */
  at: number | null;
  updated: number;
  failed: { id: string; error: string }[];
}

export const usePrices = create<PriceState>(() => ({ busy: false, at: readLast(), updated: 0, failed: [] }));

function readLast(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Is live pricing possible here (a signed-in account with at least one stock or fund)? */
export function livePricesAvailable(): boolean {
  const { repo, ds } = useStore.getState();
  return repo?.kind === "supabase" && !!ds && priceItems(ds.investments).length > 0;
}

/** Look up and save prices now. `force` skips the 15-minute wait. Returns how many holdings changed. */
export async function refreshPrices(force = false): Promise<number> {
  const store = useStore.getState();
  const { ds, repo } = store;
  if (!ds || repo?.kind !== "supabase" || ds.profile.preferences.livePrices?.off) return 0;
  const st = usePrices.getState();
  if (st.busy) return 0;
  if (!force && st.at && Date.now() - st.at < MIN_GAP_MS) return 0;
  const codes = ds.profile.preferences.livePrices?.codes ?? {};
  const items = priceItems(ds.investments, codes);
  if (!items.length) return 0;

  usePrices.setState({ busy: true });
  try {
    const { data, error } = await getSupabase().functions.invoke<{ results: PriceResult[] }>("market-prices", { body: { items } });
    if (error) throw error;
    const results = data?.results ?? [];
    const cur = useStore.getState().ds ?? ds;
    const updates = priceUpdates(cur.investments, results);
    for (const u of updates) await useStore.getState().patch("investments", u.id, u.patch);
    const learned = newCodes(items, results, codes);
    if (learned) await useStore.getState().updatePrefs({ livePrices: { ...cur.profile.preferences.livePrices, codes: learned } });
    const at = Date.now();
    try {
      localStorage.setItem(LAST_KEY, String(at));
    } catch {
      /* private mode */
    }
    usePrices.setState({ at, updated: updates.length, failed: results.filter((r) => !r.ok).map((r) => ({ id: r.id, error: r.error ?? "Not found" })) });
    return updates.length;
  } finally {
    usePrices.setState({ busy: false });
  }
}

/** Mounted once in the app shell. */
export function PriceRefresher() {
  const status = useStore((s) => s.status);
  const repoKind = useStore((s) => s.repo?.kind);
  useEffect(() => {
    if (status !== "ready" || repoKind !== "supabase") return;
    const run = () => void refreshPrices().catch(() => undefined);
    run();
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [status, repoKind]);
  return null;
}

// ---------------------------------------------------------------------------
// A year of daily prices / NAVs per holding, for the charts on holding tiles and pages.
// Fetched at most once a day per device and kept in this browser; nothing is saved to your data.

const HISTORY_KEY = "nudge:prices:history:v1";
type History = Record<string, [string, number][]>;

export const usePriceHistory = create<{ day: string | null; points: History }>(() => readHistory());

function readHistory(): { day: string | null; points: History } {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "null");
    if (v && typeof v.day === "string" && v.points && typeof v.points === "object") return v;
  } catch {
    /* none yet */
  }
  return { day: null, points: {} };
}

let historyLoad: Promise<void> | null = null;

/** Loads the year of prices once a day (signed-in accounts only). */
export function loadPriceHistory(): Promise<void> {
  const { ds, repo } = useStore.getState();
  const today = new Date().toISOString().slice(0, 10);
  if (!ds || repo?.kind !== "supabase" || ds.profile.preferences.livePrices?.off) return Promise.resolve();
  const items = priceItems(ds.investments, ds.profile.preferences.livePrices?.codes ?? {});
  const have = usePriceHistory.getState();
  if (!items.length || (have.day === today && items.every((i) => have.points[i.id]))) return Promise.resolve();
  historyLoad ??= (async () => {
    try {
      const { data, error } = await getSupabase().functions.invoke<{ results: (PriceResult & { points?: [string, number][] })[] }>("market-prices", { body: { items, history: "1y" } });
      if (error) return;
      const points: History = { ...have.points };
      for (const r of data?.results ?? []) if (r.ok && r.points?.length) points[r.id] = r.points;
      const next = { day: today, points };
      usePriceHistory.setState(next);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* storage full: keep it for this visit */
      }
    } catch {
      /* offline: try again next time */
    } finally {
      historyLoad = null;
    }
  })();
  return historyLoad;
}

/** Price history for one holding ([date, price] oldest first), or [] while loading / unavailable. */
export function useHoldingHistory(id: string | null | undefined): [string, number][] {
  const pts = usePriceHistory((s) => (id ? s.points[id] : undefined));
  const ready = useStore((s) => s.status === "ready");
  useEffect(() => {
    if (ready) void loadPriceHistory();
  }, [ready]);
  return pts ?? [];
}
