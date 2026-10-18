"use client";

import { Plus, Wifi } from "lucide-react";
import { useRef, type CSSProperties, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import type { CreditCard } from "@/lib/types";

/** Bank colours (recognisable, not exact brand art), used when a card has no colour of its own. */
const ISSUER_THEMES: [RegExp, [string, string]][] = [
  [/hdfc/i, ["#0b3d91", "#1565c0"]],
  [/icici/i, ["#8a2c0a", "#d9531e"]],
  [/\bsbi\b|state bank/i, ["#123a73", "#2b6cb0"]],
  [/axis/i, ["#5c0f2e", "#97144d"]],
  [/kotak/i, ["#7d0f12", "#d22630"]],
  [/idfc/i, ["#5a1020", "#9c1d27"]],
  [/slice/i, ["#2b0f5c", "#6b2fd6"]],
  [/onecard|\bbob\b|baroda/i, ["#111111", "#3b3b3b"]],
  [/amex|american express/i, ["#0d4d5c", "#2a8c9e"]],
  [/yes/i, ["#0b2a5c", "#1e4fa3"]],
  [/indusind/i, ["#4a1d10", "#8b3a1a"]],
  [/au\b/i, ["#4a1a5c", "#ec6608"]],
  [/federal/i, ["#0b3a6b", "#e8a417"]],
];
const FALLBACK: [string, string][] = [["#1f6b4f", "#0f3b2c"], ["#3b2a8a", "#6a4fd8"], ["#5c1f3a", "#b0335f"], ["#1d3b5c", "#2f6fa8"], ["#3d3d3d", "#121212"]];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export function cardTheme(card: Pick<CreditCard, "name" | "issuer" | "color">): [string, string] {
  if (card.color && /^#[0-9a-f]{6}$/i.test(card.color)) return [card.color, shade(card.color, -0.45)];
  const text = `${card.issuer ?? ""} ${card.name}`;
  return ISSUER_THEMES.find(([re]) => re.test(text))?.[1] ?? FALLBACK[hash(text) % FALLBACK.length];
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;
}

function NetworkMark({ network }: { network?: string | null }) {
  const n = (network ?? "").toLowerCase();
  if (n.includes("master"))
    return (
      <span className="relative flex h-6 w-10 items-center" aria-label="Mastercard">
        <span className="absolute left-0 h-6 w-6 rounded-full bg-[#eb001b]/90" />
        <span className="absolute left-4 h-6 w-6 rounded-full bg-[#f79e1b]/90 mix-blend-screen" />
      </span>
    );
  const label = n.includes("visa") ? "VISA" : n.includes("rupay") ? "RuPay" : n.includes("amex") || n.includes("american") ? "AMEX" : n.includes("diners") ? "Diners" : network || "";
  return <span className={cn("font-bold italic tracking-wide", label === "VISA" ? "text-[20px]" : "text-[14px]")}>{label}</span>;
}

export interface CardVisualProps {
  card: CreditCard;
  /** 0–1 of the limit in use. */
  used?: number;
  /** A line under the name, e.g. "₹14,280 due 15 Oct". */
  due?: string | null;
  dueTone?: "late" | "soon" | "paid" | null;
  onClick?: () => void;
  className?: string;
  /** Stagger the entrance animation. */
  index?: number;
}

/**
 * A credit card drawn like the real thing: the bank's colours, chip, contactless mark, network and the last digits.
 * It tilts towards the pointer and a light sheen passes over it (both switch off with reduced motion).
 */
export function CardVisual({ card, used, due, dueTone, onClick, className, index = 0 }: CardVisualProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [a, b] = cardTheme(card);
  const tilt = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(0)}%`);
  };
  const reset = () => {
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  };
  const pct = used == null ? null : Math.max(0, Math.min(1, used));
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onPointerMove={tilt}
      onPointerLeave={reset}
      aria-label={`${card.name}${card.last4 ? ` ending ${card.last4}` : ""}${due ? `, ${due}` : ""}`}
      className={cn("credit-card anim-rise group relative isolate block aspect-[1.586] w-full overflow-hidden rounded-[18px] p-4 text-left text-white shadow-[0_14px_30px_-12px_rgba(0,0,0,0.55)] sm:p-5", className)}
      style={{ background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`, animationDelay: `${index * 70}ms` } as CSSProperties}
    >
      {/* texture: soft rings + moving sheen */}
      <span className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" aria-hidden />
      <span className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-black/15" aria-hidden />
      <span className="credit-card-sheen pointer-events-none absolute inset-0" aria-hidden />

      <span className="relative flex h-full flex-col justify-between">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{card.issuer || "Credit card"}</span>
            <span className="display mt-0.5 block truncate text-[17px] font-semibold leading-tight sm:text-[19px]">{card.name}</span>
          </span>
          <Wifi className="h-5 w-5 shrink-0 rotate-90 opacity-80" aria-hidden />
        </span>

        <span className="flex items-center gap-3">
          {/* EMV chip */}
          <span className="relative h-7 w-9 rounded-md bg-gradient-to-br from-[#f5d77a] to-[#b8902f] shadow-inner" aria-hidden>
            <span className="absolute inset-x-1 top-1/2 h-px bg-black/25" />
            <span className="absolute inset-y-1 left-1/2 w-px bg-black/25" />
            <span className="absolute inset-[5px] rounded-[3px] border border-black/20" />
          </span>
          {due && <span className={cn("truncate rounded-full bg-black/25 px-2 py-0.5 text-[11.5px] font-medium backdrop-blur-sm", dueTone === "late" && "bg-[#ff4d4f]/80", dueTone === "soon" && "bg-[#f59e0b]/80", dueTone === "paid" && "bg-[#16a34a]/70")}>{due}</span>}
        </span>

        <span className="num block whitespace-nowrap font-mono text-[15px] tracking-[0.16em]">•••• •••• •••• {card.last4 || "••••"}</span>

        <span className="flex items-end justify-between gap-3">
          <span className="min-w-0 flex-1">
            {pct != null && (
              <>
                <span className="block text-[10.5px] uppercase tracking-wider opacity-75">Limit used · {Math.round(pct * 100)}%</span>
                <span className="mt-1 block h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-white/25">
                  <span className={cn("block h-full rounded-full", pct > 0.7 ? "bg-[#ff7a7a]" : pct > 0.3 ? "bg-[#ffd166]" : "bg-[#7ee2b8]")} style={{ width: `${Math.max(2, pct * 100)}%` }} />
                </span>
              </>
            )}
          </span>
          <NetworkMark network={card.network} />
        </span>
      </span>
    </button>
  );
}

export function AddCardTile({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex aspect-[1.586] w-full flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-line-strong text-ink-2 transition-colors hover:border-brand hover:text-brand">
      <Plus className="h-6 w-6" aria-hidden />
      <span className="text-[14px] font-medium">Add a card</span>
    </button>
  );
}
