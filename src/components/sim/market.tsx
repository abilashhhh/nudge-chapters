"use client";

import { Plus, Search, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { addToWatchlist, removeFromWatchlist, simCall, useSim, type Quote } from "@/lib/sim/store";
import { INDICES, LARGE_CAPS, ticker } from "@/lib/sim/universe";
import { Input } from "../ui/form";
import { Segmented } from "../ui/misc";
import { Box, Fresh, Mono, pct, plTone, price } from "./shared";

type Sort = "change" | "gainers" | "losers" | "name" | "volume";

export function MarketTab({ open }: { open: (symbol: string) => void }) {
  const { quotes, watchlist } = useSim();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string; exchange: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState<Sort>("change");
  const [sector, setSector] = useState<string>("All");

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await simCall<{ results: { symbol: string; name: string; exchange: string }[] }>("search", { q: term });
        setResults(r.results);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const sectors = useMemo(() => ["All", ...new Set(LARGE_CAPS.map((s) => s.sector))], []);
  const list = useMemo(() => {
    const rows = LARGE_CAPS.filter((s) => sector === "All" || s.sector === sector)
      .map((s) => ({ ...s, q: quotes[s.symbol] }))
      .filter((s) => s.q);
    const by: Record<Sort, (a: (typeof rows)[number], b: (typeof rows)[number]) => number> = {
      change: (a, b) => Math.abs(b.q!.changePct) - Math.abs(a.q!.changePct),
      gainers: (a, b) => b.q!.changePct - a.q!.changePct,
      losers: (a, b) => a.q!.changePct - b.q!.changePct,
      name: (a, b) => a.name.localeCompare(b.name),
      volume: (a, b) => (b.q!.volume ?? 0) * b.q!.price - (a.q!.volume ?? 0) * a.q!.price,
    };
    return rows.sort(by[sort]);
  }, [quotes, sort, sector]);
  const loaded = LARGE_CAPS.some((s) => quotes[s.symbol]);
  const star = async (symbol: string, name: string | null) => {
    try {
      if (watchlist.some((w) => w.symbol === symbol)) await removeFromWatchlist(symbol);
      else {
        await addToWatchlist(symbol, name);
        toast.success(`${ticker(symbol)} added to your watchlist`);
      }
    } catch {
      toast.error("Couldn't update your watchlist");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0">
        {INDICES.map((i) => {
          const x = quotes[i.symbol];
          return (
            <div key={i.symbol} className="min-w-[44%] shrink-0 rounded-2xl border border-line bg-surface p-3 sm:min-w-0">
              <p className="truncate text-[12px] text-ink-3">{i.name}</p>
              <p className="num text-[17px] font-semibold">{x ? price(x.price) : "–"}</p>
              <p className={cn("num text-[12px]", plTone(x?.change))}>{x ? `${x.change >= 0 ? "+" : "−"}${price(Math.abs(x.change))} (${pct(x.changePct)})` : "Loading…"}</p>
            </div>
          );
        })}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any NSE or BSE stock — name or symbol" className="pl-9" aria-label="Search stocks" />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-3 hover:bg-surface-3">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {results != null && (
        <Box title="Search results">
          {searching && !results.length ? (
            <p className="text-[13px] text-ink-3">Searching…</p>
          ) : !results.length ? (
            <p className="text-[13px] text-ink-3">No listed stock matches “{q}”.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {results.map((r) => (
                <li key={r.symbol} className="flex items-center gap-2 rounded-xl px-2 hover:bg-surface-2">
                  <button type="button" onClick={() => open(r.symbol)} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
                    <Mono name={r.name} symbol={r.symbol} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{r.name}</span>
                      <span className="block text-[12px] text-ink-3">{ticker(r.symbol)} · {r.exchange}</span>
                    </span>
                  </button>
                  <StarBtn on={watchlist.some((w) => w.symbol === r.symbol)} onClick={() => star(r.symbol, r.name)} />
                </li>
              ))}
            </ul>
          )}
        </Box>
      )}

      <Box title="Your watchlist" sub={watchlist.length ? undefined : "Tap ☆ on any stock to keep it here."}>
        {watchlist.length > 0 && (
          <ul className="-mx-2 flex flex-col">
            {watchlist.map((w) => (
              <StockRow key={w.symbol} symbol={w.symbol} name={w.name} q={quotes[w.symbol]} onOpen={() => open(w.symbol)} star={<StarBtn on onClick={() => star(w.symbol, w.name)} />} />
            ))}
          </ul>
        )}
      </Box>

      <Box
        title="Large caps"
        sub="Big, actively traded NSE companies. Prices from the market feed."
        action={<Segmented size="sm" value={sort} onChange={setSort} options={[{ id: "change", label: "Movers" }, { id: "gainers", label: "Gainers" }, { id: "losers", label: "Losers" }, { id: "volume", label: "Most traded" }, { id: "name", label: "A–Z" }]} />}
      >
        <div className="no-scrollbar -mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {sectors.map((s) => (
            <button key={s} type="button" onClick={() => setSector(s)} className={cn("shrink-0 rounded-full border px-3 py-1 text-[12.5px]", sector === s ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:border-line-strong")}>
              {s}
            </button>
          ))}
        </div>
        {!loaded ? (
          <p className="py-6 text-center text-[13px] text-ink-3">Getting prices…</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {list.map((s) => (
              <StockRow key={s.symbol} symbol={s.symbol} name={s.name} q={s.q} onOpen={() => open(s.symbol)} star={<StarBtn on={watchlist.some((w) => w.symbol === s.symbol)} onClick={() => star(s.symbol, s.name)} />} />
            ))}
          </ul>
        )}
      </Box>
    </div>
  );
}

function StarBtn({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={on ? "Remove from watchlist" : "Add to watchlist"} aria-pressed={on} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink">
      {on ? <Star className="h-4 w-4 fill-warn text-warn" /> : <Plus className="h-4 w-4" />}
    </button>
  );
}

export function StockRow({ symbol, name, q, onOpen, star }: { symbol: string; name: string | null; q?: Quote; onOpen: () => void; star?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1 rounded-xl px-2 hover:bg-surface-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
        <Mono name={name ?? q?.name} symbol={symbol} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{name ?? q?.name ?? ticker(symbol)}</span>
          <span className="block truncate text-[12px] text-ink-3">
            {ticker(symbol)} · {symbol.endsWith(".BO") ? "BSE" : "NSE"}
            {q && <Fresh q={q} className="ml-2 hidden sm:inline-flex" />}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="num block text-[14px] font-semibold">{q ? price(q.price) : "–"}</span>
          <span className={cn("num block text-[12px]", plTone(q?.change))}>{q ? pct(q.changePct) : ""}</span>
        </span>
      </button>
      {star}
    </li>
  );
}
