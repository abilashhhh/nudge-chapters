"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { BUILD_ID, isLoadError, liveBuildId, recordCrash, reloadOnce } from "@/lib/recover";

/**
 * Keeps open tabs on the current version.
 * - When you come back to the app (or every 10 minutes), it checks which version is live. If a newer one is,
 *   it reloads right away when nothing is open; otherwise the next tap on a link loads the new version fully,
 *   and a small note offers to reload now.
 * - If loading a file still fails (a "chunk" error), it reloads once instead of crashing.
 */
export function UpdateWatcher() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || BUILD_ID === "dev") return;
    let stale = false;
    let told = false;

    const busy = () => {
      const a = document.activeElement as HTMLElement | null;
      const typing = !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
      return typing || !!document.querySelector('[role="dialog"]');
    };

    const check = async () => {
      if (stale) return;
      const live = await liveBuildId();
      if (!live || live === BUILD_ID) return;
      stale = true;
      if (document.visibilityState === "visible" && !busy()) {
        reloadOnce();
        return;
      }
      if (!told) {
        told = true;
        toast("A new version of the app is ready", { duration: 15_000, action: { label: "Reload", onClick: () => window.location.reload() } });
      }
    };

    // Once a newer version is live, the next in-app link loads it as a full page instead of a quick switch.
    const onClick = (e: MouseEvent) => {
      if (!stale || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target || a.origin !== location.origin) return;
      e.preventDefault();
      location.assign(a.href);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isLoadError(e.reason)) {
        if (!reloadOnce()) void recordCrash(e.reason, "load");
      }
    };
    const onError = (e: ErrorEvent) => {
      if (isLoadError(e.error ?? e.message)) {
        if (!reloadOnce()) void recordCrash(e.error ?? e.message, "load");
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), 10 * 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    document.addEventListener("click", onClick, true);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}
