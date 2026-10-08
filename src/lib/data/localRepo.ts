// Browser-only storage used for the demo and when no Supabase project is configured.

import { todayISO } from "../dates";
import type { AuditEvent, Dataset, NetWorthSnapshot, Profile, RowOf, TableName } from "../types";
import { TABLES } from "../types";
import { buildDemoDataset, DEMO_USER_ID } from "./demo";
import { newId, type Repo } from "./repo";

const KEY = "kosh:local:dataset:v1";
const AUDIT_KEY = "kosh:local:audit:v1";

function emptyDataset(): Dataset {
  const ds = {
    profile: {
      id: DEMO_USER_ID,
      name: "",
      country: "IN",
      currency: "INR",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      retirement_age: 60,
      life_expectancy: 85,
      mode: "simple",
      onboarding_done: false,
      assumptions: {},
      preferences: {},
      fx_rates: {},
    },
  } as Dataset;
  for (const t of TABLES) (ds as unknown as Record<string, unknown[]>)[t] = [];
  return ds;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app keeps working in memory for this session.
  }
}

export class LocalRepo implements Repo {
  kind = "local" as const;
  userEmail = null;
  private ds: Dataset;

  constructor(seed: "demo" | "empty" | "existing" = "existing") {
    const existing = read<Dataset>(KEY);
    if (seed === "existing" && existing) this.ds = existing;
    else if (seed === "demo") this.ds = buildDemoDataset(todayISO("Asia/Kolkata"));
    else this.ds = existing && seed === "existing" ? existing : emptyDataset();
    for (const t of TABLES) {
      const rec = this.ds as unknown as Record<string, unknown[]>;
      if (!Array.isArray(rec[t])) rec[t] = [];
    }
    this.persist();
  }

  static hasData(): boolean {
    return read(KEY) != null;
  }

  static clear() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(AUDIT_KEY);
    } catch {
      /* ignore */
    }
  }

  private persist() {
    write(KEY, this.ds);
  }

  private log(table: string, action: AuditEvent["action"], id: string | undefined, oldData: unknown, newData: unknown) {
    const list = read<AuditEvent[]>(AUDIT_KEY) ?? [];
    list.unshift({
      id: newId(),
      table_name: table,
      record_id: id ?? null,
      action,
      old_data: (oldData as Record<string, unknown>) ?? null,
      new_data: (newData as Record<string, unknown>) ?? null,
      created_at: new Date().toISOString(),
    });
    write(AUDIT_KEY, list.slice(0, 500));
  }

  private rows<T extends TableName>(t: T): RowOf<T>[] {
    return (this.ds as unknown as Record<string, RowOf<T>[]>)[t];
  }

  async load(): Promise<Dataset> {
    return structuredClone(this.ds);
  }

  async insert<T extends TableName>(table: T, row: RowOf<T>): Promise<RowOf<T>> {
    const now = new Date().toISOString();
    const full = { ...row, id: (row as { id?: string }).id || newId(), created_at: now, updated_at: now } as RowOf<T>;
    this.rows(table).push(full);
    this.persist();
    if (table !== "net_worth_snapshots") this.log(table, "insert", (full as { id: string }).id, null, full);
    return structuredClone(full);
  }

  async insertMany<T extends TableName>(table: T, rows: RowOf<T>[]): Promise<RowOf<T>[]> {
    const out: RowOf<T>[] = [];
    for (const r of rows) out.push(await this.insert(table, r));
    return out;
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>): Promise<RowOf<T>> {
    const list = this.rows(table) as (RowOf<T> & { id: string })[];
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("That record no longer exists.");
    const old = list[idx];
    const next = { ...old, ...patch, id, updated_at: new Date().toISOString() };
    list[idx] = next;
    this.persist();
    this.log(table, "update", id, old, next);
    return structuredClone(next);
  }

  async remove(table: TableName, id: string): Promise<void> {
    const list = this.rows(table) as { id: string }[];
    const idx = list.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const [old] = list.splice(idx, 1);
    // Mirror the database's ON DELETE behaviour for the most important relations.
    if (table === "credit_cards") this.ds.card_statements = this.ds.card_statements.filter((s) => s.card_id !== id);
    if (table === "investments") this.ds.investment_valuations = this.ds.investment_valuations.filter((v) => v.investment_id !== id);
    this.persist();
    this.log(table, "delete", id, old, null);
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    this.ds.profile = { ...this.ds.profile, ...patch };
    this.persist();
    return structuredClone(this.ds.profile);
  }

  async upsertSnapshot(s: NetWorthSnapshot): Promise<void> {
    const list = this.ds.net_worth_snapshots;
    const idx = list.findIndex((x) => x.date === s.date);
    if (idx >= 0) list[idx] = { ...list[idx], ...s, id: list[idx].id };
    else list.push({ ...s, id: s.id || newId() });
    this.persist();
  }

  async audit(limit = 200): Promise<AuditEvent[]> {
    return (read<AuditEvent[]>(AUDIT_KEY) ?? []).slice(0, limit);
  }

  async wipe(): Promise<void> {
    const profile = { ...this.ds.profile, onboarding_done: false, preferences: {}, assumptions: {} };
    this.ds = emptyDataset();
    this.ds.profile = profile;
    this.persist();
  }

  async deleteAccount(): Promise<void> {
    LocalRepo.clear();
    this.ds = emptyDataset();
  }

  async signOut(): Promise<void> {
    /* nothing to do */
  }
}
