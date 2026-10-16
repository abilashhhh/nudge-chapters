"use client";

/**
 * There is one version of the app now (the five-section one). Kept as a tiny shim so older code paths that
 * still ask "which version?" get a single answer.
 */
export type AppVersion = 2;

export function useAppVersion() {
  return { version: 2 as const, v2: true as const };
}

export function currentAppVersion(): AppVersion {
  return 2;
}
