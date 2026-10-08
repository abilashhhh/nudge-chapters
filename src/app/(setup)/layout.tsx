"use client";

import { Bootstrap } from "@/components/shell/bootstrap";
import { Editors } from "@/components/editors";
import { FinanceProvider } from "@/lib/finance";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Bootstrap requireOnboarded={false}>
      <FinanceProvider>
        {children}
        <Editors />
      </FinanceProvider>
    </Bootstrap>
  );
}
