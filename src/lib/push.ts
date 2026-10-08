"use client";

// Alarm push notifications: registers this phone with the browser's push service and stores the
// subscription in Supabase. The `send-alarms` function (run every minute) then pushes due alarms,
// which reach the phone even when the app is closed or the screen is locked.

import { getSupabase, supabaseConfigured } from "./data/supabase";

/** Public VAPID key (safe to ship); the private half lives only on the server. */
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BOnldyKoQzwJW-7gLZwayCm-bPy9FPjwCGsM8Fa600zFLOYyPmt63uBxEfgy8dDTIvi29EWu3QY8sfkCzm8OQas";

function keyBytes(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export type PushResult = "on" | "denied" | "unsupported" | "signed-out" | "error";

/** Ask for permission (if needed) and register this device for alarm pushes. Safe to call repeatedly. */
export async function enableAlarmPush(): Promise<PushResult> {
  if (!pushSupported()) return "unsupported";
  if (!supabaseConfigured) return "signed-out";
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (!data.session) return "signed-out";
  const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (perm !== "granted") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) as BufferSource }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const { error } = await sb
      .from("push_subscriptions")
      .upsert({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: "endpoint" });
    return error ? "error" : "on";
  } catch {
    return "error";
  }
}
