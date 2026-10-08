"use client";

import { useEffect } from "react";
import { withBase } from "@/lib/config";

/** Registers the service worker in production so Nudge Chapters can be installed as an app and opens offline. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") }).catch(() => undefined);
  }, []);
  return null;
}
