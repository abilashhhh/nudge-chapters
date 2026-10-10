"use client";

import { AllSections } from "@/components/all-sections";
import { PageHeader } from "@/components/shell/app-shell";
import { useUI } from "@/lib/ui";

export default function MorePage() {
  return (
    <>
      <PageHeader title="All sections" />
      <AllSections />
      <button type="button" onClick={() => useUI.getState().setPalette(true)} className="mt-6 w-full rounded-2xl border border-dashed border-line-strong p-4 text-left text-[14px] text-ink-2">
        Search everything, or ask &ldquo;how much will I have by March 2028?&rdquo;
      </button>
    </>
  );
}
