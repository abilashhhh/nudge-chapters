"use client";

// The password vault's state. The key lives only in this module's memory while the vault is unlocked; locking
// (by hand, after inactivity, or when the app is hidden for a while) throws it and every decrypted entry away.
// Storage: your Supabase account when signed in (so it syncs across devices), this browser otherwise.
// Either way only salt, IVs and ciphertext are stored. The vault is kept out of backups, exports and the app's
// general dataset on purpose.

import { create } from "zustand";
import { getSupabase, supabaseConfigured } from "../data/supabase";
import { newId } from "../data/repo";
import { deriveKey, fromB64, importDataKey, KDF_ITERATIONS, newDataKey, open, randomBytes, seal, toB64, unwrapDataKey, wrapDataKey, type Sealed } from "./crypto";

export type VaultKind = "login" | "card" | "note";

export interface VaultEntry {
  kind: VaultKind;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  /** Cards */
  number?: string;
  expiry?: string;
  cvv?: string;
  favorite?: boolean;
  /** When the password last changed (ISO), for "old password" hints. */
  password_changed_at?: string;
}

export interface VaultItem {
  id: string;
  entry: VaultEntry;
  updated_at: string;
}

interface Meta {
  salt: string;
  iterations: number;
  /** The data key, sealed with the key from the master password. */
  check: Sealed;
}

interface StoredItem extends Sealed {
  id: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Storage backends

interface Backend {
  where: "cloud" | "device";
  getMeta(): Promise<Meta | null>;
  putMeta(m: Meta): Promise<void>;
  list(): Promise<StoredItem[]>;
  upsert(i: StoredItem): Promise<void>;
  remove(id: string): Promise<void>;
}

function cloud(): Backend {
  const sb = getSupabase();
  const fail = (e: { message: string } | null) => {
    if (e) throw new Error(/vault_/.test(e.message) && /does not exist|schema cache|could not find/i.test(e.message) ? "The password vault needs a database update on the server." : e.message);
  };
  return {
    where: "cloud",
    async getMeta() {
      const { data, error } = await sb.from("vault_keys").select("salt,iterations,check_iv,check_ct").maybeSingle();
      fail(error);
      return data ? { salt: data.salt, iterations: data.iterations, check: { iv: data.check_iv, ct: data.check_ct } } : null;
    },
    async putMeta(m) {
      const { data: s } = await sb.auth.getSession();
      const { error } = await sb.from("vault_keys").upsert({ user_id: s.session?.user.id, salt: m.salt, iterations: m.iterations, check_iv: m.check.iv, check_ct: m.check.ct }, { onConflict: "user_id" });
      fail(error);
    },
    async list() {
      const { data, error } = await sb.from("vault_items").select("id,iv,ct,updated_at").order("created_at", { ascending: true });
      fail(error);
      return (data ?? []) as StoredItem[];
    },
    async upsert(i) {
      const { error } = await sb.from("vault_items").upsert({ id: i.id, iv: i.iv, ct: i.ct });
      fail(error);
    },
    async remove(id) {
      const { data, error } = await sb.from("vault_items").delete().eq("id", id).select("id");
      fail(error);
      if (!data?.length) throw new Error("The server didn't remove it. Refresh and try again.");
    },
  };
}

const LOCAL_KEY = "nudge:vault:v1";
function device(): Backend {
  const read = (): { meta: Meta | null; items: StoredItem[] } => {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null") ?? { meta: null, items: [] };
    } catch {
      return { meta: null, items: [] };
    }
  };
  const write = (v: { meta: Meta | null; items: StoredItem[] }) => localStorage.setItem(LOCAL_KEY, JSON.stringify(v));
  return {
    where: "device",
    async getMeta() {
      return read().meta;
    },
    async putMeta(meta) {
      write({ ...read(), meta });
    },
    async list() {
      return read().items;
    },
    async upsert(i) {
      const v = read();
      write({ ...v, items: [...v.items.filter((x) => x.id !== i.id), { ...i, updated_at: new Date().toISOString() }] });
    },
    async remove(id) {
      const v = read();
      write({ ...v, items: v.items.filter((x) => x.id !== id) });
    },
  };
}

function backend(): Backend {
  let local = false;
  try {
    local = localStorage.getItem("nudge:mode") === "local";
  } catch {
    /* ignore */
  }
  return supabaseConfigured && !local ? cloud() : device();
}

// ---------------------------------------------------------------------------

/** Lock after this long with no taps or typing… */
export const IDLE_LOCK_MS = 5 * 60_000;
/** …or after the app has been in the background this long. */
export const HIDDEN_LOCK_MS = 60_000;

type Status = "loading" | "none" | "locked" | "unlocked" | "error";

interface VaultState {
  status: Status;
  error: string | null;
  where: "cloud" | "device";
  items: VaultItem[];
  /** Wrong master passwords in a row, and when you may try again. */
  failures: number;
  retryAt: number;
  load(): Promise<void>;
  setup(password: string): Promise<void>;
  unlock(password: string): Promise<boolean>;
  lock(): void;
  save(entry: VaultEntry, id?: string): Promise<string>;
  remove(id: string): Promise<void>;
  changePassword(current: string, next: string): Promise<boolean>;
}

// Kept outside the store so it's never serialised, logged or shown in dev tools state.
let KEY: CryptoKey | null = null;
let META: Meta | null = null;

export const useVault = create<VaultState>((set, get) => ({
  status: "loading",
  error: null,
  where: "device",
  items: [],
  failures: 0,
  retryAt: 0,

  async load() {
    const b = backend();
    set({ where: b.where });
    if (KEY && get().status === "unlocked") return;
    try {
      META = await b.getMeta();
      set({ status: META ? "locked" : "none", error: null });
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  async setup(password) {
    const b = backend();
    const salt = randomBytes(16);
    const kek = await deriveKey(password, salt, KDF_ITERATIONS);
    const raw = newDataKey();
    const meta: Meta = { salt: toB64(salt), iterations: KDF_ITERATIONS, check: await wrapDataKey(kek, raw) };
    await b.putMeta(meta);
    META = meta;
    KEY = await importDataKey(raw);
    raw.fill(0);
    set({ status: "unlocked", items: [], failures: 0, retryAt: 0 });
  },

  async unlock(password) {
    if (!META) await get().load();
    if (!META) return false;
    if (Date.now() < get().retryAt) return false;
    const kek = await deriveKey(password, fromB64(META.salt), META.iterations);
    const raw = await unwrapDataKey(kek, META.check);
    if (!raw) {
      const failures = get().failures + 1;
      // After 5 wrong tries, wait 30 s, then 60 s, 120 s… (on top of the slow key derivation itself).
      set({ failures, retryAt: failures >= 5 ? Date.now() + 30_000 * 2 ** (failures - 5) : 0 });
      return false;
    }
    const key = await importDataKey(raw);
    raw.fill(0);
    const stored = await backend().list();
    const items: VaultItem[] = [];
    for (const s of stored) {
      try {
        items.push({ id: s.id, entry: await open<VaultEntry>(key, s), updated_at: s.updated_at });
      } catch {
        /* an entry that doesn't decrypt is skipped rather than blocking the vault */
      }
    }
    KEY = key;
    set({ status: "unlocked", items, failures: 0, retryAt: 0 });
    return true;
  },

  lock() {
    KEY = null;
    set({ status: META ? "locked" : "none", items: [] });
  },

  async save(entry, id) {
    if (!KEY) throw new Error("The vault is locked");
    const itemId = id ?? newId();
    const sealed = await seal(KEY, entry);
    await backend().upsert({ id: itemId, ...sealed, updated_at: new Date().toISOString() });
    const now = new Date().toISOString();
    set({ items: id ? get().items.map((i) => (i.id === id ? { id, entry, updated_at: now } : i)) : [...get().items, { id: itemId, entry, updated_at: now }] });
    return itemId;
  },

  async remove(id) {
    await backend().remove(id);
    set({ items: get().items.filter((i) => i.id !== id) });
  },

  /** Re-wraps the data key with the new password. Entries don't change, so nothing can end up half-converted. */
  async changePassword(current, next) {
    if (!META) return false;
    const raw = await unwrapDataKey(await deriveKey(current, fromB64(META.salt), META.iterations), META.check);
    if (!raw) return false;
    const salt = randomBytes(16);
    const meta: Meta = { salt: toB64(salt), iterations: KDF_ITERATIONS, check: await wrapDataKey(await deriveKey(next, salt, KDF_ITERATIONS), raw) };
    raw.fill(0);
    await backend().putMeta(meta);
    META = meta;
    return true;
  },
}));
