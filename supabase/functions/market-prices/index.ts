// Latest prices for stocks / ETFs (Yahoo Finance, NSE then BSE) and mutual funds (AMFI NAV via mfapi.in).
// Called by the app when it opens (see src/components/price-refresher.tsx); needs a signed-in user's JWT.
// Deploy: supabase functions deploy market-prices
//
// POST { items: [{ id, kind: "stock" | "fund", code?: string | null, name: string }], history?: "1y" }
// →    { results: [{ id, ok, code?, matched?, price?, date?, points?, error? }] }
// With `history`, each result also carries `points`: [date, price] pairs for the last year (at most ~130).
// When `code` is missing the item is matched by name (first NSE listing, or the closest fund scheme).

type Kind = "stock" | "fund";
interface Item { id: string; kind: Kind; code?: string | null; name: string }
interface Result { id: string; ok: boolean; code?: string; matched?: string; price?: number; date?: string; points?: [string, number][]; error?: string }

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const UA = { "User-Agent": "Mozilla/5.0 (compatible; NudgeChapters/1.0)", Accept: "application/json" };

async function getJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** Date in India for a unix time, as YYYY-MM-DD. */
const istDate = (unix: number) => new Date(unix * 1000 + 5.5 * 3600_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ stocks
async function findStock(name: string): Promise<{ code: string; matched: string } | null> {
  const q = name.replace(/\b(ltd|limited|share|shares|equity)\b\.?/gi, "").trim();
  const j = await getJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`);
  const quotes: any[] = (j?.quotes ?? []).filter((x: any) => typeof x.symbol === "string" && ["EQUITY", "ETF"].includes(x.quoteType));
  const pick = quotes.find((x) => x.symbol.endsWith(".NS")) ?? quotes.find((x) => x.symbol.endsWith(".BO"));
  return pick ? { code: pick.symbol.replace(/\.NS$/, ""), matched: pick.longname ?? pick.shortname ?? pick.symbol } : null;
}

/** Keeps every nth point (and the last) so a year of prices stays small. */
function thin(points: [string, number][], max = 130): [string, number][] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const out: [string, number][] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out[out.length - 1] = points[points.length - 1];
  return out;
}

async function stockHistory(code: string): Promise<[string, number][]> {
  const tries = /\.(NS|BO)$/i.test(code) ? [code.toUpperCase()] : [`${code.toUpperCase()}.NS`, `${code.toUpperCase()}.BO`];
  for (const sym of tries) {
    try {
      const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d`);
      const r = j?.chart?.result?.[0];
      const ts: number[] = r?.timestamp ?? [];
      const close: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
      const pts = ts.map((t, i) => [istDate(t), Number(close[i])] as [string, number]).filter(([, v]) => Number.isFinite(v) && v > 0);
      if (pts.length) return thin(pts);
    } catch {
      /* next exchange */
    }
  }
  return [];
}

async function fundHistory(code: string): Promise<[string, number][]> {
  const j = await getJson(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`);
  const since = new Date(Date.now() - 366 * 864e5).toISOString().slice(0, 10);
  const pts = ((j?.data ?? []) as { date: string; nav: string }[])
    .map((row) => {
      const [d, m, y] = String(row.date).split("-");
      return [`${y}-${m}-${d}`, Number(row.nav)] as [string, number];
    })
    .filter(([d, v]) => d >= since && Number.isFinite(v) && v > 0)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return thin(pts);
}

async function stockPrice(code: string): Promise<{ price: number; date: string; matched?: string }> {
  // A bare symbol is NSE; "XYZ.BO" is BSE. Fall back to BSE when NSE has nothing.
  const tries = /\.(NS|BO)$/i.test(code) ? [code.toUpperCase()] : [`${code.toUpperCase()}.NS`, `${code.toUpperCase()}.BO`];
  let last: unknown;
  for (const sym of tries) {
    try {
      const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`);
      const meta = j?.chart?.result?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      if (meta && Number.isFinite(price) && price > 0) return { price, date: istDate(meta.regularMarketTime ?? Date.now() / 1000), matched: meta.longName ?? meta.shortName };
      last = new Error("No price");
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("No price");
}

// ------------------------------------------------------------------ funds
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
const NOISE = new Set(["fund", "plan", "option", "the", "of", "growth", "direct", "regular", "idcw", "dividend", "mutual", "mf", "scheme"]);

/** Higher = closer. Direct/regular and growth/IDCW must agree with the name the user typed. */
export function scoreScheme(want: string, scheme: string): number {
  const w = words(want), s = words(scheme);
  const sset = new Set(s);
  let score = w.filter((x) => !NOISE.has(x) && sset.has(x)).length * 10;
  const wantRegular = w.includes("regular");
  score += (wantRegular ? sset.has("regular") : sset.has("direct")) ? 5 : -20;
  const wantIdcw = w.includes("idcw") || w.includes("dividend");
  const isIdcw = sset.has("idcw") || sset.has("dividend");
  score += wantIdcw === isIdcw ? 5 : -20;
  return score - Math.abs(s.length - w.length) * 0.1;
}

async function findFund(name: string): Promise<{ code: string; matched: string } | null> {
  const core = words(name).filter((x) => !NOISE.has(x)).join(" ");
  const list: any[] = await getJson(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(core || name)}`);
  if (!Array.isArray(list) || !list.length) return null;
  const best = list.map((x) => ({ x, s: scoreScheme(name, String(x.schemeName)) })).sort((a, b) => b.s - a.s)[0];
  return best.s > 0 ? { code: String(best.x.schemeCode), matched: String(best.x.schemeName) } : null;
}

async function fundPrice(code: string): Promise<{ price: number; date: string; matched?: string }> {
  const j = await getJson(`https://api.mfapi.in/mf/${encodeURIComponent(code)}/latest`);
  const row = j?.data?.[0];
  const price = Number(row?.nav);
  if (!row || !Number.isFinite(price) || price <= 0) throw new Error("No NAV");
  const [d, m, y] = String(row.date).split("-"); // dd-mm-yyyy
  return { price, date: `${y}-${m}-${d}`, matched: j?.meta?.scheme_name };
}

// ------------------------------------------------------------------ handler
async function one(it: Item, history: boolean): Promise<Result> {
  try {
    let code = it.code?.trim() || "";
    let matched: string | undefined;
    if (!code) {
      const f = it.kind === "fund" ? await findFund(it.name) : await findStock(it.name);
      if (!f) return { id: it.id, ok: false, error: "No match found — add the symbol or scheme code" };
      code = f.code;
      matched = f.matched;
    }
    const [p, points] = await Promise.all([
      it.kind === "fund" ? fundPrice(code) : stockPrice(code),
      history ? (it.kind === "fund" ? fundHistory(code) : stockHistory(code)).catch(() => [] as [string, number][]) : Promise.resolve(undefined),
    ]);
    return { id: it.id, ok: true, code, matched: p.matched ?? matched, price: p.price, date: p.date, points };
  } catch (e) {
    return { id: it.id, ok: false, code: it.code ?? undefined, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: CORS });
  let items: Item[] = [];
  let history = false;
  try {
    const body = await req.json();
    items = (body?.items ?? []) as Item[];
    history = body?.history === "1y";
  } catch {
    return new Response("bad json", { status: 400, headers: CORS });
  }
  items = items.filter((x) => x && typeof x.id === "string" && (x.kind === "stock" || x.kind === "fund") && typeof x.name === "string").slice(0, 60);
  const results = await Promise.all(items.map((it) => one(it, history)));
  return new Response(JSON.stringify({ results }), { headers: { ...CORS, "Content-Type": "application/json" } });
});
