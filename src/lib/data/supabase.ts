import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

let client: SupabaseClient | null = null;

/** Every request gives up after 20 s so screens never spin forever on a bad connection. */
const TIMEOUT_MS = 20_000;
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("Request timed out", "TimeoutError")), TIMEOUT_MS);
  const signals = [ctrl.signal, init?.signal].filter(Boolean) as AbortSignal[];
  const signal = signals.length > 1 && typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : ctrl.signal;
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer));
}

export function getSupabase(): SupabaseClient {
  if (!supabaseConfigured) throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "nudge-auth" },
      global: { fetch: fetchWithTimeout },
    });
  }
  return client;
}
