"use client";

import { AppShell } from "@/components/shell/app-shell";
import { Bootstrap } from "@/components/shell/bootstrap";
import { FinanceProvider } from "@/lib/finance";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Bootstrap>
      <FinanceProvider>
        <AppShell>{children}</AppShell>
      </FinanceProvider>
    </Bootstrap>
  );
}
