"use client";

import { CalendarClock, HandCoins, Landmark, Repeat, Rocket, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { holdingColors, skinFor } from "@/lib/v2/card-skins";
import { CardArt } from "./card-art";
import { useFinance } from "@/lib/finance";
import type { FinEvent } from "@/lib/engine/events";

export type EntityKind = "stock" | "fund" | "ipo" | "bank" | "wallet" | "card" | "person" | "loan" | "chit" | "saving" | "people" | "sip";

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
const GLYPH: Partial<Record<EntityKind, LucideIcon>> = { loan: Landmark, chit: CalendarClock, ipo: Rocket, person: HandCoins, people: Users, sip: Repeat };

/**
 * A small badge for anything in a list: stocks and funds get their initials on their fund-house / brand colours,
 * banks and wallets their bank's colours, cards a tiny card in the card's own colours, people a coloured monogram,
 * loans and chits an icon. (Drawn badges, not the companies' logos.)
 */
export function EntityIcon({ name, kind, issuer, color, size = "md", className }: { name: string; kind: EntityKind; issuer?: string | null; color?: string | null; size?: keyof typeof SIZE; className?: string }) {
  const box = cn("inline-flex shrink-0 select-none items-center justify-center font-bold tracking-tight", SIZE[size], className);
  if (kind === "card" || kind === "bank" || kind === "wallet") {
    const skin = skinFor(kind === "card" ? "credit" : "debit", name, issuer, color);
    return (
      <span
        className={cn("relative inline-block shrink-0 overflow-hidden rounded-[5px] shadow-[0_2px_5px_-1px_rgba(0,0,0,0.4),inset_0_0_0_0.5px_rgba(255,255,255,0.25)]", size === "xs" ? "h-4 w-[25px]" : size === "sm" ? "h-[22px] w-[35px]" : size === "lg" ? "h-[34px] w-[54px]" : "h-[26px] w-[41px]", className)}
        style={{ background: skin.bg }}
        aria-hidden
      >
        {skin.art ? <CardArt art={skin.art} /> : <span className="absolute bottom-[8%] right-[8%] text-[7px] font-bold leading-none text-white/90">{initials(issuer || name)}</span>}
        <span className="absolute left-[12%] top-[38%] h-[24%] w-[18%] rounded-[1.5px] bg-gradient-to-br from-[#fbe7a1] to-[#a87c2a]" />
      </span>
    );
  }
  if (kind === "stock" || kind === "fund" || kind === "saving") {
    const [a, b] = holdingColors(name, kind === "fund" ? "mutual_fund" : kind === "stock" ? "stock" : "other");
    return (
      <span
        className={cn(box, "relative overflow-hidden text-white shadow-[0_2px_6px_-2px_rgba(0,0,0,0.45),inset_0_0_0_1px_rgba(255,255,255,0.14)] [text-shadow:0_1px_1px_rgba(0,0,0,0.35)]", kind === "fund" ? "rounded-full" : "rounded-[30%]")}
        style={{ background: `linear-gradient(140deg, ${a} 0%, ${b} 100%)` }}
        aria-hidden
      >
        <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
        <span className="relative">{initials(name)}</span>
      </span>
    );
  }
  if (kind === "person") {
    const h = hue(name);
    return (
      <span className={cn(box, "rounded-full ring-1 ring-inset")} style={{ background: `linear-gradient(140deg, hsl(${h} 80% 93%), hsl(${h} 60% 84%))`, color: `hsl(${h} 55% 28%)`, ["--tw-ring-color" as string]: `hsl(${h} 50% 70% / 0.5)` }} aria-hidden>
        {initials(name)}
      </span>
    );
  }
  const Icon = GLYPH[kind] ?? Landmark;
  return (
    <span className={cn(box, "rounded-[30%] ring-1 ring-inset ring-black/5", kind === "ipo" || kind === "sip" ? "bg-future-soft text-future-ink" : kind === "chit" ? "bg-warn-soft text-warn" : kind === "people" ? "bg-ok-soft text-ok" : "bg-brand-soft text-brand")} aria-hidden>
      <Icon className={size === "xs" ? "h-3 w-3" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </span>
  );
}

/** The badge for a bill / EMI / SIP in a list: the card, loan, chit, fund or person it belongs to. */
export function EventIcon({ e, size = "md" }: { e: FinEvent; size?: keyof typeof SIZE }) {
  const { ds } = useFinance();
  const card = e.cardId ? ds.credit_cards.find((c) => c.id === e.cardId) : null;
  if (card) return <EntityIcon kind="card" name={card.name} issuer={card.issuer} color={card.color} size={size} />;
  if (e.investmentId) {
    const i = ds.investments.find((x) => x.id === e.investmentId);
    if (i) return <EntityIcon kind={i.type === "mutual_fund" ? "fund" : i.type === "stock" || i.type === "etf" ? "stock" : "saving"} name={i.name} size={size} />;
  }
  if (e.lendingId) {
    const l = ds.lendings.find((x) => x.id === e.lendingId);
    if (l) return <EntityIcon kind="person" name={l.person} size={size} />;
  }
  if (e.chitId) return <EntityIcon kind="chit" name={e.title} size={size} />;
  if (e.loanId) return <EntityIcon kind="loan" name={e.title} size={size} />;
  const acct = e.accountId ? ds.accounts.find((a) => a.id === e.accountId) : null;
  if (acct) return <EntityIcon kind={acct.type === "wallet" || acct.type === "cash" ? "wallet" : "bank"} name={acct.name} issuer={acct.institution} color={acct.color} size={size} />;
  return <EntityIcon kind="sip" name={e.title} size={size} />;
}

/** The badge for a recorded entry: the card it went on, or the bank account / wallet it came from. */
export function TxIcon({ cardId, accountId, size = "md" }: { cardId?: string | null; accountId?: string | null; size?: keyof typeof SIZE }) {
  const { ds } = useFinance();
  const card = cardId ? ds.credit_cards.find((c) => c.id === cardId) : null;
  if (card) return <EntityIcon kind="card" name={card.name} issuer={card.issuer} color={card.color} size={size} />;
  const a = accountId ? ds.accounts.find((x) => x.id === accountId) : null;
  if (a) return <EntityIcon kind={a.type === "wallet" || a.type === "cash" ? "wallet" : "bank"} name={a.name} issuer={a.institution} color={a.color} size={size} />;
  return <EntityIcon kind="sip" name="Entry" size={size} />;
}
