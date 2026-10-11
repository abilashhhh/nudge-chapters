"use client";

import { AlertTriangle, Check, CircleDashed, Clock, Minus, PieChart, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/dates";
import { buildEvents, type FinEvent } from "@/lib/engine/events";
import { useFinance } from "@/lib/finance";
import type { CellStatus } from "@/lib/v2/grids";
import { Money } from "../money";

/** Page title + the one-line meaning shown under it (Version 2). */
export function V2PageHeader({ title, meaning, actions }: { title: string; meaning?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-[28px] font-semibold leading-tight sm:text-[32px]">{title}</h1>
        {meaning && <p className="mt-1 max-w-2xl text-[14px] text-ink-2">{meaning}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A summary tile: muted label, one amount, optional note. Taps through when given a link or action. */
export function StatTile({
  label,
  value,
  note,
  href,
  onClick,
  projected,
  tone,
  dark,
}: {
  label: ReactNode;
  value: number;
  note?: ReactNode;
  href?: string;
  onClick?: () => void;
  projected?: boolean;
  tone?: "auto" | "danger";
  dark?: boolean;
}) {
  const body = (
    <>
      <span className={cn("block text-[12.5px]", dark ? "opacity-75" : "text-ink-3")}>{label}</span>
      <Money
        value={value}
        projected={projected}
        tone={tone === "auto" ? "auto" : undefined}
        className={cn("display mt-0.5 block text-[20px] font-semibold leading-tight sm:text-[22px]", tone === "danger" && value > 0.5 && "text-danger", dark && "text-inherit")}
      />
      {note && <span className={cn("mt-0.5 block text-[11.5px]", dark ? "opacity-70" : "text-ink-3")}>{note}</span>}
    </>
  );
  const cls = cn(
    "block min-w-0 rounded-2xl border p-4 text-left transition-colors",
    dark ? "border-transparent bg-ink text-paper" : "border-line bg-surface",
    (href || onClick) && (dark ? "hover:opacity-95" : "hover:border-line-strong"),
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cn(cls, "w-full")}>
        {body}
      </button>
    );
  return <div className={cls}>{body}</div>;
}

export const STATUS_WORD: Record<CellStatus, string> = {
  paid: "Paid",
  due: "Due this week",
  late: "Late",
  upcoming: "Upcoming",
  skipped: "Skipped",
  partial: "Part paid",
};

const STATUS_ICON: Record<CellStatus, LucideIcon | null> = {
  paid: Check,
  due: Clock,
  late: AlertTriangle,
  upcoming: CircleDashed,
  skipped: Minus,
  partial: PieChart,
};

const STATUS_CLS: Record<CellStatus, string> = {
  paid: "text-ok",
  due: "text-warn",
  late: "text-danger",
  upcoming: "text-ink-3",
  skipped: "text-ink-3",
  partial: "text-warn",
};

export function StatusIcon({ status, incoming, className }: { status: CellStatus; incoming?: boolean; className?: string }) {
  const Icon = STATUS_ICON[status];
  if (!Icon) return null;
  const word = incoming && status === "paid" ? "Received" : incoming && status === "late" ? "Not received" : STATUS_WORD[status];
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", STATUS_CLS[status], className)} aria-label={word} role="img" />;
}

/** Status as icon + word (for lists and legends). */
export function StatusText({ status, incoming, className }: { status: CellStatus; incoming?: boolean; className?: string }) {
  const word = incoming && status === "paid" ? "Received" : incoming && status === "late" ? "Not received" : STATUS_WORD[status];
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-medium", STATUS_CLS[status], className)}>
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {word}
    </span>
  );
}

/** One consistent pill-chip group for ranges and filters. */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("h-8 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-colors", value === o.id ? "bg-ink text-paper" : "bg-surface-3/70 text-ink-2 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Engine events covering the given months (plus two months before, so an EMI billed in the first month is
 * still placed with its bill). Same call the rest of the app uses — just a wider window.
 */
export function useRangeEvents(months: string[]): FinEvent[] {
  const { ds, today, positions, assumptions } = useFinance();
  const first = months[0];
  const last = months.at(-1);
  return useMemo(() => {
    if (!first || !last) return [];
    return buildEvents(ds, {
      from: addMonths(startOfMonth(`${first}-01`), -2),
      to: endOfMonth(`${last}-01`),
      today,
      positions,
      scenario: assumptions.scenarios.base,
    });
  }, [ds, today, positions, assumptions, first, last]);
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Section({ title, action, children, className, id }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-20", className)}>
      {(title || action) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-[16px] font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
