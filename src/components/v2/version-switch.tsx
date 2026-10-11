"use client";

import { Check, LayoutGrid, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { useAppVersion, VERSION_INFO, type AppVersion } from "@/lib/app-version";
import { Panel } from "../ui/misc";

function useSwitch() {
  const { version, setVersion } = useAppVersion();
  const router = useRouter();
  return {
    version,
    choose: async (v: AppVersion) => {
      if (v === version) return;
      await setVersion(v);
      router.push("/");
      toast.success(`Switched to ${VERSION_INFO[v].short}. Your data is the same in both — switch back any time in Settings.`);
    },
  };
}

/** Settings → App version: pick Version 1 (full app) or Version 2 (simple app). */
export function AppVersionPanel({ className }: { className?: string }) {
  const { version, choose } = useSwitch();
  return (
    <Panel
      title="App version"
      description="Choose how the app looks. Both versions use the same data and the same calculations — nothing is deleted when you switch."
      className={className}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="App version">
        {([1, 2] as const).map((v) => {
          const on = version === v;
          const Icon = v === 1 ? LayoutGrid : Sparkles;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => void choose(v)}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                on ? "border-ink bg-surface-2" : "border-line hover:border-line-strong",
              )}
            >
              <span className={cn("mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", on ? "bg-inverse text-on-inverse" : "bg-surface-3 text-ink-2")}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  {VERSION_INFO[v].name}
                  {on && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-ok-soft px-2 py-0.5 text-[11.5px] font-medium text-ok">
                      <Check className="h-3 w-3" aria-hidden /> In use
                    </span>
                  )}
                </span>
                <span className="mt-1 block text-[13px] text-ink-2">{VERSION_INFO[v].description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/** A small invitation shown in Version 1's Menu: try the simple version. */
export function TryVersion2Card() {
  const { version, choose } = useSwitch();
  if (version === 2) return null;
  return (
    <section aria-label="Try Version 2" className="mb-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-future-soft text-future-ink">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-[15px] font-semibold">Try Version 2 — the simple app</p>
          <p className="text-[13.5px] text-ink-2">Five sections (Home, My Money, To Pay, Savings, Menu) with month-by-month tables. Same data; switch back any time.</p>
        </div>
      </div>
      <button type="button" onClick={() => void choose(2)} className="h-10 shrink-0 rounded-xl bg-inverse px-4 text-[14px] font-medium text-on-inverse hover:opacity-90">
        Switch to Version 2
      </button>
    </section>
  );
}
