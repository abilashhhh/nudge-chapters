"use client";

import { Wifi } from "lucide-react";
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { skinFor, type Skin } from "@/lib/v2/card-skins";
import type { Account, CreditCard } from "@/lib/types";

function NetworkMark({ network }: { network?: string | null }) {
  const n = (network ?? "").toLowerCase();
  if (n.includes("master"))
    return (
      <span className="relative flex h-6 w-10 items-center" aria-label="Mastercard">
        <span className="absolute left-0 h-6 w-6 rounded-full bg-[#eb001b]/90" />
        <span className="absolute left-4 h-6 w-6 rounded-full bg-[#f79e1b]/90 mix-blend-screen" />
      </span>
    );
  if (n.includes("amex") || n.includes("american"))
    return <span className="rounded-[3px] bg-white/90 px-1.5 py-0.5 text-[10px] font-black tracking-tight text-[#0b4fa3]">AMEX</span>;
  const label = n.includes("visa") ? "VISA" : n.includes("rupay") ? "RuPay" : n.includes("diners") ? "Diners Club" : network || "";
  return <span className={cn("font-bold italic tracking-wide", label === "VISA" ? "text-[20px]" : "text-[13px]")}>{label}</span>;
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
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      onPointerMove={tilt}
      onPointerLeave={reset}
      aria-label={ariaLabel}
      className={cn("credit-card anim-rise group relative isolate block aspect-[1.586] w-full overflow-hidden rounded-[18px] p-4 text-left shadow-[0_14px_30px_-12px_rgba(0,0,0,0.55)] sm:p-5", skin.ink === "light" ? "text-white" : "text-[#111]", className)}
      style={{ background: skin.bg, animationDelay: `${index * 70}ms` } as CSSProperties}
    >
      <Motif skin={skin} />
      <span className="credit-card-sheen pointer-events-none absolute inset-0" aria-hidden />

      <span className="relative flex h-full flex-col justify-between">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-80">{issuer}</span>
            {skin.mark ? (
              <span className={cn("mt-0.5 block truncate text-[19px] leading-tight sm:text-[21px]", markCls)}>
                {skin.mark}
              </span>
            ) : (
              <span className="display mt-0.5 block truncate text-[17px] font-semibold leading-tight sm:text-[19px]">{title}</span>
            )}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <Wifi className="h-5 w-5 rotate-90 opacity-80" aria-hidden />
            <span className="text-[9.5px] font-medium uppercase tracking-wider opacity-70">{kindLabel}</span>
          </span>
        </span>

        <span className="flex items-center gap-3">
          {chip && (
            <span className="relative h-7 w-9 shrink-0 rounded-md bg-gradient-to-br from-[#f5d77a] to-[#b8902f] shadow-inner" aria-hidden>
              <span className="absolute inset-x-1 top-1/2 h-px bg-black/25" />
              <span className="absolute inset-y-1 left-1/2 w-px bg-black/25" />
              <span className="absolute inset-[5px] rounded-[3px] border border-black/20" />
            </span>
          )}
          {badge && (
            <span className={cn("truncate rounded-full bg-black/30 px-2 py-0.5 text-[11.5px] font-medium backdrop-blur-sm", badgeTone === "late" && "bg-[#ff4d4f]/85", badgeTone === "soon" && "bg-[#f59e0b]/85", badgeTone === "paid" && "bg-[#16a34a]/75")}>{badge}</span>
          )}
        </span>

        <span className="flex items-baseline justify-between gap-2">
          <span className="num block whitespace-nowrap font-mono text-[15px] tracking-[0.16em]">•••• •••• •••• {last4 || "••••"}</span>
        </span>

        <span className="flex items-end justify-between gap-3">
          <span className="min-w-0 flex-1">
            {skin.mark && <span className="block truncate text-[11px] font-medium opacity-80">{title}</span>}
            {footer}
          </span>
          <NetworkMark network={network} />
        </span>
      </span>
    </button>
  );
}

function UsedBar({ pct, label }: { pct: number; label: string }) {
  return (
    <>
      <span className="block text-[10px] uppercase tracking-wider opacity-75">{label}</span>
      <span className="mt-1 block h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-white/25">
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
          <span className="block text-[10px] uppercase tracking-wider opacity-75">Balance</span>
          <span className="num block text-[18px] font-semibold leading-tight">{balance}</span>
        </>
      }
      onClick={onClick}
      ariaLabel={`${account.name}, balance`}
      className={className}
      index={index}
    />
  );
}
