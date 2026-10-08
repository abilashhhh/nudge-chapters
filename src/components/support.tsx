"use client";

import { Coffee } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { APP_NAME, BMC_FLOATING, BMC_URL } from "@/lib/config";

/** Buy Me a Coffee button, styled to sit comfortably in the app (links to your BMC page). */
export function BmcButton({ className, size = "md", label = "Buy me a coffee" }: { className?: string; size?: "sm" | "md" | "lg"; label?: string }) {
  if (!BMC_URL) return null;
  const sizes = { sm: "h-9 px-3 text-[13px]", md: "h-11 px-4 text-[14.5px]", lg: "h-13 px-6 text-[16px]" };
  return (
    <a
      href={BMC_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl bg-[#ffdd00] font-semibold text-[#0d0c22] shadow-sm transition-transform hover:-translate-y-px hover:shadow",
        sizes[size],
        className,
      )}
    >
      <Coffee className="h-[1.15em] w-[1.15em]" aria-hidden />
      {label}
    </a>
  );
}

/** Small floating "Support" button (desktop), enabled with NEXT_PUBLIC_BMC_WIDGET=true. */
export function BmcFloating({ hidden }: { hidden?: boolean }) {
  if (!BMC_URL || !BMC_FLOATING || hidden) return null;
  return (
    <a
      href={BMC_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Support the developer on Buy Me a Coffee"
      className="no-print fixed bottom-6 left-6 z-30 hidden items-center gap-2 rounded-full bg-[#ffdd00] px-4 py-2.5 text-[13.5px] font-semibold text-[#0d0c22] shadow-panel transition-transform hover:-translate-y-0.5 lg:inline-flex"
    >
      <Coffee className="h-4 w-4" aria-hidden />
      Support
    </a>
  );
}

export function SupportNavLink({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/support" onClick={onClick} className="flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-ink-2 hover:bg-surface-3/70 hover:text-ink">
      <Coffee className="h-[18px] w-[18px]" aria-hidden />
      Support {APP_NAME}
    </Link>
  );
}
