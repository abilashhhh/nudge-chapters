"use client";

import { AlertTriangle, Check, ChevronLeft, CircleDashed, Clock, Minus, PieChart, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addMonths, endOfMonth, startOfMonth } from "@/lib/dates";
import { buildEvents, type FinEvent } from "@/lib/engine/events";
import { useFinance } from "@/lib/finance";
import type { CellStatus } from "@/lib/v2/grids";
import { Money } from "../money";

/** Sections reached from the bottom bar: on phones the bar already says where you are. */
const BAR_SECTIONS = ["/my-money", "/to-pay", "/savings", "/daily", "/menu"];

/**
 * Page title (Version 2). Menu pages get a back button to Menu. On phones, the bottom-bar sections show no
 * title at all (only their actions), so the content starts right at the top.
 */
export function V2PageHeader({ title, shortTitle, actions }: { title: string; shortTitle?: string; actions?: ReactNode }) {
  const path = (usePathname() ?? "/").replace(/\/+$/, "") || "/";
  const barSection = BAR_SECTIONS.includes(path);
  const back = path.startsWith("/menu/") ? "/menu" : null;
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3 lg:mb-5", barSection && !actions && "hidden lg:flex")}>
      <div className={cn("flex min-w-0 items-center gap-2", barSection && "hidden lg:flex")}>
        {back && (
          <Link href={back} aria-label="Back to Menu" className="no-print inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 hover:text-ink">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
        )}
        <h1 className="display truncate text-[22px] font-semibold leading-tight lg:text-[30px]">
          {shortTitle ? (
            <>
              <span className="sm:hidden">{shortTitle}</span>
              <span className="hidden sm:inline">{title}</span>
            </>
          ) : (
            title
          )}
        </h1>
      </div>
      {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
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
  tone?: "auto" | "pl" | "danger";
  dark?: boolean;
}) {
  const body = (
    <>
      <span className={cn("block truncate text-[12px] sm:text-[12.5px]", dark ? "opacity-75" : "text-ink-3")}>{label}</span>
      <Money
        value={value}
        projected={projected}
        tone={tone === "auto" || tone === "pl" ? tone : undefined}
        className={cn("display mt-0.5 block truncate text-[17px] font-semibold leading-tight sm:text-[22px]", tone === "danger" && value > 0.5 && "text-danger", dark && "text-inherit")}
      />
      {note && <span className={cn("mt-0.5 block truncate text-[11.5px]", dark ? "opacity-70" : "text-ink-3")}>{note}</span>}
    </>
  );
  const cls = cn(
    "block min-w-0 rounded-2xl border p-3 text-left transition-colors sm:p-4",
    dark ? "border-transparent bg-inverse text-on-inverse" : "border-line bg-surface",
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

/** Colour for an amount by its status: paid green, due this week amber, late red; upcoming stays plain. */
export const AMOUNT_CLS: Record<CellStatus, string> = {
  paid: "text-ok",
  due: "text-warn",
  late: "text-danger",
  upcoming: "",
  skipped: "text-ink-3 line-through",
  partial: "text-warn",
};

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
          className={cn("h-8 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-colors", value === o.id ? "bg-inverse text-on-inverse" : "bg-surface-3/70 text-ink-2 hover:text-ink")}
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
