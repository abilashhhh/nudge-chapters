"use client";

import { useStore } from "./store";

export type ViewMode = "simple" | "advanced";

/**
 * Simple vs Advanced look. Stored on the profile (`profile.mode`) so it follows you across devices.
 * Presentation only — every calculation, alert and number is the same in both.
 */
export function useViewMode() {
  const mode = useStore((s) => s.ds?.profile.mode) ?? "simple";
  const updateProfile = useStore((s) => s.updateProfile);
  return {
    mode,
    simple: mode !== "advanced",
    setMode: (m: ViewMode) => void updateProfile({ mode: m }),
  };
}
