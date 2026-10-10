import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in or create a free account",
  description: "Sign in to Nudge Chapters, create a free account, or try the demo with sample data — no sign-up needed.",
  alternates: { canonical: "/login/" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
