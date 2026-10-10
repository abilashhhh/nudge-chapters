"use client";

import { AllSections } from "@/components/all-sections";
import { ModeToggle } from "@/components/mode-toggle";
import { PageHeader } from "@/components/shell/app-shell";
import { useUI } from "@/lib/ui";
import { useViewMode } from "@/lib/view-mode";

export default function MorePage() {
  const { simple } = useViewMode();
  return (
    <>
      <PageHeader title={simple ? "Menu" : "All sections"} actions={<ModeToggle labels="always" />} />
      <AllSections withSettings />
      <button type="button" onClick={() => useUI.getState().setPalette(true)} className="mt-6 w-full rounded-2xl border border-dashed border-line-strong p-4 text-left text-[14px] text-ink-2">
        Search everything, or ask &ldquo;how much will I have by March 2028?&rdquo;
      </button>
    </>
  );
}
