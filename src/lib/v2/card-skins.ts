// How each card, account and wallet is drawn: colours and motifs modelled on the real cards (by name and issuer),
// so the HDFC Swiggy card looks like the orange Swiggy card, the ICICI Amazon Pay card like the dark Amazon Pay
// card, and so on. These are drawings in the cards' colours, not the banks' artwork or logos.

export type Motif = "swoosh" | "smile" | "lines" | "band" | "metal" | "neon" | "wave" | "orbs" | "grid" | "plain";

export interface Skin {
  /** CSS background. */
  bg: string;
  /** Text colour family on the card. */
  ink: "light" | "dark";
  /** Big word shown on the card (the card's own brand), if any. */
  mark?: string;
  /** Style of that word. */
  markStyle?: "bold" | "italic" | "lower" | "spaced";
  accent: string;
  motif: Motif;
}

const g = (a: string, b: string, angle = 135) => `linear-gradient(${angle}deg, ${a} 0%, ${b} 100%)`;

/** Credit cards, matched on "issuer + name". First match wins. */
const CREDIT: [RegExp, Skin][] = [
  [/swiggy/i, { bg: g("#ff8a1f", "#e8580c"), ink: "light", mark: "SWIGGY", markStyle: "bold", accent: "#fff3e6", motif: "swoosh" }],
  [/amazon/i, { bg: g("#232f3e", "#0f1419"), ink: "light", mark: "amazon pay", markStyle: "lower", accent: "#ff9900", motif: "smile" }],
  [/millennia/i, { bg: g("#9c1d2c", "#4a0d16"), ink: "light", mark: "MILLENNIA", markStyle: "spaced", accent: "#f2b8c0", motif: "lines" }],
  [/bpcl/i, { bg: g("#0a58a8", "#062e5e"), ink: "light", mark: "BPCL", markStyle: "bold", accent: "#ffd200", motif: "band" }],
  [/\bace\b/i, { bg: g("#13315c", "#081a33"), ink: "light", mark: "ACE", markStyle: "spaced", accent: "#9fb9df", motif: "wave" }],
  [/onecard|one card/i, { bg: g("#2b2b2e", "#0d0d0f", 160), ink: "light", mark: "OneCard", markStyle: "bold", accent: "#c9c9cf", motif: "metal" }],
  [/\bneo\b/i, { bg: g("#3a0a3f", "#97144d"), ink: "light", mark: "NEO", markStyle: "spaced", accent: "#ff4fd8", motif: "neon" }],
  [/flipkart/i, { bg: g("#2874f0", "#123c8c"), ink: "light", mark: "Flipkart", markStyle: "italic", accent: "#ffe11b", motif: "orbs" }],
  [/amex|american express/i, { bg: g("#2e7fd1", "#0b2f6b"), ink: "light", mark: "AMERICAN EXPRESS", markStyle: "spaced", accent: "#bfe1ff", motif: "grid" }],
  [/slice/i, { bg: g("#7b3ff2", "#24104f"), ink: "light", mark: "slice", markStyle: "lower", accent: "#e2d4ff", motif: "orbs" }],
  [/regalia|infinia|diners|hdfc/i, { bg: g("#1b4f9c", "#0a234d"), ink: "light", accent: "#a8c6f0", motif: "wave" }],
  [/icici/i, { bg: g("#b23a12", "#5c1a06"), ink: "light", accent: "#ffc7ad", motif: "wave" }],
  [/axis/i, { bg: g("#97144d", "#4d0a27"), ink: "light", accent: "#ffb3d1", motif: "lines" }],
  [/sbi|state bank/i, { bg: g("#2b6cb0", "#123a73"), ink: "light", accent: "#b5d3f5", motif: "wave" }],
  [/idfc/i, { bg: g("#9c1d27", "#4f0e14"), ink: "light", accent: "#f2b8c0", motif: "lines" }],
  [/yes/i, { bg: g("#1e4fa3", "#0b2a5c"), ink: "light", accent: "#9fb9df", motif: "wave" }],
  [/kotak/i, { bg: g("#d22630", "#7d0f12"), ink: "light", accent: "#ffc2c5", motif: "wave" }],
];

/** Bank accounts (drawn as their debit cards) and wallets. */
const DEBIT: [RegExp, Skin][] = [
  [/kotak/i, { bg: g("#e3262f", "#8f0c12"), ink: "light", accent: "#ffd0d2", motif: "wave" }],
  [/\bsbi\b|state bank/i, { bg: g("#1f6fc5", "#0d356e"), ink: "light", accent: "#bcd9ff", motif: "orbs" }],
  [/canara/i, { bg: g("#0a8fd1", "#05487f"), ink: "light", accent: "#ffcb05", motif: "band" }],
  [/slice/i, { bg: g("#7b3ff2", "#24104f"), ink: "light", mark: "slice", markStyle: "lower", accent: "#e2d4ff", motif: "orbs" }],
  [/dhan[a]?laxmi/i, { bg: g("#7d1820", "#3b0a0e"), ink: "light", accent: "#e8c36a", motif: "lines" }],
  [/hdfc/i, { bg: g("#1b4f9c", "#0a234d"), ink: "light", accent: "#a8c6f0", motif: "wave" }],
  [/icici/i, { bg: g("#b23a12", "#5c1a06"), ink: "light", accent: "#ffc7ad", motif: "wave" }],
  [/axis/i, { bg: g("#97144d", "#4d0a27"), ink: "light", accent: "#ffb3d1", motif: "lines" }],
  [/\bcred\b/i, { bg: g("#1c1c1e", "#000000", 160), ink: "light", mark: "CRED", markStyle: "spaced", accent: "#d9d9d9", motif: "metal" }],
  [/amazon/i, { bg: g("#232f3e", "#0f1419"), ink: "light", mark: "amazon pay", markStyle: "lower", accent: "#ff9900", motif: "smile" }],
  [/stake/i, { bg: g("#0f2a2e", "#06161a"), ink: "light", mark: "Stake", markStyle: "bold", accent: "#3ddc97", motif: "grid" }],
  [/paytm/i, { bg: g("#00baf2", "#002e6e"), ink: "light", mark: "paytm", markStyle: "lower", accent: "#ffffff", motif: "wave" }],
  [/cash/i, { bg: g("#2f7d4f", "#14432a"), ink: "light", mark: "CASH", markStyle: "spaced", accent: "#cdeed9", motif: "grid" }],
];

const FALLBACK: Skin[] = [
  { bg: g("#1f6b4f", "#0f3b2c"), ink: "light", accent: "#bfe6d3", motif: "wave" },
  { bg: g("#3b2a8a", "#6a4fd8"), ink: "light", accent: "#d9d0ff", motif: "orbs" },
  { bg: g("#5c1f3a", "#b0335f"), ink: "light", accent: "#ffc2d6", motif: "lines" },
  { bg: g("#1d3b5c", "#2f6fa8"), ink: "light", accent: "#bcd9ff", motif: "wave" },
];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;
}

/** The skin for a card or account. A colour you chose yourself wins over the matched design. */
export function skinFor(kind: "credit" | "debit", name: string, issuer?: string | null, color?: string | null): Skin {
  const text = `${issuer ?? ""} ${name}`;
  const list = kind === "credit" ? CREDIT : DEBIT;
  const found = list.find(([re]) => re.test(text))?.[1] ?? FALLBACK[hash(text) % FALLBACK.length];
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return { ...found, bg: g(color, shade(color, -0.5)) };
  return found;
}

/** Fund houses and brokers, for holding tiles. */
const HOUSES: [RegExp, [string, string]][] = [
  [/bandhan/i, ["#d62e2e", "#7a1111"]],
  [/parag parikh|ppfas/i, ["#1d4e89", "#0b2647"]],
  [/hdfc/i, ["#1b4f9c", "#0a234d"]],
  [/icici/i, ["#b23a12", "#5c1a06"]],
  [/sbi/i, ["#2b6cb0", "#123a73"]],
  [/axis/i, ["#97144d", "#4d0a27"]],
  [/nippon/i, ["#d71920", "#6e0b0f"]],
  [/kotak/i, ["#d22630", "#7d0f12"]],
  [/quant/i, ["#1f1f1f", "#454545"]],
  [/motilal/i, ["#f7a11a", "#9c5a00"]],
  [/mirae/i, ["#f58220", "#8a3d00"]],
  [/tata/i, ["#1b4c9b", "#0d2550"]],
  [/uti/i, ["#0d5ca6", "#062f57"]],
  [/vodafone|\bvi\b|idea/i, ["#e60000", "#5c0a3d"]],
  [/gtl/i, ["#1a6aa8", "#0c3354"]],
  [/rama steel/i, ["#4b5563", "#1f2937"]],
];

export function holdingColors(name: string, type: string): [string, string] {
  const hit = HOUSES.find(([re]) => re.test(name))?.[1];
  if (hit) return hit;
  const pool: [string, string][] = type === "mutual_fund" ? [["#1f6b4f", "#0f3b2c"], ["#3b2a8a", "#1d1450"], ["#0d5ca6", "#062f57"]] : [["#334155", "#0f172a"], ["#4b2a6a", "#1e0f30"], ["#0f5f5c", "#06302e"]];
  return pool[hash(name) % pool.length];
}
