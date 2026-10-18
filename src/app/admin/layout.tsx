import type { Metadata } from "next";

// The admin site: kept out of search engines and away from the app's shell.
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
