import type { AuditEvent, Dataset, NetWorthSnapshot, Profile, RowOf, TableName } from "../types";

/** Storage backend. Implemented by Supabase (cloud, signed-in) and a local browser store (demo / offline). */
export interface Repo {
  kind: "supabase" | "local";
  userEmail?: string | null;
  load(): Promise<Dataset>;
  insert<T extends TableName>(table: T, row: RowOf<T>): Promise<RowOf<T>>;
  insertMany<T extends TableName>(table: T, rows: RowOf<T>[]): Promise<RowOf<T>[]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<RowOf<T>>): Promise<RowOf<T>>;
  remove(table: TableName, id: string): Promise<void>;
  updateProfile(patch: Partial<Profile>): Promise<Profile>;
  upsertSnapshot(s: NetWorthSnapshot): Promise<void>;
  audit(limit?: number): Promise<AuditEvent[]>;
  wipe(): Promise<void>;
  deleteAccount(): Promise<void>;
  signOut(): Promise<void>;
}

/** Tables in an order that satisfies foreign keys when inserting (reverse for deleting). */
export const INSERT_ORDER: TableName[] = [
  "accounts",
  "categories",
  "credit_cards",
  "card_statements",
  "goals",
  "investments",
  "investment_valuations",
  "loans",
  "chits",
  "lendings",
  "reserves",
  "recurring_rules",
  "event_overrides",
  "transactions",
  "net_worth_snapshots",
  "life_items",
];

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback (very old browsers)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
