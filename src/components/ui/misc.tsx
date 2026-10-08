"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Clock, MinusCircle, PauseCircle, SkipForward, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { EventStatus } from "@/lib/engine/events";

export function Panel({
  title,
  action,
  children,
  className,
  description,
  id,
  flush,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  id?: string;
  flush?: boolean;
}) {
  return (
    <section id={id} className={cn("rounded-2xl border border-line bg-surface", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn(flush ? "pt-3" : "px-4 pb-4 pt-3 sm:px-5 sm:pb-5")}>{children}</div>
    </section>
  );
}

const STATUS: Record<EventStatus, { label: string; icon: LucideIcon; cls: string }> = {
  planned: { label: "Planned", icon: CircleDashed, cls: "text-future-ink bg-future-soft" },
  due: { label: "Due today", icon: Clock, cls: "text-warn bg-warn-soft" },
  overdue: { label: "Overdue", icon: AlertTriangle, cls: "text-danger bg-danger-soft" },
  paid: { label: "Paid", icon: CheckCircle2, cls: "text-ok bg-ok-soft" },
  received: { label: "Received", icon: CheckCircle2, cls: "text-ok bg-ok-soft" },
  partial: { label: "Partly paid", icon: PauseCircle, cls: "text-warn bg-warn-soft" },
  skipped: { label: "Skipped", icon: SkipForward, cls: "text-ink-3 bg-surface-3" },
  cancelled: { label: "Already counted", icon: MinusCircle, cls: "text-ink-3 bg-surface-3" },
  adjusted: { label: "Paid (adjusted)", icon: CheckCircle2, cls: "text-ok bg-ok-soft" },
};

/** Status always carries an icon + text, never colour alone. */
export function StatusPill({ status, flowIn, className }: { status: EventStatus; flowIn?: boolean; className?: string }) {
  const s = STATUS[status];
  let label = s.label;
  if (flowIn && status === "overdue") label = "Not received";
  if (flowIn && status === "due") label = "Expected today";
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium", s.cls, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "brand" | "future" | "warn" | "danger"; className?: string }) {
  const tones = {
    neutral: "bg-surface-3 text-ink-2",
    brand: "bg-brand-soft text-brand-strong",
    future: "bg-future-soft text-future-ink",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium", tones[tone], className)}>{children}</span>;
}

export function Progress({ value, tone = "brand", className, label }: { value: number; tone?: "brand" | "future" | "warn" | "danger"; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { brand: "bg-brand", future: "bg-future", warn: "bg-warn", danger: "bg-danger" }[tone];
  const track = { brand: "bg-brand-soft", future: "bg-future-soft", warn: "bg-warn-soft", danger: "bg-danger-soft" }[tone];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full", track, className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn("h-full rounded-full transition-[width]", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
      {Icon && <Icon className="mb-3 h-7 w-7 text-ink-3" aria-hidden />}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13.5px] text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs: allTabs,
  value,
  onChange,
  className,
  hide = [],
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  /** Tabs to hide (e.g. advanced features in Simple mode). The active tab always stays visible. */
  hide?: T[];
}) {
  const tabs = allTabs.filter((t) => t.id === value || !hide.includes(t.id));
  return (
    <div className={cn("no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <div role="tablist" className="inline-flex min-w-full gap-1 border-b border-line sm:min-w-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative -mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] font-medium transition-colors",
              value === t.id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink-2",
            )}
          >
            {t.label}
            {t.count != null && t.count > 0 && <span className="num ml-1.5 rounded-full bg-surface-3 px-1.5 text-[11.5px] text-ink-2">{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("inline-flex rounded-xl bg-surface-3 p-1", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-lg font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-[12.5px]" : "px-3 py-1.5 text-[13.5px]",
            value === o.id ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-3", className)} />;
}

export function Dot({ color, className }: { color?: string | null; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", className)} style={{ background: color ?? "var(--ink-3)" }} aria-hidden />;
}

export function KV({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-[14px]", className)}>
      <span className="text-ink-2">{k}</span>
      <span className="num text-right font-medium text-ink">{v}</span>
    </div>
  );
}
