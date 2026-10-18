"use client";

import { CalendarClock, HandCoins, Landmark, Rocket, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { holdingColors, skinFor } from "@/lib/v2/card-skins";

export type EntityKind = "stock" | "fund" | "ipo" | "bank" | "wallet" | "card" | "person" | "loan" | "chit" | "saving";

/** "HDFC Bank" → HDFC, "Tata Motors" → TM, "INFY" → INFY, "Zomato" → ZO. */
export function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9& ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const w0 = words[0];
  if (w0.length <= 4 && w0 === w0.toUpperCase() && /[A-Z]/.test(w0)) return w0;
  if (words.length === 1) return w0.slice(0, 2).toUpperCase();
  return (w0[0] + words[1][0]).toUpperCase();
}

function hue(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 360;
}

const SIZE = { xs: "h-5 w-5 text-[8px]", sm: "h-7 w-7 text-[9.5px]", md: "h-9 w-9 text-[11px]", lg: "h-12 w-12 text-[13px]" };
const GLYPH: Partial<Record<EntityKind, LucideIcon>> = { loan: Landmark, chit: CalendarClock, ipo: Rocket, person: HandCoins };

/**
 * A small badge for anything in a list: stocks and funds get their initials on their fund-house / brand colours,
 * banks and wallets their bank's colours, cards a tiny card in the card's own colours, people a coloured monogram,
 * loans and chits an icon. (Drawn badges, not the companies' logos.)
 */
export function EntityIcon({ name, kind, issuer, color, size = "md", className }: { name: string; kind: EntityKind; issuer?: string | null; color?: string | null; size?: keyof typeof SIZE; className?: string }) {
  const box = cn("inline-flex shrink-0 select-none items-center justify-center font-bold tracking-tight", SIZE[size], className);
  if (kind === "card") {
    const skin = skinFor("credit", name, issuer, color);
    return (
      <span className={cn("relative inline-block shrink-0 overflow-hidden rounded-[5px] shadow-[0_2px_6px_-2px_rgba(0,0,0,0.45)]", size === "xs" ? "h-4 w-6" : size === "sm" ? "h-5 w-8" : size === "lg" ? "h-8 w-12" : "h-6 w-9", className)} style={{ background: skin.bg }} aria-hidden>
        <span className="absolute left-[18%] top-[30%] h-[28%] w-[22%] rounded-[2px] bg-gradient-to-br from-[#f3d27a] to-[#b8893a]" />
        <span className="absolute bottom-[14%] right-[10%] h-[18%] w-[30%] rounded-full" style={{ background: skin.accent, opacity: 0.85 }} />
      </span>
    );
  }
  if (kind === "bank" || kind === "wallet") {
    const skin = skinFor("debit", name, issuer, color);
    return (
      <span className={cn(box, "rounded-xl text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]")} style={{ background: skin.bg }} aria-hidden>
        {initials(issuer || name)}
      </span>
    );
  }
  if (kind === "stock" || kind === "fund" || kind === "saving") {
    const [a, b] = holdingColors(name, kind === "fund" ? "mutual_fund" : kind === "stock" ? "stock" : "other");
    return (
      <span className={cn(box, kind === "fund" ? "rounded-full" : "rounded-xl", "text-white")} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden>
        {initials(name)}
      </span>
    );
  }
  if (kind === "person") {
    const h = hue(name);
    return (
      <span className={cn(box, "rounded-full")} style={{ background: `hsl(${h} 70% 92%)`, color: `hsl(${h} 55% 32%)` }} aria-hidden>
        {initials(name)}
      </span>
    );
  }
  const Icon = GLYPH[kind] ?? Landmark;
  return (
    <span className={cn(box, "rounded-xl", kind === "ipo" ? "bg-future-soft text-future-ink" : kind === "chit" ? "bg-warn-soft text-warn" : "bg-surface-3 text-ink-2")} aria-hidden>
      <Icon className={size === "xs" ? "h-3 w-3" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </span>
  );
}
