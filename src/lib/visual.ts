"use client";

import { useStore } from "./store";

/** Icon, emoji and animation preferences (Settings → Look & feel). Presentation only — never affects numbers. */
export function useVisual() {
  const v = useStore((s) => s.ds?.profile.preferences?.visual);
  return {
    emoji: v?.emoji ?? true,
    celebrations: v?.celebrations ?? true,
    spendIcons: v?.spendIcons ?? true,
    motion: v?.motion ?? "full",
  };
}

/** Sections the user hid in Settings. Hidden sections keep their data and still count in every calculation. */
export function useHidden() {
  const h = useStore((s) => s.ds?.profile.preferences?.hidden);
  const sections = new Set(h?.sections ?? []);
  const widgets = new Set(h?.widgets ?? []);
  return { sections, widgets, isHidden: (id: string) => sections.has(id) };
}
