import type { Metadata } from "next";
import { SetupLayoutClient } from "@/components/shell/setup-layout";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <SetupLayoutClient>{children}</SetupLayoutClient>;
}
