"use client";

import { cn } from "@/lib/cn";
import { useFinance } from "@/lib/finance";
import { formatCompact, formatMoney } from "@/lib/money";

/**
 * Formats an amount in the user's currency. Projected values get the violet
 * dotted "estimate" treatment; values can be masked globally for privacy.
 */
export function Money({
  value,
  projected,
  compact,
  sign,
  decimals,
  className,
  tone,
  currency,
}: {
  value: number;
  projected?: boolean;
  compact?: boolean;
  sign?: boolean;
  decimals?: boolean;
  className?: string;
  tone?: "auto" | "in" | "out";
  currency?: string;
}) {
  const { ctx, ds } = useFinance();
  const masked = !!ds.profile.preferences?.maskValues;
  const c = currency ? { ...ctx, currency } : ctx;
  const text = compact ? formatCompact(value, c) : formatMoney(value, c, { sign, decimals });
  const toneCls =
    tone === "in" ? "text-ok" : tone === "out" ? "text-ink" : tone === "auto" ? (value < 0 ? "text-danger" : "text-ink") : "";
  return (
    <span
      className={cn("num", projected && "projected", masked && "masked", !projected && toneCls, className)}
      title={projected ? "Estimate — based on your plans and assumptions" : undefined}
      aria-label={masked ? "Hidden amount" : undefined}
    >
      {text}
    </span>
  );
}

export function useMoneyFormat() {
  const { ctx } = useFinance();
  return {
    money: (n: number, opts?: { sign?: boolean; decimals?: boolean }) => formatMoney(n, ctx, opts),
    compact: (n: number) => formatCompact(n, ctx),
    ctx,
  };
}
