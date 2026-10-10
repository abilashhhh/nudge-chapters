"use client";

import { Layers, Sparkle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useViewMode } from "@/lib/view-mode";

/** Simple ⇄ Advanced switch. In the top bar it shrinks to icons on phones so the header never overflows. */
export function ModeToggle({ className, labels = "auto" }: { className?: string; labels?: "auto" | "always" }) {
  const { mode, setMode } = useViewMode();
  const opts = [
    { id: "simple" as const, label: "Simple", icon: Sparkle },
    { id: "advanced" as const, label: "Advanced", icon: Layers },
  ];
  return (
    <div role="radiogroup" aria-label="Look" className={cn("inline-flex shrink-0 rounded-xl bg-surface-3 p-0.5", className)}>
      {opts.map((o) => {
        const on = (mode === "advanced" ? "advanced" : "simple") === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.label}
            title={o.id === "simple" ? "Simple look — just the essentials" : "Advanced look — everything on show"}
            onClick={() => setMode(o.id)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] px-2 py-1.5 sm:px-2.5 text-[12.5px] font-medium transition-colors",
              on ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink",
            )}
          >
            <o.icon className="h-3.5 w-3.5" aria-hidden />
            <span className={cn(labels === "auto" && "hidden sm:inline")}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
