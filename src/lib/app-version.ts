"use client";

import { useStore } from "./store";

export type AppVersion = 1 | 2;

export const VERSION_INFO: Record<AppVersion, { name: string; short: string; description: string }> = {
  1: {
    name: "Version 1 — Full app",
    short: "Version 1",
    description: "Every screen and tool: Today, Plan, Chapters, Money, Cash flow, Budgets, Assets, Liabilities, Future, Calendar and Reports.",
  },
  2: {
    name: "Version 2 — Simple app",
    short: "Version 2",
    description: "Five sections — Home, My Money, To Pay, Savings and Menu — with month-by-month tables and plain words.",
  },
};

/**
 * Which version of the app to show (Settings → App version). Stored in the synced profile preferences,
 * so it follows you across devices. Presentation only: both versions read the same data and the same
 * money engine, so every number is identical.
 */
export function useAppVersion() {
  const raw = useStore((s) => s.ds?.profile.preferences?.appVersion);
  const updatePrefs = useStore((s) => s.updatePrefs);
  const version: AppVersion = raw === 2 ? 2 : 1;
  return {
    version,
    v2: version === 2,
    setVersion: (v: AppVersion) => updatePrefs({ appVersion: v }),
  };
}

/** Non-hook read, for code outside React render. */
export function currentAppVersion(): AppVersion {
  return useStore.getState().ds?.profile.preferences?.appVersion === 2 ? 2 : 1;
}
