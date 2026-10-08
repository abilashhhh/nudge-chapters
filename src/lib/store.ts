"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type { Dataset, Preferences, Profile, RowOf, TableName } from "./types";
import { TABLES } from "./types";
import { newId, type Repo } from "./data/repo";
import { friendlyError } from "./errors";

type Status = "idle" | "loading" | "ready" | "error";

interface StoreState {
  status: Status;
  error: string | null;
  repo: Repo | null;
  ds: Dataset | null;
  setRepo(repo: Repo | null): void;
  load(): Promise<void>;
  add<T extends TableName>(table: T, row: Partial<RowOf<T>>): Promise<RowOf<T>>;
  addMany<T extends TableName>(table: T, rows: Partial<RowOf<T>>[]): Promise<RowOf<T>[]>;
  patch<T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<void>;
  updatePrefs(patch: Partial<Preferences>): Promise<void>;
}

const message = friendlyError;

function tableRows<T extends TableName>(ds: Dataset, t: T): RowOf<T>[] {
  return ds[t] as RowOf<T>[];
}

const byDateDesc = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

function withTable<T extends TableName>(ds: Dataset, t: T, rows: RowOf<T>[]): Dataset {
  const next = { ...ds, [t]: rows } as Dataset;
  if (t === "transactions") (next.transactions as RowOf<"transactions">[]).sort(byDateDesc);
  return next;
}

export const useStore = create<StoreState>((set, get) => ({
  status: "idle",
  error: null,
  repo: null,
  ds: null,

  setRepo(repo) {
    set({ repo, ds: null, status: repo ? "loading" : "idle", error: null });
  },

  async load() {
    const repo = get().repo;
    if (!repo) return;
    set({ status: get().ds ? "ready" : "loading", error: null });
    try {
      const ds = await repo.load();
      // Data saved before a table existed (older device data or backups) gets an empty list.
      for (const t of TABLES) if (!Array.isArray(ds[t])) (ds as unknown as Record<string, unknown[]>)[t] = [];
      // Newest first, whatever order the storage returned them in (lists page from the top).
      ds.transactions.sort(byDateDesc);
      set({ ds, status: "ready" });
    } catch (e) {
      // A failed background refresh keeps what's on screen; only a failed first load shows the error screen.
      if (get().ds) {
        set({ status: "ready" });
        toast.error(`Couldn't refresh: ${message(e)}`);
      } else set({ status: "error", error: message(e) });
    }
  },

  async add(table, row) {
    const { repo, ds } = get();
    if (!repo || !ds) throw new Error("Not ready");
    const full = { ...row, id: (row as { id?: string }).id ?? newId() } as RowOf<typeof table>;
    set({ ds: withTable(ds, table, [...tableRows(ds, table), full]) });
    try {
      const saved = await repo.insert(table, full);
      const cur = get().ds!;
      set({ ds: withTable(cur, table, tableRows(cur, table).map((r) => ((r as { id: string }).id === (full as { id: string }).id ? saved : r))) });
      return saved;
    } catch (e) {
      const cur = get().ds!;
      set({ ds: withTable(cur, table, tableRows(cur, table).filter((r) => (r as { id: string }).id !== (full as { id: string }).id)) });
      toast.error(`Couldn't save: ${message(e)}`);
      throw e;
    }
  },

  async addMany(table, rows) {
    const { repo, ds } = get();
    if (!repo || !ds) throw new Error("Not ready");
    const full = rows.map((r) => ({ ...r, id: (r as { id?: string }).id ?? newId() })) as RowOf<typeof table>[];
    try {
      const saved = await repo.insertMany(table, full);
      const cur = get().ds!;
      set({ ds: withTable(cur, table, [...tableRows(cur, table), ...saved]) });
      return saved;
    } catch (e) {
      toast.error(`Couldn't save: ${message(e)}`);
      throw e;
    }
  },

  async patch(table, id, patch) {
    const { repo, ds } = get();
    if (!repo || !ds) throw new Error("Not ready");
    const before = tableRows(ds, table).find((r) => (r as { id: string }).id === id);
    set({ ds: withTable(ds, table, tableRows(ds, table).map((r) => ((r as { id: string }).id === id ? { ...r, ...patch } : r))) });
    try {
      const saved = await repo.update(table, id, patch);
      const cur = get().ds!;
      set({ ds: withTable(cur, table, tableRows(cur, table).map((r) => ((r as { id: string }).id === id ? saved : r))) });
    } catch (e) {
      const cur = get().ds!;
      if (before) set({ ds: withTable(cur, table, tableRows(cur, table).map((r) => ((r as { id: string }).id === id ? before : r))) });
      toast.error(`Couldn't save: ${message(e)}`);
      throw e;
    }
  },

  async remove(table, id) {
    const { repo, ds } = get();
    if (!repo || !ds) throw new Error("Not ready");
    const before = ds;
    set({ ds: withTable(ds, table, tableRows(ds, table).filter((r) => (r as { id: string }).id !== id)) });
    try {
      await repo.remove(table, id);
      if (table === "credit_cards" || table === "investments") await get().load();
    } catch (e) {
      set({ ds: before });
      toast.error(`Couldn't delete: ${message(e)}`);
      throw e;
    }
  },

  async updateProfile(patch) {
    const { repo, ds } = get();
    if (!repo || !ds) throw new Error("Not ready");
    const before = ds.profile;
    set({ ds: { ...ds, profile: { ...ds.profile, ...patch } } });
    try {
      const saved = await repo.updateProfile(patch);
      set({ ds: { ...get().ds!, profile: saved } });
    } catch (e) {
      set({ ds: { ...get().ds!, profile: before } });
      toast.error(`Couldn't save settings: ${message(e)}`);
      throw e;
    }
  },

  async updatePrefs(patch) {
    const ds = get().ds;
    if (!ds) return;
    await get().updateProfile({ preferences: { ...ds.profile.preferences, ...patch } });
  },
}));

export function useDataset(): Dataset {
  const ds = useStore((s) => s.ds);
  if (!ds) throw new Error("Dataset not loaded");
  return ds;
}
