"use client";

import { Bootstrap } from "@/components/shell/bootstrap";
import { Editors } from "@/components/editors";
import { FinanceProvider } from "@/lib/finance";

export function SetupLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <Bootstrap requireOnboarded={false}>
      <FinanceProvider>
        {children}
        <Editors />
      </FinanceProvider>
    </Bootstrap>
  );
}
