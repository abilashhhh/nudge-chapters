"use client";

// The bank-SMS inbox in your database: what the phone has sent, and which messages became transactions.

import { create } from "zustand";
import { getSupabase, supabaseConfigured, SUPABASE_KEY, SUPABASE_URL } from "../data/supabase";
import type { SmsRow } from "./match";

export const INGEST_URL = `${SUPABASE_URL}/rest/v1/rpc/ingest_sms`;
export const INGEST_API_KEY = SUPABASE_KEY;

/** SMS import needs an account (the phone sends to your database); it isn't available in "on this device only" mode. */
export function smsAvailable(): boolean {
  try {
    return supabaseConfigured && localStorage.getItem("nudge:mode") !== "local";
  } catch {
    return false;
  }
}

interface SmsState {
  rows: SmsRow[];
  loaded: boolean;
  key: { created_at: string; last_used_at: string | null } | null;
  sheet: boolean;
  refresh(): Promise<void>;
  mark(id: string, status: SmsRow["status"], transactionId?: string | null): Promise<void>;
  createKey(): Promise<string>;
  removeKey(): Promise<void>;
  openSheet(open: boolean): void;
}

export const useSms = create<SmsState>((set, get) => ({
  rows: [],
  loaded: false,
  key: null,
  sheet: false,
  async refresh() {
    if (!smsAvailable()) return;
    try {
      const sb = getSupabase();
      const { data: s } = await sb.auth.getSession();
      if (!s.session) return;
      const [rows, key] = await Promise.all([
        sb.from("sms_inbox").select("id,sender,body,received_at,status,transaction_id").order("received_at", { ascending: false }).limit(200),
        sb.from("sms_keys").select("created_at,last_used_at").maybeSingle(),
      ]);
      set({ rows: (rows.data as SmsRow[] | null) ?? [], key: (key.data as SmsState["key"]) ?? null, loaded: true });
    } catch {
      /* offline: try again later */
    }
  },
  async mark(id, status, transactionId = null) {
    set({ rows: get().rows.map((r) => (r.id === id ? { ...r, status, transaction_id: transactionId } : r)) });
    try {
      await getSupabase().from("sms_inbox").update({ status, transaction_id: transactionId }).eq("id", id);
    } catch {
      /* stays marked here; saved next time */
    }
  },
  async createKey() {
    const { data, error } = await getSupabase().rpc("create_sms_key");
    if (error || typeof data !== "string") throw new Error(error?.message ?? "Couldn't make a key");
    await get().refresh();
    return data;
  },
  async removeKey() {
    await getSupabase().from("sms_keys").delete().not("user_id", "is", null);
    set({ key: null });
  },
  openSheet(open) {
    set({ sheet: open });
  },
}));
