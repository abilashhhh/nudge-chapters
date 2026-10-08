"use client";

import type { ReactNode } from "react";
import { create } from "zustand";
import { cn } from "@/lib/cn";
import { Money } from "./money";
import { Sheet } from "./ui/sheet";

export interface ExplainLine {
  label: ReactNode;
  amount: number;
  hint?: ReactNode;
  projected?: boolean;
  indent?: boolean;
  onClick?: () => void;
}

interface ExplainState {
  open: boolean;
  title: string;
  intro?: ReactNode;
  lines: ExplainLine[];
  total?: { label: string; amount: number; projected?: boolean };
  footnote?: ReactNode;
  show(p: Omit<ExplainState, "open" | "show" | "close">): void;
  close(): void;
}

export const useExplain = create<ExplainState>((set) => ({
  open: false,
  title: "",
  lines: [],
  show: (p) => set({ ...p, open: true }),
  close: () => set({ open: false }),
}));

/** "Explain every number" (PRD §2): shows the lines that add up to a total. */
export function ExplainSheet() {
  const s = useExplain();
  return (
    <Sheet open={s.open} onClose={s.close} title={s.title} description={s.intro} size="sm">
      <ul className="divide-y divide-line">
        {s.lines.map((l, i) => (
          <li key={i}>
            <button
              type="button"
              disabled={!l.onClick}
              onClick={() => {
                if (l.onClick) {
                  s.close();
                  l.onClick();
                }
              }}
              className={cn("flex w-full items-start justify-between gap-4 py-2.5 text-left", l.indent && "pl-4", l.onClick && "hover:bg-surface-2")}
            >
              <span className="min-w-0">
                <span className={cn("block text-[14px]", l.indent ? "text-ink-2" : "font-medium text-ink")}>{l.label}</span>
                {l.hint && <span className="mt-0.5 block text-[12.5px] text-ink-3">{l.hint}</span>}
              </span>
              <Money value={l.amount} sign projected={l.projected} className="shrink-0 text-[14.5px] font-medium" />
            </button>
          </li>
        ))}
      </ul>
      {s.total && (
        <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink pt-3">
          <span className="text-[15px] font-semibold">{s.total.label}</span>
          <Money value={s.total.amount} projected={s.total.projected} className="display text-[22px] font-semibold" />
        </div>
      )}
      {s.footnote && <p className="mt-4 text-[12.5px] text-ink-3">{s.footnote}</p>}
    </Sheet>
  );
}
