// Recovery from version skew and crashes.
//
// After a deploy, a tab that was opened earlier still runs the old build. When it asks for a file of that build
// which is no longer online, React throws a "chunk load" error and the page would crash. These helpers spot such
// errors, reload the page once (fresh files, no data lost — everything is saved as you go), and record any other
// crash so it can be looked into.

import { getSupabase, supabaseConfigured } from "./data/supabase";
import { withBase } from "./config";

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

/** Errors that mean "a file of this app couldn't be fetched" — fixed by loading the current version. */
export function isLoadError(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  const text = `${err?.name ?? ""} ${err?.message ?? String(e ?? "")}`;
  return /ChunkLoadError|Loading (CSS )?chunk|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch RSC payload/i.test(text);
}

const RELOAD_KEY = "nudge:recover:reloaded";

/**
 * Reload to pick up the current version — at most once a minute, so a real outage can't loop.
 * Returns false when it already tried recently (show the error instead).
 */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* storage blocked: still reload once */
  }
  window.location.reload();
  return true;
}

/** The id of the build that's live right now, or null if it can't be told (offline, local builds). */
export async function liveBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`${withBase("/version.json")}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { id?: string };
    return typeof j.id === "string" ? j.id : null;
  } catch {
    return null;
  }
}

/** Keep a short record of a crash: in this browser, and in your account when signed in (for fixing it). */
export async function recordCrash(e: unknown, where: string): Promise<void> {
  const err = e as { name?: string; message?: string; stack?: string; digest?: string } | null;
  const row = {
    message: `${err?.name ?? "Error"}: ${err?.message ?? String(e)}`.slice(0, 1000),
    stack: (err?.stack ?? "").slice(0, 4000),
    url: typeof location !== "undefined" ? location.pathname + location.search : "",
    build: BUILD_ID,
    where,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "",
  };
  try {
    const list = JSON.parse(localStorage.getItem("nudge:crashes") || "[]") as unknown[];
    localStorage.setItem("nudge:crashes", JSON.stringify([{ ...row, at: new Date().toISOString() }, ...list].slice(0, 20)));
  } catch {
    /* ignore */
  }
  try {
    if (!supabaseConfigured || localStorage.getItem("nudge:mode") === "local") return;
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    if (!data.session) return;
    await sb.from("client_errors").insert(row);
  } catch {
    /* recording must never cause another error */
  }
}
