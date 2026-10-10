import type { Metadata } from "next";
import { AppLayoutClient } from "@/components/shell/app-layout";

// Your own finances: never shown in search results.
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutClient>{children}</AppLayoutClient>;
}
