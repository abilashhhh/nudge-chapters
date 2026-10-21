"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { cn } from "@/lib/cn";
import { freshness, useSim, type Quote, type SimPosition } from "@/lib/sim/store";

export const SIM_PATH = "/trading/paper";
export const SIM_TABS = ["market", "portfolio", "orders", "analytics", "settings"] as const;
export type SimTab = (typeof SIM_TABS)[number];

/** Where you are in Paper Trading, kept in the address (tab and open stock) so Back and refresh work. */
export function useSimView(): [{ tab: SimTab; stock: string | null }, (v: { tab?: SimTab; stock?: string | null }) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("tab") as SimTab | null;
  const view = { tab: raw && SIM_TABS.includes(raw) ? raw : ("market" as SimTab), stock: params.get("s") };
  const go = useCallback(
    (v: { tab?: SimTab; stock?: string | null }) => {
      const p = new URLSearchParams();
      const tab = v.tab ?? view.tab;
      if (tab !== "market") p.set("tab", tab);
      const s = v.stock === undefined ? view.stock : v.stock;
      if (s) p.set("s", s);
      const q = p.toString();
      router.push(q ? `${SIM_PATH}?${q}` : SIM_PATH, { scroll: false });
      window.scrollTo({ top: 0 });
    },
    [router, view.tab, view.stock],
  );
  return [view, go];
}

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const inr = (n: number, whole = false) => (whole ? inr0 : inrFmt).format(Number.isFinite(n) ? n : 0);
export const signed = (n: number, whole = false) => `${n > 0.004 ? "+" : n < -0.004 ? "−" : ""}${inr(Math.abs(n), whole)}`;
export const pct = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "–" : `${n > 0.004 ? "+" : n < -0.004 ? "−" : ""}${Math.abs(n).toFixed(2)}%`);
export const plTone = (n: number | null | undefined) => (n == null || Math.abs(n) < 0.005 ? "text-ink" : n > 0 ? "text-ok" : "text-danger");
export const price = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export interface Holding extends SimPosition {
  ltp: number;
  hasPrice: boolean;
  invested: number;
  current: number;
  unrealized: number;
  unrealizedPct: number;
  dayChange: number | null;
}

/** Positions valued at the latest prices, plus the account's totals. */
export function usePortfolio() {
  const { account, positions, quotes, fills } = useSim();
  return useMemo(() => {
    const holdings: Holding[] = positions
      .filter((p) => p.qty > 0)
      .map((p) => {
        const q = quotes[p.symbol];
        const ltp = q?.price ?? p.avg_price;
        const invested = p.avg_price * p.qty;
        const current = ltp * p.qty;
        const unrealized = (ltp - p.avg_price) * p.qty - p.buy_charges;
        return { ...p, ltp, hasPrice: !!q, invested, current, unrealized, unrealizedPct: invested ? (unrealized / invested) * 100 : 0, dayChange: q ? q.change * p.qty : null };
      })
      .sort((a, b) => b.current - a.current);
    const holdingsValue = holdings.reduce((s, h) => s + h.current, 0);
    const invested = holdings.reduce((s, h) => s + h.invested, 0);
    const unrealized = holdings.reduce((s, h) => s + h.unrealized, 0);
    const cash = account?.cash ?? 0;
    const initial = account?.initial_capital ?? 0;
    const equity = cash + holdingsValue;
    const total = equity - initial;
    return {
      holdings,
      cash,
      initial,
      invested,
      holdingsValue,
      equity,
      unrealized,
      realized: account?.realized_pnl ?? 0,
      total,
      totalPct: initial ? (total / initial) * 100 : 0,
      charges: account?.charges_paid ?? 0,
      completed: fills.filter((f) => f.side === "sell").length,
      openPositions: new Set(holdings.map((h) => h.symbol)).size,
      dayChange: holdings.reduce((s, h) => s + (h.dayChange ?? 0), 0),
    };
  }, [account, positions, quotes, fills]);
}

export function Fresh({ q, className }: { q?: Quote; className?: string }) {
  const f = freshness(q);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11.5px]", f.tone === "live" ? "text-ok" : f.tone === "stale" ? "text-warn" : "text-ink-3", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", f.tone === "live" ? "animate-pulse bg-ok" : f.tone === "stale" ? "bg-warn" : f.tone === "delayed" ? "bg-warn" : "bg-ink-3")} aria-hidden />
      {f.label}
    </span>
  );
}

export function Box({ title, sub, action, children, className }: { title?: string; sub?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface p-4", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
            {sub && <p className="text-[12px] text-ink-3">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Metric({ label, value, note, tone, big }: { label: string; value: string; note?: string; tone?: string; big?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-3">
      <p className="truncate text-[12px] text-ink-3">{label}</p>
      <p className={cn("num mt-0.5 truncate font-semibold", big ? "text-[20px]" : "text-[16px]", tone)}>{value}</p>
      {note && <p className={cn("num truncate text-[11.5px]", tone ?? "text-ink-3")}>{note}</p>}
    </div>
  );
}

/** Initials badge for a company (no logos are fetched). */
export function Mono({ name, symbol }: { name?: string | null; symbol: string }) {
  const s = (name || symbol).replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const txt = (s.length > 1 ? s[0][0] + s[1][0] : (s[0] ?? symbol).slice(0, 2)).toUpperCase();
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold text-white" style={{ background: `hsl(${h} 45% 38%)` }} aria-hidden>
      {txt}
    </span>
  );
}
