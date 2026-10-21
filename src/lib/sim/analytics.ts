/**
 * Paper-trading analytics, worked out only from saved records (fills, positions, daily snapshots) — never
 * from what's on screen. Realized P&L comes from sales; unrealized is kept separate and never counted as
 * realized.
 */
import { ist } from "./core";

export interface SimFill {
  id: string;
  order_id: string;
  symbol: string;
  name: string | null;
  side: "buy" | "sell";
  product: "delivery" | "intraday";
  qty: number;
  ref_price: number;
  price: number;
  value: number;
  charges: number;
  charges_detail: Record<string, number>;
  realized_pnl: number | null;
  quote_time: string | null;
  executed_at: string;
}

export interface SimSnapshot {
  date: string;
  cash: number;
  holdings_value: number;
  equity: number;
  realized_pnl: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A closed trade = one sale (its realized P&L), with how long the shares sold were held (FIFO). */
export interface ClosedTrade {
  fill: SimFill;
  pnl: number;
  holdDays: number;
}

export function closedTrades(fills: SimFill[]): ClosedTrade[] {
  const lots = new Map<string, { qty: number; at: number }[]>();
  const out: ClosedTrade[] = [];
  for (const f of [...fills].sort((a, b) => a.executed_at.localeCompare(b.executed_at))) {
    const key = `${f.symbol}|${f.product}`;
    const q = lots.get(key) ?? [];
    const at = new Date(f.executed_at).getTime();
    if (f.side === "buy") {
      q.push({ qty: f.qty, at });
      lots.set(key, q);
      continue;
    }
    let left = f.qty;
    let weighted = 0;
    while (left > 0 && q.length) {
      const lot = q[0];
      const take = Math.min(lot.qty, left);
      weighted += take * (at - lot.at);
      lot.qty -= take;
      left -= take;
      if (lot.qty === 0) q.shift();
    }
    out.push({ fill: f, pnl: Number(f.realized_pnl ?? 0), holdDays: f.qty ? weighted / (f.qty - left || 1) / 86400_000 : 0 });
  }
  return out;
}

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  /** Average win ÷ average loss. */
  rewardRisk: number | null;
  best: ClosedTrade | null;
  worst: ClosedTrade | null;
  avgHoldDays: number | null;
  /** Orders filled per week since the first one. */
  perWeek: number | null;
  realized: number;
  charges: number;
}

export function tradeStats(fills: SimFill[], now = Date.now()): Stats {
  const ct = closedTrades(fills);
  const wins = ct.filter((t) => t.pnl > 0);
  const losses = ct.filter((t) => t.pnl < 0);
  const avg = (xs: number[]) => (xs.length ? r2(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const avgWin = avg(wins.map((t) => t.pnl));
  const avgLoss = avg(losses.map((t) => t.pnl));
  const first = fills.length ? Math.min(...fills.map((f) => new Date(f.executed_at).getTime())) : null;
  const weeks = first != null ? Math.max(1, (now - first) / (7 * 86400_000)) : null;
  const sorted = [...ct].sort((a, b) => b.pnl - a.pnl);
  return {
    trades: ct.length,
    wins: wins.length,
    losses: losses.length,
    winRate: ct.length ? (wins.length / ct.length) * 100 : null,
    avgWin,
    avgLoss,
    rewardRisk: avgWin != null && avgLoss != null && avgLoss !== 0 ? r2(avgWin / Math.abs(avgLoss)) : null,
    best: sorted[0] ?? null,
    worst: sorted.length ? sorted[sorted.length - 1] : null,
    avgHoldDays: ct.length ? r2(ct.reduce((s, t) => s + t.holdDays, 0) / ct.length) : null,
    perWeek: weeks != null ? r2(fills.length / weeks) : null,
    realized: r2(ct.reduce((s, t) => s + t.pnl, 0)),
    charges: r2(fills.reduce((s, f) => s + Number(f.charges), 0)),
  };
}

/** Realized P&L in the IST day / week (Mon start) / month / all time that contains `now`. */
export function realizedByPeriod(fills: SimFill[], now = Date.now()) {
  const t = ist(now);
  const monday = new Date(Date.parse(`${t.date}T00:00:00Z`) - ((t.weekday + 6) % 7) * 86400_000).toISOString().slice(0, 10);
  const sum = (test: (d: string) => boolean) => r2(fills.filter((f) => f.side === "sell" && test(ist(new Date(f.executed_at).getTime()).date)).reduce((s, f) => s + Number(f.realized_pnl ?? 0), 0));
  return { day: sum((d) => d === t.date), week: sum((d) => d >= monday && d <= t.date), month: sum((d) => d.slice(0, 7) === t.date.slice(0, 7)), all: sum(() => true) };
}

/** Biggest fall from a high in account value, from the daily snapshots. */
export function maxDrawdown(snaps: SimSnapshot[]): { amount: number; pct: number } {
  let peak = -Infinity;
  let worst = { amount: 0, pct: 0 };
  for (const s of [...snaps].sort((a, b) => a.date.localeCompare(b.date))) {
    peak = Math.max(peak, s.equity);
    const dd = peak - s.equity;
    if (dd > worst.amount) worst = { amount: r2(dd), pct: peak > 0 ? r2((dd / peak) * 100) : 0 };
  }
  return worst;
}

/** Realized P&L and charges per stock. */
export function byStock(fills: SimFill[]): { symbol: string; name: string | null; realized: number; charges: number; trades: number }[] {
  const m = new Map<string, { symbol: string; name: string | null; realized: number; charges: number; trades: number }>();
  for (const f of fills) {
    const x = m.get(f.symbol) ?? { symbol: f.symbol, name: f.name, realized: 0, charges: 0, trades: 0 };
    x.charges = r2(x.charges + Number(f.charges));
    x.trades += 1;
    if (f.side === "sell") x.realized = r2(x.realized + Number(f.realized_pnl ?? 0));
    m.set(f.symbol, x);
  }
  return [...m.values()].sort((a, b) => b.realized - a.realized);
}
