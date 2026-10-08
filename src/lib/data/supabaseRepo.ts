import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, Dataset, NetWorthSnapshot, Profile, RowOf, TableName } from "../types";
import { INSERT_ORDER, type Repo } from "./repo";

const PAGE = 1000;

/** Strip fields the database owns. */
function clean<T extends object>(row: T): T {
  const r = { ...row } as Record<string, unknown>;
  delete r.created_at;
  delete r.updated_at;
  delete r.user_id;
  for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
  return r as T;
}

function asError(e: { message: string; details?: string | null; hint?: string | null } | null): Error {
  return new Error(e ? [e.message, e.details, e.hint].filter(Boolean).join(" — ") : "Unknown database error");
}

export class SupabaseRepo implements Repo {
  kind = "supabase" as const;
  userEmail: string | null;

  constructor(
    private sb: SupabaseClient,
    private userId: string,
    email?: string | null,
  ) {
    this.userEmail = email ?? null;
  }

  private async fetchAll<T>(table: TableName, order = "created_at"): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb.from(table).select("*").order(order, { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw asError(error);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async load(): Promise<Dataset> {
    let { data: profile, error } = await this.sb.from("profiles").select("*").eq("id", this.userId).maybeSingle();
    if (error) throw asError(error);
    if (!profile) {
      const ins = await this.sb.from("profiles").insert({ id: this.userId }).select("*").single();
      if (ins.error) throw asError(ins.error);
      profile = ins.data;
    }
    const tables = await Promise.all(INSERT_ORDER.map((t) => this.fetchAll(t)));
    const ds = { profile } as Dataset;
    INSERT_ORDER.forEach((t, i) => {
      (ds as unknown as Record<string, unknown>)[t] = tables[i];
    });
    ds.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return ds;
  }

  async insert<T extends TableName>(table: T, row: RowOf<T>): Promise<RowOf<T>> {
    const { data, error } = await this.sb.from(table).insert(clean(row)).select("*").single();
    if (error) throw asError(error);
    return data as RowOf<T>;
  }

  async insertMany<T extends TableName>(table: T, rows: RowOf<T>[]): Promise<RowOf<T>[]> {
    const out: RowOf<T>[] = [];
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await this.sb.from(table).insert(rows.slice(i, i + 500).map(clean)).select("*");
      if (error) throw asError(error);
      out.push(...((data ?? []) as RowOf<T>[]));
    }
    return out;
  }

  async update<T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>): Promise<RowOf<T>> {
    const body = clean(patch as object) as Record<string, unknown>;
    delete body.id;
    const { data, error } = await this.sb.from(table).update(body).eq("id", id).select("*").single();
    if (error) throw asError(error);
    return data as RowOf<T>;
  }

  async remove(table: TableName, id: string): Promise<void> {
    // Ask for the removed row back: if row-level security blocks the removal, Postgres reports
    // success with zero rows, and the record would silently reappear on the next refresh.
    const { data, error } = await this.sb.from(table).delete().eq("id", id).select("id");
    if (error) throw asError(error);
    if (!data?.length) throw new Error("The server didn't remove it (it may already be gone, or removal isn't allowed). Refresh and try again.");
  }

  async updateProfile(patch: Partial<Profile>): Promise<Profile> {
    const body = { ...patch } as Record<string, unknown>;
    delete body.id;
    delete body.created_at;
    delete body.updated_at;
    const { data, error } = await this.sb.from("profiles").update(body).eq("id", this.userId).select("*").single();
    if (error) throw asError(error);
    return data as Profile;
  }

  async upsertSnapshot(s: NetWorthSnapshot): Promise<void> {
    const body = { ...clean(s), user_id: this.userId } as Record<string, unknown>;
    delete body.id;
    const { error } = await this.sb.from("net_worth_snapshots").upsert(body, { onConflict: "user_id,date" });
    if (error) throw asError(error);
  }

  async audit(limit = 200): Promise<AuditEvent[]> {
    const { data, error } = await this.sb.from("audit_events").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw asError(error);
    return (data ?? []) as AuditEvent[];
  }

  async wipe(): Promise<void> {
    for (const t of [...INSERT_ORDER].reverse()) {
      const { error } = await this.sb.from(t).delete().eq("user_id", this.userId);
      if (error) throw asError(error);
    }
    await this.updateProfile({ onboarding_done: false, preferences: {}, assumptions: {} });
  }

  async deleteAccount(): Promise<void> {
    const { error } = await this.sb.rpc("delete_my_account");
    if (error) {
      if (/delete_my_account/.test(error.message) && /(find|exist)/i.test(error.message))
        throw new Error("Account deletion isn't switched on for this server yet. The site owner needs to run supabase/finish-setup.sql once.");
      throw asError(error);
    }
    await this.sb.auth.signOut();
  }

  async signOut(): Promise<void> {
    await this.sb.auth.signOut();
  }
}
