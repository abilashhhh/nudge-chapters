// Money helpers: rounding, conversion to the user's base currency and
// locale-aware formatting (Indian lakh/crore grouping for en-IN).

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sum<T>(items: T[], f: (t: T) => number): number {
  let s = 0;
  for (const it of items) s += f(it) || 0;
  return round2(s);
}

export interface MoneyContext {
  currency: string;
  locale: string;
  fx: Record<string, number>;
}

/** Convert an amount in `from` currency to the base currency using user-maintained rates. */
export function toBase(amount: number, from: string | null | undefined, ctx: Pick<MoneyContext, "currency" | "fx">): number {
  if (!from || from === ctx.currency) return amount;
  const rate = ctx.fx[from];
  return rate && rate > 0 ? amount * rate : amount;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string, currency: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${currency}|${JSON.stringify(opts)}`;
  let f = formatterCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, { style: "currency", currency, ...opts });
    } catch {
      f = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", ...opts });
    }
    formatterCache.set(key, f);
  }
  return f;
}

export function formatMoney(
  amount: number,
  ctx: Pick<MoneyContext, "currency" | "locale">,
  opts: { decimals?: boolean; sign?: boolean; currency?: string } = {},
): string {
  const currency = opts.currency || ctx.currency;
  const f = getFormatter(ctx.locale, currency, {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
    signDisplay: opts.sign ? "exceptZero" : "auto",
  });
  return f.format(Number.isFinite(amount) ? amount : 0);
}

/** Short form: ₹1.2L, ₹3.4Cr for en-IN; $12.3K, $1.2M elsewhere. */
export function formatCompact(amount: number, ctx: Pick<MoneyContext, "currency" | "locale">): string {
  const abs = Math.abs(amount);
  const neg = amount < 0 ? "−" : "";
  const symbol = currencySymbol(ctx);
  const indian = ctx.locale.endsWith("-IN") || ctx.currency === "INR";
  const fmt = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.?0+$/, "");
  if (indian) {
    if (abs >= 1e7) return `${neg}${symbol}${fmt(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${neg}${symbol}${fmt(abs / 1e5)}L`;
    if (abs >= 1e3) return `${neg}${symbol}${fmt(abs / 1e3)}K`;
    return `${neg}${symbol}${Math.round(abs)}`;
  }
  if (abs >= 1e9) return `${neg}${symbol}${fmt(abs / 1e9)}B`;
  if (abs >= 1e6) return `${neg}${symbol}${fmt(abs / 1e6)}M`;
  if (abs >= 1e3) return `${neg}${symbol}${fmt(abs / 1e3)}K`;
  return `${neg}${symbol}${Math.round(abs)}`;
}

export function currencySymbol(ctx: Pick<MoneyContext, "currency" | "locale">): string {
  try {
    const parts = new Intl.NumberFormat(ctx.locale, { style: "currency", currency: ctx.currency }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? ctx.currency;
  } catch {
    return "₹";
  }
}

/** "1,25,000" → "1.25 lakh" — a reading aid shown under amount inputs. */
export function amountInWords(amount: number, ctx: Pick<MoneyContext, "currency" | "locale">): string {
  const abs = Math.abs(amount);
  if (!abs) return "";
  const indian = ctx.locale.endsWith("-IN") || ctx.currency === "INR";
  const t = (n: number) => String(Number(n.toFixed(2)));
  if (indian) {
    if (abs >= 1e7) return `${t(abs / 1e7)} crore`;
    if (abs >= 1e5) return `${t(abs / 1e5)} lakh`;
    if (abs >= 1e3) return `${t(abs / 1e3)} thousand`;
    return "";
  }
  if (abs >= 1e9) return `${t(abs / 1e9)} billion`;
  if (abs >= 1e6) return `${t(abs / 1e6)} million`;
  if (abs >= 1e3) return `${t(abs / 1e3)} thousand`;
  return "";
}

export function formatPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(digits).replace(/\.0+$/, "")}%`;
}

/** Parse user input like "1,25,000", "1.5L", "2 cr", "12k". */
export function parseAmount(input: string): number | null {
  if (!input) return null;
  const s = input.toLowerCase().replace(/[₹$€£,\s]/g, "");
  const m = s.match(/^(-?\d*\.?\d+)(k|l|lac|lakh|lakhs|cr|crore|crores|m|mn)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult: Record<string, number> = { k: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7, m: 1e6, mn: 1e6 };
  return round2(n * (m[2] ? mult[m[2]] : 1));
}
