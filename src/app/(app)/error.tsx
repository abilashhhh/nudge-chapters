"use client";

import { CrashScreen } from "@/components/shell/crash-screen";

/** A screen inside the app crashed: the menu and bottom bar stay, and an update-related crash reloads itself. */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry?: () => void }) {
  return <CrashScreen error={error} retry={retry} where="screen" />;
}
