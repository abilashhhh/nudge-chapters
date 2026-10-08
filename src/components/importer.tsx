"use client";

import { FileUp } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { buildImport, guessMapping, parseFile, type ImportMapping, type ParsedTable } from "@/lib/data/io";
import { formatDate } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import type { Transaction } from "@/lib/types";
import { Button } from "./ui/button";
import { Field, Select, Switch } from "./ui/form";
import { Badge } from "./ui/misc";
import { Sheet } from "./ui/sheet";

/** CSV / Excel transaction import with a column-mapping step, preview, validation and duplicate detection. */
export function Importer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ds } = useFinance();
  const addMany = useStore((s) => s.addMany);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<ImportMapping | null>(null);
  const [skipDupes, setSkipDupes] = useState(true);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (table && map && map.accountId ? buildImport(table, map, ds.transactions) : []), [table, map, ds.transactions]);
  const ok = rows.filter((r) => r.ok && (!skipDupes || !r.duplicate));
  const bad = rows.filter((r) => !r.ok);
  const dupes = rows.filter((r) => r.ok && r.duplicate);

  const reset = () => {
    setTable(null);
    setMap(null);
    setFileName("");
    setError(null);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const t = await parseFile(f);
      if (!t.headers.length || !t.rows.length) throw new Error("No rows found in that file.");
      setTable(t);
      setFileName(f.name);
      const g = guessMapping(t.headers);
      setMap({
        date: g.date ?? 0,
        description: g.description ?? 1,
        amount: g.debit != null || g.credit != null ? null : g.amount ?? 2,
        debit: g.debit ?? null,
        credit: g.credit ?? null,
        category: g.category ?? null,
        accountId: ds.accounts.find((a) => !a.archived)?.id ?? "",
        dayFirst: true,
        positiveIs: "expense",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const col = (label: string, key: keyof ImportMapping, allowNone = false) => (
    <Field label={label} htmlFor={`imp-${key}`}>
      <Select
        id={`imp-${key}`}
        value={map?.[key] == null ? "" : String(map[key])}
        onChange={(e) => setMap({ ...map!, [key]: e.target.value === "" ? null : Number(e.target.value) })}
      >
        {allowNone && <option value="">— none —</option>}
        {table?.headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import transactions"
      description="From a bank statement or spreadsheet (CSV or .xlsx). You'll see a preview before anything is saved."
      size="xl"
      footer={
        table && map ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-ink-2">
              {ok.length} ready · {dupes.length} possible duplicates · {bad.length} with problems
            </p>
            <div className="flex gap-2">
              <Button onClick={reset}>Choose another file</Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!ok.length}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await addMany("transactions", ok.map((r) => r.tx!) as Partial<Transaction>[]);
                    toast.success(`Imported ${ok.length} transactions`);
                    reset();
                    onClose();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Import {ok.length}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      {!table ? (
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong px-6 py-12 text-center hover:bg-surface-2">
            <FileUp className="h-8 w-8 text-ink-3" aria-hidden />
            <span className="text-[15px] font-medium">Choose a CSV or Excel file</span>
            <span className="text-[13px] text-ink-3">Most Indian bank statement exports work: date, narration, debit/credit or amount columns.</span>
            <input type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {error && <p className="text-[13.5px] text-danger">{error}</p>}
        </div>
      ) : (
        map && (
          <div className="flex flex-col gap-4">
            <p className="text-[13.5px] text-ink-2">
              <strong>{fileName}</strong> · {table.rows.length} rows. Tell Kosh which column is which:
            </p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Into account" htmlFor="imp-acct">
                <Select id="imp-acct" value={map.accountId} onChange={(e) => setMap({ ...map, accountId: e.target.value })}>
                  {ds.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {col("Date", "date")}
              {col("Description", "description")}
              {col("Category", "category", true)}
              {col("Amount (single column)", "amount", true)}
              {col("Debit / withdrawal", "debit", true)}
              {col("Credit / deposit", "credit", true)}
              <Field label="Date format" htmlFor="imp-df">
                <Select id="imp-df" value={map.dayFirst ? "dmy" : "mdy"} onChange={(e) => setMap({ ...map, dayFirst: e.target.value === "dmy" })}>
                  <option value="dmy">Day first (31/12/2026)</option>
                  <option value="mdy">Month first (12/31/2026)</option>
                </Select>
              </Field>
              {map.amount != null && (
                <Field label="Positive amounts are" htmlFor="imp-pos">
                  <Select id="imp-pos" value={map.positiveIs} onChange={(e) => setMap({ ...map, positiveIs: e.target.value as ImportMapping["positiveIs"] })}>
                    <option value="expense">Money out (expenses)</option>
                    <option value="income">Money in (income)</option>
                  </Select>
                </Field>
              )}
            </div>
            <Switch checked={skipDupes} onChange={setSkipDupes} label="Skip likely duplicates" help="Rows with the same date, amount and account as an existing transaction, or already imported." />
            <div className="max-h-[45vh] overflow-auto rounded-xl border border-line">
              <table className="w-full min-w-[620px] text-[13px]">
                <thead className="sticky top-0 bg-surface-2 text-left text-[12px] text-ink-3">
                  <tr>
                    <th className="px-3 py-2 font-medium">Row</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((r) => (
                    <tr key={r.line} className={cn("border-t border-line", (!r.ok || (r.duplicate && skipDupes)) && "text-ink-3")}>
                      <td className="num px-3 py-1.5">{r.line}</td>
                      <td className="num px-3 py-1.5">{r.tx ? formatDate(r.tx.date, "short") : "—"}</td>
                      <td className="max-w-[260px] truncate px-3 py-1.5">{r.tx?.description ?? ""}</td>
                      <td className="px-3 py-1.5">{r.tx?.category ?? ""}</td>
                      <td className={cn("num px-3 py-1.5 text-right", r.tx?.type === "income" && "text-ok")}>{r.tx ? formatMoney(r.tx.type === "income" ? r.tx.amount : -r.tx.amount, { currency: ds.profile.currency, locale: ds.profile.locale }, { sign: true, decimals: true }) : ""}</td>
                      <td className="px-3 py-1.5">{!r.ok ? <Badge tone="danger">{r.error}</Badge> : r.duplicate ? <Badge tone="warn">Duplicate?</Badge> : <Badge tone="brand">Ready</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12.5px] text-ink-3">Imported rows are tagged &ldquo;imported&rdquo; and can be edited or deleted like any other transaction. Categories are guessed from the description.</p>
          </div>
        )
      )}
    </Sheet>
  );
}
