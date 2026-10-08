// Import / export (PRD §27): JSON backup & restore, CSV/Excel export, and
// transaction import with column mapping, validation and duplicate detection.

import Papa from "papaparse";
import { toISO } from "../dates";
import { parseAmount } from "../money";
import type { Dataset, ISODate, Profile, TableName, Transaction } from "../types";
import { TABLES } from "../types";
import { INSERT_ORDER, newId, type Repo } from "./repo";

export interface Backup {
  app: "kosh";
  version: 1;
  exported_at: string;
  profile: Partial<Profile>;
  tables: Partial<Record<TableName, Record<string, unknown>[]>>;
}

export function makeBackup(ds: Dataset): Backup {
  const tables: Backup["tables"] = {};
  for (const t of TABLES) tables[t] = (ds[t] as unknown as Record<string, unknown>[]).map(({ user_id: _u, ...r }) => r);
  const { id: _id, ...profile } = ds.profile;
  return { app: "kosh", version: 1, exported_at: new Date().toISOString(), profile, tables };
}

const FK_FIELDS = [
  "account_id", "to_account_id", "card_id", "statement_id", "loan_id", "chit_id", "investment_id", "lending_id",
  "rule_id", "payment_account_id", "sip_account_id", "goal_id", "source_id",
];
const FK_ARRAYS = ["linked_account_ids", "linked_investment_ids"];

/** Restore a backup into the current repo. Every id is remapped, so a backup can be restored into any account. */
export async function restoreBackup(repo: Repo, backup: Backup, onProgress?: (msg: string) => void, existing?: Dataset): Promise<void> {
  if (backup?.app !== "kosh" || !backup.tables) throw new Error("This file isn't a Kosh backup.");
  const map = new Map<string, string>();
  for (const t of INSERT_ORDER) for (const r of backup.tables[t] ?? []) if (typeof r.id === "string") map.set(r.id, newId());
  const remap = (v: unknown) => (typeof v === "string" && map.has(v) ? map.get(v)! : v);
  for (const t of INSERT_ORDER) {
    const rows = (backup.tables[t] ?? []).map((r) => {
      const out: Record<string, unknown> = { ...r, id: map.get(r.id as string) ?? newId() };
      delete out.created_at;
      delete out.updated_at;
      delete out.user_id;
      for (const f of FK_FIELDS) if (f in out) out[f] = remap(out[f]);
      for (const f of FK_ARRAYS) if (Array.isArray(out[f])) out[f] = (out[f] as unknown[]).map(remap);
      return out;
    });
    const filtered =
      t === "categories" && existing
        ? rows.filter((r) => !existing.categories.some((c) => c.kind === r.kind && c.name.toLowerCase() === String(r.name).toLowerCase()))
        : rows;
    if (!filtered.length) continue;
    onProgress?.(`Restoring ${t.replace(/_/g, " ")} (${filtered.length})`);
    if (t === "net_worth_snapshots") {
      for (const r of filtered) await repo.upsertSnapshot(r as never);
    } else {
      await repo.insertMany(t, filtered as never);
    }
  }
  const { id: _i, created_at: _c, updated_at: _u, ...profile } = backup.profile as Profile;
  await repo.updateProfile({ ...profile, onboarding_done: true });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJSON(data: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

function flatten(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "user_id") continue;
    out[k] = Array.isArray(v) ? v.join("|") : v && typeof v === "object" ? JSON.stringify(v) : v;
  }
  return out;
}

export function toCSV(rows: Record<string, unknown>[]): string {
  return Papa.unparse(rows.map(flatten));
}

export function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  downloadBlob(new Blob(["﻿" + toCSV(rows)], { type: "text/csv;charset=utf-8" }), filename);
}

/** All tables as one Excel workbook (a sheet per table). */
export async function downloadExcel(ds: Dataset, filename: string) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const sheets = TABLES.filter((t) => (ds[t] as unknown[]).length > 0).map((t) => {
    const rows = (ds[t] as unknown as Record<string, unknown>[]).map(flatten);
    const headers = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set<string>()));
    const data = [
      headers.map((h) => ({ value: h, fontWeight: "bold" as const })),
      ...rows.map((r) => headers.map((h) => {
        const v = r[h];
        return v == null || v === "" ? null : typeof v === "number" || typeof v === "boolean" ? v : String(v);
      })),
    ];
    return { data, sheet: t.replace(/_/g, " ").slice(0, 31), stickyRowsCount: 1 };
  });
  if (!sheets.length) throw new Error("There's nothing to export yet.");
  const blob = await writeExcelFile(sheets as never).toBlob();
  downloadBlob(blob, filename);
}

// ---------------------------------------------------------------------------
// Transaction import
// ---------------------------------------------------------------------------

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export async function parseFile(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = (await readSheet(file)) as unknown[][];
    const cells = data.map((r) => r.map((c) => (c instanceof Date ? toISO(c) : c == null ? "" : String(c))));
    const headerIdx = cells.findIndex((r) => r.filter((c) => c.trim()).length >= 2);
    return { headers: cells[headerIdx] ?? [], rows: cells.slice(headerIdx + 1).filter((r) => r.some((c) => c.trim())) };
  }
  const text = await file.text();
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const cells = res.data;
  const headerIdx = cells.findIndex((r) => r.filter((c) => String(c).trim()).length >= 2);
  return { headers: (cells[headerIdx] ?? []).map(String), rows: cells.slice(headerIdx + 1).map((r) => r.map(String)) };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

/** Parse common bank-statement date formats. `dayFirst` decides 03/04/2026 (default: 3 April). */
export function parseDate(input: string, dayFirst = true): ISODate | null {
  const s = input.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return mk(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return dayFirst ? mk(y, +m[2], +m[1]) : mk(y, +m[1], +m[2]);
  }
  m = s.match(/^(\d{1,2})[\s/-]([A-Za-z]{3,9})[\s/,-]*(\d{2,4})$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return mon ? mk(y, mon, +m[1]) : null;
  }
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    return mon ? mk(+m[3], mon, +m[2]) : null;
  }
  return null;
}

function mk(y: number, m: number, d: number): ISODate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return toISO(dt);
}

export interface ImportMapping {
  date: number;
  description: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  category: number | null;
  accountId: string;
  dayFirst: boolean;
  /** When a single amount column is used: are positive numbers money in or out? */
  positiveIs: "income" | "expense";
}

export interface ImportRow {
  line: number;
  ok: boolean;
  error?: string;
  duplicate?: boolean;
  tx?: Transaction;
}

function hashOf(parts: (string | number | null | undefined)[]): string {
  const s = parts.map((p) => String(p ?? "")).join("|").toLowerCase();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619);
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519);
  }
  return `imp_${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}

function guessCategory(desc: string, income: boolean): string {
  const d = desc.toLowerCase();
  if (income) {
    if (/salary|sal cr|payroll/.test(d)) return "Salary";
    if (/interest|int\.? cr|dividend/.test(d)) return "Interest & dividends";
    return "Other income";
  }
  const rules: [RegExp, string][] = [
    [/swiggy|zomato|restaurant|cafe|domino|mcdonald|starbucks|kfc/, "Food & dining"],
    [/bigbasket|blinkit|zepto|dmart|grocer|supermarket|more retail|reliance fresh|instamart/, "Groceries"],
    [/petrol|fuel|indian oil|iocl|hpcl|bpcl|shell/, "Fuel"],
    [/uber|ola|rapido|metro|irctc|redbus|auto/, "Transport"],
    [/amazon|flipkart|myntra|ajio|nykaa|meesho/, "Shopping"],
    [/netflix|spotify|prime|hotstar|youtube|icloud|google one|apple\.com/, "Subscriptions"],
    [/airtel|jio|vodafone|vi |bsnl|act fibernet|broadband/, "Mobile & internet"],
    [/electric|bescom|tneb|msedcl|water|gas|lpg|indane/, "Utilities"],
    [/rent|nobroker/, "Rent"],
    [/pharma|apollo|hospital|clinic|medplus|1mg|practo/, "Health"],
    [/insurance|lic|policybazaar/, "Insurance"],
    [/indigo|air india|vistara|makemytrip|goibibo|oyo|hotel|airbnb/, "Travel"],
    [/atm|cash wd/, "Other"],
  ];
  for (const [re, cat] of rules) if (re.test(d)) return cat;
  return "Other";
}

export function buildImport(table: ParsedTable, map: ImportMapping, existing: Transaction[]): ImportRow[] {
  const known = new Set(existing.map((t) => t.import_hash).filter(Boolean) as string[]);
  const fuzzy = new Set(existing.map((t) => `${t.date}|${t.amount}|${t.account_id}`));
  const seen = new Set<string>();
  return table.rows.map((r, i) => {
    const line = i + 2;
    const date = parseDate(r[map.date] ?? "", map.dayFirst);
    if (!date) return { line, ok: false, error: `Can't read the date "${r[map.date] ?? ""}"` };
    let amount: number | null = null;
    let income = false;
    if (map.amount != null) {
      const raw = (r[map.amount] ?? "").replace(/\s*(cr|dr)\.?$/i, (x) => x);
      const isCr = /cr\.?$/i.test(raw.trim());
      const isDr = /dr\.?$/i.test(raw.trim());
      const v = parseAmount(raw.replace(/(cr|dr)\.?$/i, "").replace(/[()]/g, (p) => (p === "(" ? "-" : "")));
      if (v == null) return { line, ok: false, error: `Can't read the amount "${r[map.amount] ?? ""}"` };
      const positiveIncome = map.positiveIs === "income";
      income = isCr ? true : isDr ? false : positiveIncome ? v > 0 : v < 0;
      amount = Math.abs(v);
    } else {
      const debit = map.debit != null ? parseAmount(r[map.debit] ?? "") : null;
      const credit = map.credit != null ? parseAmount(r[map.credit] ?? "") : null;
      if (credit && credit !== 0) {
        income = true;
        amount = Math.abs(credit);
      } else if (debit && debit !== 0) {
        amount = Math.abs(debit);
      }
      if (amount == null) return { line, ok: false, error: "No debit or credit amount" };
    }
    if (!amount) return { line, ok: false, error: "Amount is zero" };
    const description = (r[map.description] ?? "").trim().slice(0, 200);
    const hash = hashOf([date, amount, income ? "in" : "out", description, map.accountId]);
    const category = (map.category != null && r[map.category]?.trim()) || guessCategory(description, income);
    const duplicate = known.has(hash) || seen.has(hash) || fuzzy.has(`${date}|${amount}|${map.accountId}`);
    seen.add(hash);
    const tx: Transaction = {
      id: newId(),
      date,
      type: income ? "income" : "expense",
      amount,
      account_id: map.accountId,
      description,
      category,
      is_partial: false,
      reconciled: true,
      import_hash: hash,
      tags: ["imported"],
    };
    return { line, ok: true, duplicate, tx };
  });
}

/** Guess which column is which from header names. */
export function guessMapping(headers: string[]): Partial<ImportMapping> {
  const find = (re: RegExp) => {
    const i = headers.findIndex((h) => re.test(h.toLowerCase()));
    return i >= 0 ? i : null;
  };
  return {
    date: find(/date|txn dt|value dt/) ?? 0,
    description: find(/narration|description|particular|details|remark|merchant/) ?? 1,
    amount: find(/^amount|amount \(|amt$|^amt/),
    debit: find(/debit|withdraw|dr\b/),
    credit: find(/credit|deposit|cr\b/),
    category: find(/category/),
  };
}
