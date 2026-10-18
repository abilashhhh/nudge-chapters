"use client";

import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { skinFor, type Skin } from "@/lib/v2/card-skins";
import { CardArt } from "./card-art";
import type { Account, CreditCard } from "@/lib/types";

/** The network's mark, drawn (not the networks' logo files). */
function NetworkMark({ network, tier }: { network?: string | null; tier?: string }) {
  const n = (network ?? "").toLowerCase();
  let mark: ReactNode = null;
  if (n.includes("master"))
    mark = (
      <svg viewBox="0 0 44 28" className="h-[calc(28*var(--u))] w-[calc(44*var(--u))]" aria-label="Mastercard">
        <circle cx="15" cy="14" r="12" fill="#eb001b" />
        <circle cx="29" cy="14" r="12" fill="#f79e1b" />
        <path d="M22 4.3a12 12 0 0 1 0 19.4a12 12 0 0 1 0-19.4z" fill="#ff5f00" />
      </svg>
    );
  else if (n.includes("amex") || n.includes("american"))
    mark = (
      <span className="flex h-[calc(28*var(--u))] w-[calc(40*var(--u))] flex-col items-center justify-center rounded-[3px] bg-[#2e77bc] text-[length:calc(6.5*var(--u))] font-black leading-[1.05] tracking-tight text-white" aria-label="American Express">
        <span>AMERICAN</span>
        <span>EXPRESS</span>
      </span>
    );
  else if (n.includes("visa")) mark = <span className="text-[length:calc(22*var(--u))] font-black italic leading-none tracking-tight" aria-label="Visa">VISA</span>;
  else if (n.includes("rupay"))
    mark = (
      <span className="flex items-center text-[length:calc(16*var(--u))] font-black italic leading-none tracking-tight" aria-label="RuPay">
        RuPay
        <svg viewBox="0 0 10 12" className="ml-0.5 h-[calc(12*var(--u))] w-[calc(10*var(--u))]" aria-hidden>
          <path d="M0 0 L7 6 L0 12 Z" fill="#f47920" />
          <path d="M3 0 L10 6 L3 12 Z" fill="#00a651" opacity="0.9" />
        </svg>
      </span>
    );
  else if (network) mark = <span className="text-[length:calc(13*var(--u))] font-bold italic">{network}</span>;
  if (!mark) return null;
  return (
    <span className="flex shrink-0 flex-col items-end">
      {mark}
      {tier && <span className="mt-0.5 text-[length:calc(8.5*var(--u))] font-semibold uppercase tracking-[0.18em] opacity-80">{tier}</span>}
    </span>
  );
}

function Chip() {
  return (
    <svg viewBox="0 0 40 30" className="h-[calc(30*var(--u))] w-[calc(40*var(--u))] shrink-0 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]" aria-hidden>
      <defs>
        <linearGradient id="chipgold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe7a1" />
          <stop offset="0.5" stopColor="#d9b25a" />
          <stop offset="1" stopColor="#a87c2a" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="29" rx="5" fill="url(#chipgold)" stroke="#8a6420" strokeOpacity="0.5" />
      <path d="M0 10 H13 M0 20 H13 M27 10 H40 M27 20 H40 M13 0 V30 M27 0 V30 M13 15 H27" stroke="#7a5518" strokeOpacity="0.55" strokeWidth="1" fill="none" />
      <rect x="13" y="7" width="14" height="16" rx="3" fill="none" stroke="#7a5518" strokeOpacity="0.55" />
    </svg>
  );
}

function Contactless({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 20" className={cn("h-[calc(20*var(--u))] w-[calc(16*var(--u))]", className)} aria-hidden>
      {[3, 7, 11].map((r, i) => (
        <path key={r} d={`M${3 + i * 3.4} ${10 - r * 0.62} a ${r} ${r} 0 0 1 0 ${r * 1.24}`} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** The card's own pattern, drawn in its colours. */
function Motif({ skin }: { skin: Skin }) {
  const a = skin.accent;
  switch (skin.motif) {
    case "swoosh":
      return (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden>
          <path d="M-20 170 C 80 110, 170 220, 340 90 L 340 220 L -20 220 Z" fill="white" opacity="0.14" />
          <path d="M-20 200 C 90 150, 190 230, 340 140" stroke="white" strokeWidth="2" fill="none" opacity="0.35" />
        </svg>
      );
    case "smile":
      return (
        <svg className="absolute bottom-[22%] right-[6%] h-[22%] w-[42%]" viewBox="0 0 120 30" aria-hidden>
          <path d="M4 6 Q 60 34 112 8" stroke={a} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M104 2 L 116 8 L 106 14" stroke={a} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "lines":
      return <span className="absolute inset-0" style={{ backgroundImage: `repeating-linear-gradient(120deg, ${a}22 0 1px, transparent 1px 14px)` }} aria-hidden />;
    case "band":
      return (
        <>
          <span className="absolute inset-x-0 top-[58%] h-[13%]" style={{ background: a, opacity: 0.9 }} aria-hidden />
          <span className="absolute inset-x-0 top-[73%] h-[3%]" style={{ background: a, opacity: 0.5 }} aria-hidden />
        </>
      );
    case "metal":
      return (
        <>
          <span className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px)" }} aria-hidden />
          <span className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/30" aria-hidden />
        </>
      );
    case "neon":
      return (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden>
          <path d="M180 -10 Q 260 100 340 60" stroke={a} strokeWidth="3" fill="none" opacity="0.8" style={{ filter: `drop-shadow(0 0 6px ${a})` }} />
          <path d="M200 -10 Q 270 120 340 100" stroke={a} strokeWidth="1.5" fill="none" opacity="0.5" />
        </svg>
      );
    case "wave":
      return (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 200" preserveAspectRatio="none" aria-hidden>
          <path d="M0 130 C 60 100, 120 160, 190 125 S 290 90, 320 110 L 320 200 L 0 200 Z" fill="white" opacity="0.08" />
          <path d="M0 155 C 70 125, 140 185, 210 150 S 300 120, 320 140 L 320 200 L 0 200 Z" fill="black" opacity="0.12" />
        </svg>
      );
    case "orbs":
      return (
        <>
          <span className="absolute -right-12 -top-16 h-48 w-48 rounded-full opacity-25" style={{ background: a }} aria-hidden />
          <span className="absolute -bottom-20 left-[30%] h-44 w-44 rounded-full bg-black/20" aria-hidden />
        </>
      );
    case "grid":
      return <span className="absolute inset-0" style={{ backgroundImage: `radial-gradient(${a}33 1px, transparent 1.2px)`, backgroundSize: "12px 12px" }} aria-hidden />;
    default:
      return null;
  }
}

export interface PlasticProps {
  skin: Skin;
  /** Small caps line at the top: the bank or provider. */
  issuer: string;
  /** The card's / account's own name. */
  title: string;
  /** "Credit card", "Debit card", "Wallet"… */
  kindLabel: string;
  last4?: string | null;
  network?: string | null;
  /** Pill next to the chip. */
  badge?: ReactNode;
  badgeTone?: "late" | "soon" | "paid" | null;
  /** Bottom-left block (limit bar, balance…). */
  footer?: ReactNode;
  chip?: boolean;
  onClick?: () => void;
  ariaLabel: string;
  className?: string;
  index?: number;
}

/**
 * A plastic card: the card's colours and pattern, its own name in its own style, chip, contactless mark, network
 * and last digits. It tilts toward the pointer and a sheen passes over it (both off with reduced motion).
 */
export function Plastic({ skin, issuer, title, kindLabel, last4, network, badge, badgeTone, footer, chip = true, onClick, ariaLabel, className, index = 0 }: PlasticProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const tilt = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 12).toFixed(2)}deg`);
  };
  const reset = () => {
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  };
  const markCls = skin.markStyle === "italic" ? "italic font-bold" : skin.markStyle === "lower" ? "font-bold lowercase tracking-tight" : skin.markStyle === "spaced" ? "font-semibold uppercase tracking-[0.22em]" : "font-black uppercase tracking-tight";
  const badgeEl = badge && (
    <span className={cn("max-w-full truncate rounded-full bg-black/35 px-[calc(8*var(--u))] py-[calc(2*var(--u))] text-[length:calc(11.5*var(--u))] font-medium text-white backdrop-blur-sm", badgeTone === "late" && "bg-[#e5484d]/90", badgeTone === "soon" && "bg-[#d97706]/90", badgeTone === "paid" && "bg-[#15803d]/85")}>{badge}</span>
  );
  const shell = cn(
    "credit-card anim-rise group relative isolate block aspect-[1.586] w-full overflow-hidden rounded-[18px] text-left [container-type:inline-size] [--u:0.2941cqw] shadow-[0_18px_36px_-16px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,255,255,0.08)]",
    skin.ink === "light" ? "text-white" : "text-[#1d1d1f]",
    className,
  );
  if (skin.art) {
    const split = skin.art === "kotak";
    return (
      <button ref={ref} type="button" onClick={onClick} onPointerMove={tilt} onPointerLeave={reset} aria-label={ariaLabel} className={shell} style={{ background: skin.bg, animationDelay: `${index * 70}ms` } as CSSProperties}>
        <CardArt art={skin.art} />
        <span className="credit-card-sheen pointer-events-none absolute inset-0" aria-hidden />
        <span className="absolute left-[5%] top-[31%] flex max-w-[62%] items-center gap-[calc(10*var(--u))]">
          {chip && <Chip />}
          <Contactless className={cn("shrink-0 opacity-85", split && "text-[#1d1d1f]")} />
          {badgeEl}
        </span>
        {last4 && <span className={cn("num absolute left-[5%] top-[52%] whitespace-nowrap font-mono text-[length:calc(14*var(--u))] tracking-[0.18em] [text-shadow:0_1px_1px_rgba(0,0,0,0.25)] ", split && "[text-shadow:none]")}>•••• {last4}</span>}
        <span className="absolute inset-x-[5%] bottom-[7%] flex items-end justify-between gap-[calc(12*var(--u))]">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[length:calc(10.5*var(--u))] font-semibold uppercase tracking-[0.14em] opacity-90">{title}</span>
            {footer}
          </span>
          <span className={cn(split && "text-white")}>
            <NetworkMark network={network || skin.network} tier={skin.tier} />
          </span>
        </span>
      </button>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onPointerMove={tilt}
      onPointerLeave={reset}
      aria-label={ariaLabel}
      className={cn(shell, "p-[calc(18*var(--u))]")}
      style={{ background: skin.bg, animationDelay: `${index * 70}ms` } as CSSProperties}
    >
      <Motif skin={skin} />
      <span className="credit-card-sheen pointer-events-none absolute inset-0" aria-hidden />

      <span className="relative flex h-full flex-col justify-between">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[length:calc(10.5*var(--u))] font-semibold uppercase tracking-[0.16em] opacity-80">{issuer}</span>
            {skin.mark ? (
              <span className={cn("mt-0.5 block truncate text-[length:calc(19*var(--u))] leading-tight ", markCls)}>
                {skin.mark}
              </span>
            ) : (
              <span className="display mt-0.5 block truncate text-[length:calc(17*var(--u))] font-semibold leading-tight ">{title}</span>
            )}
          </span>
          <span className="shrink-0 text-[length:calc(9.5*var(--u))] font-medium uppercase tracking-wider opacity-70">{kindLabel}</span>
        </span>

        <span className="flex items-center gap-2.5">
          {chip && <Chip />}
          <Contactless className="shrink-0 opacity-85" />
          {badgeEl}
        </span>

        {last4 ? <span className="num block whitespace-nowrap font-mono text-[length:calc(15*var(--u))] tracking-[0.16em]">•••• {last4}</span> : <span aria-hidden />}

        <span className="flex items-end justify-between gap-3">
          <span className="min-w-0 flex-1">
            {skin.mark && <span className="block truncate text-[length:calc(11*var(--u))] font-medium opacity-80">{title}</span>}
            {footer}
          </span>
          <NetworkMark network={network || skin.network} tier={skin.tier} />
        </span>
      </span>
    </button>
  );
}

function UsedBar({ pct, label }: { pct: number; label: string }) {
  return (
    <>
      <span className="block text-[length:calc(10*var(--u))] uppercase tracking-wider opacity-75">{label}</span>
      <span className="mt-[calc(4*var(--u))] block h-[calc(6*var(--u))] w-full max-w-[calc(160*var(--u))] overflow-hidden rounded-full bg-current/20">
        <span className={cn("block h-full rounded-full", pct > 0.7 ? "bg-[#ff7a7a]" : pct > 0.3 ? "bg-[#ffd166]" : "bg-[#7ee2b8]")} style={{ width: `${Math.max(2, Math.min(1, pct) * 100)}%` }} />
      </span>
    </>
  );
}

export interface CardVisualProps {
  card: CreditCard;
  /** 0–1 of the limit in use. */
  used?: number;
  /** "Shared ₹1L limit" etc. */
  usedLabel?: string;
  due?: string | null;
  dueTone?: "late" | "soon" | "paid" | null;
  onClick?: () => void;
  className?: string;
  index?: number;
}

/** A credit card, drawn like the real one. */
export function CardVisual({ card, used, usedLabel, due, dueTone, onClick, className, index }: CardVisualProps) {
  const skin = skinFor("credit", card.name, card.issuer, card.color);
  const pct = used == null ? null : Math.max(0, Math.min(1, used));
  return (
    <Plastic
      skin={skin}
      issuer={(card.issuer ?? "Credit card").replace(/ \/ .*/, "")}
      title={card.name}
      kindLabel="Credit"
      last4={card.last4}
      network={card.network}
      badge={due}
      badgeTone={dueTone}
      footer={pct != null ? <UsedBar pct={pct} label={usedLabel ?? `Limit used · ${Math.round(pct * 100)}%`} /> : undefined}
      onClick={onClick}
      ariaLabel={`${card.name}${card.last4 ? ` ending ${card.last4}` : ""}${due ? `, ${due}` : ""}`}
      className={className}
      index={index}
    />
  );
}

/** A bank account as its debit card (or a wallet / cash as a card of its own). */
export function AccountVisual({ account, balance, onClick, className, index }: { account: Account; balance: ReactNode; onClick?: () => void; className?: string; index?: number }) {
  const skin = skinFor("debit", account.name, account.institution, account.color);
  const kind = account.type === "wallet" ? "Wallet" : account.type === "cash" ? "Cash" : "Debit";
  return (
    <Plastic
      skin={skin}
      issuer={account.institution || (account.type === "wallet" ? "Wallet" : account.type === "cash" ? "Cash" : "Bank")}
      title={account.name}
      kindLabel={kind}
      last4={account.card_last4 || account.last4}
      chip={account.type !== "cash"}
      footer={
        <>
          <span className="block text-[length:calc(10*var(--u))] uppercase tracking-wider opacity-75">Balance</span>
          <span className="num block text-[length:calc(18*var(--u))] font-semibold leading-tight">{balance}</span>
        </>
      }
      onClick={onClick}
      ariaLabel={`${account.name}, balance`}
      className={className}
      index={index}
    />
  );
}
