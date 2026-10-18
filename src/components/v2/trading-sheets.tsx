"use client";

import { FileUp, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/money";
import { useStore } from "@/lib/store";
import { IPO_STATUS_LABEL, SEGMENT_LABEL, importTrades, ipoApplied, sameTrade, tradePnl, type TradeImport } from "@/lib/trading";
import type { IpoApplication, IpoStatus, Trade, TradeSegment } from "@/lib/types";
import { Button } from "../ui/button";
import { AmountInput, DateInput, Field, Input, NumberInput, Select, Textarea } from "../ui/form";
import { Segmented } from "../ui/misc";
import { ConfirmSheet, Sheet } from "../ui/sheet";

function Chips<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)} className={cn("h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors", value === o.id ? "bg-inverse text-on-inverse" : "border border-line bg-surface text-ink-2 hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const n = (s: string) => (s.trim() === "" ? null : Number(s));

// ---------------------------------------------------------------------------

export function TradeSheet({ open, trade, preset, onClose }: { open: boolean; trade?: Trade | null; preset?: Partial<Trade>; onClose: () => void }) {
  const { today, ctx } = useFinance();
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [segment, setSegment] = useState<TradeSegment>("intraday");
  const [side, setSide] = useState<"long" | "short">("long");
  const [qty, setQty] = useState("");
  const [entryDate, setEntryDate] = useState(today);
  const [entry, setEntry] = useState<number | null>(null);
  const [closed, setClosed] = useState(true);
  const [exitDate, setExitDate] = useState(today);
  const [exit, setExit] = useState<number | null>(null);
  const [charges, setCharges] = useState<number | null>(null);
  const [strategy, setStrategy] = useState("");
  const [broker, setBroker] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = { ...preset, ...trade };
    setSymbol(t.symbol ?? "");
    setName(t.name ?? "");
    setSegment(t.segment ?? "intraday");
    setSide(t.side ?? "long");
    setQty(t.quantity != null ? String(t.quantity) : "");
    setEntryDate(t.entry_date ?? today);
    setEntry(t.entry_price ?? null);
    setClosed(trade ? trade.exit_price != null : true);
    setExitDate(t.exit_date ?? t.entry_date ?? today);
    setExit(t.exit_price ?? null);
    setCharges(t.charges ?? null);
    setStrategy(t.strategy ?? "");
    setBroker(t.broker ?? "");
    setNotes(t.notes ?? "");
    setError(null);
  }, [open, trade, preset, today]);

  // Intraday trades close the same day.
  const exitOn = segment === "intraday" ? entryDate : exitDate;
  const draft: Trade = {
    id: trade?.id ?? "draft", symbol: symbol.trim().toUpperCase(), name: name.trim() || null, segment, side, quantity: n(qty) ?? 0,
    entry_date: entryDate, entry_price: entry ?? 0, exit_date: closed ? exitOn : null, exit_price: closed ? exit : null, charges: charges ?? 0,
    strategy: strategy.trim() || null, broker: broker.trim() || null, notes: notes.trim() || null, tags: trade?.tags ?? [], exchange: trade?.exchange ?? "NSE",
  };
  const pnl = closed && exit != null && entry != null && draft.quantity > 0 ? tradePnl(draft) : null;

  async function save() {
    if (!draft.symbol) return setError("Add the stock's symbol (e.g. INFY).");
    if (!(draft.quantity > 0)) return setError("Add how many shares or units.");
    if (entry == null) return setError(`Add the ${side === "short" ? "sell" : "buy"} price.`);
    if (closed && exit == null) return setError(`Add the ${side === "short" ? "buy-back" : "sell"} price, or switch to "Still open".`);
    if (closed && exitOn < entryDate) return setError("The exit date is before the entry date.");
    setBusy(true);
    try {
      const { id: _id, ...row } = draft;
      void _id;
      if (trade) await useStore.getState().patch("trades", trade.id, row);
      else await useStore.getState().add("trades", row);
      onClose();
    } catch {
      /* the store already said why */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={trade ? `Edit ${trade.symbol} trade` : "Add a trade"}
        size="md"
        footer={
          <div className="flex items-center gap-2">
            {trade && (
              <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>
                Delete
              </Button>
            )}
            <Button className={trade ? "" : "ml-auto"} onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>{trade ? "Save" : "Add trade"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Symbol" htmlFor="tr-sym">
              <Input id="tr-sym" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. INFY" autoCapitalize="characters" maxLength={40} autoFocus={!trade} />
            </Field>
            <Field label="Company" optional htmlFor="tr-name">
              <Input id="tr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Infosys" maxLength={200} />
            </Field>
          </div>
          <Field label="Kind of trade">
            <Chips label="Kind of trade" value={segment} onChange={setSegment} options={(Object.keys(SEGMENT_LABEL) as TradeSegment[]).map((id) => ({ id, label: SEGMENT_LABEL[id] }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Direction">
              <Segmented value={side} onChange={setSide} options={[{ id: "long", label: "Buy first" }, { id: "short", label: "Sell first (short)" }]} size="sm" />
            </Field>
            <Field label="Quantity" htmlFor="tr-qty">
              <NumberInput id="tr-qty" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={side === "short" ? "Sold on" : "Bought on"}>
              <DateInput value={entryDate} onChange={(e) => setEntryDate(e.target.value)} max={today} />
            </Field>
            <Field label={side === "short" ? "Sell price" : "Buy price"}>
              <AmountInput value={entry} onChange={setEntry} currency={ctx.currency} locale={ctx.locale} ariaLabel="Entry price" />
            </Field>
          </div>
          <Field label="Status">
            <Segmented value={closed ? "closed" : "open"} onChange={(v) => setClosed(v === "closed")} options={[{ id: "closed", label: "Closed" }, { id: "open", label: "Still open" }]} size="sm" />
          </Field>
          {closed && (
            <div className="grid grid-cols-2 gap-3">
              {segment === "intraday" ? (
                <Field label="Closed on" help="Intraday trades close the same day.">
                  <DateInput value={entryDate} disabled />
                </Field>
              ) : (
                <Field label={side === "short" ? "Bought back on" : "Sold on"}>
                  <DateInput value={exitDate} onChange={(e) => setExitDate(e.target.value)} min={entryDate} max={today} />
                </Field>
              )}
              <Field label={side === "short" ? "Buy-back price" : "Sell price"}>
                <AmountInput value={exit} onChange={setExit} currency={ctx.currency} locale={ctx.locale} ariaLabel="Exit price" />
              </Field>
            </div>
          )}
          <Field label="Charges" optional help="Brokerage, STT and exchange charges for the whole trade (your contract note has them).">
            <AmountInput value={charges} onChange={setCharges} currency={ctx.currency} locale={ctx.locale} ariaLabel="Charges" />
          </Field>
          {pnl != null && (
            <div className={cn("flex items-center justify-between rounded-2xl px-4 py-3", pnl >= 0 ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
              <span className="text-[13.5px] font-medium">{pnl >= 0 ? "Profit" : "Loss"} after charges</span>
              <span className="num text-[18px] font-semibold">{formatMoney(pnl, ctx, { sign: true, decimals: true })}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Setup / strategy" optional>
              <Input value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="e.g. ORB, VWAP" maxLength={120} />
            </Field>
            <Field label="Broker" optional>
              <Input value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="e.g. Zerodha" maxLength={60} />
            </Field>
          </div>
          <Field label="Notes" optional>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Why you took it, what you'd do differently" maxLength={4000} />
          </Field>
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this trade?"
        body="It's removed from your journal and your profit totals."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (trade) await useStore.getState().remove("trades", trade.id);
          setConfirm(false);
          onClose();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

const STATUSES: IpoStatus[] = ["applied", "allotted", "not_allotted", "listed", "sold", "withdrawn"];
const CATEGORY: Record<IpoApplication["category"], string> = { retail: "Retail", shni: "Small HNI", bhni: "Big HNI", employee: "Employee", shareholder: "Shareholder", other: "Other" };

export function IpoSheet({ open, ipo, onClose }: { open: boolean; ipo?: IpoApplication | null; onClose: () => void }) {
  const { ds, today, ctx } = useFinance();
  const [f, setF] = useState<Partial<IpoApplication>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(ipo ? { ...ipo } : { category: "retail", apply_date: today, lots: 1, status: "applied", allotted_shares: 0 });
    setError(null);
  }, [open, ipo, today]);
  const set = <K extends keyof IpoApplication>(k: K, v: IpoApplication[K]) => setF((x) => ({ ...x, [k]: v }));
  const st = f.status ?? "applied";
  const got = st === "allotted" || st === "listed" || st === "sold";
  const applied = f.price && f.lot_size ? ipoApplied(f as IpoApplication) : null;
  const listGain = got && f.listing_price != null && f.price != null ? (f.listing_price - f.price) * (f.allotted_shares ?? 0) : null;
  const accounts = ds.accounts.filter((a) => !a.archived);

  async function save() {
    if (!f.name?.trim()) return setError("Add the company's name.");
    if (f.price == null || f.price <= 0) return setError("Add the issue price per share.");
    if (!f.lot_size || f.lot_size <= 0) return setError("Add the lot size (shares in one lot).");
    if (got && !(f.allotted_shares && f.allotted_shares > 0)) return setError("Add how many shares you were allotted.");
    if ((st === "listed" || st === "sold") && f.listing_price == null) return setError("Add the listing price.");
    if (st === "sold" && f.sold_price == null) return setError("Add the price you sold at.");
    const row: Partial<IpoApplication> = {
      name: f.name.trim(), symbol: f.symbol?.trim().toUpperCase() || null, category: f.category ?? "retail", apply_date: f.apply_date ?? today,
      price: f.price, lot_size: Math.round(f.lot_size), lots: Math.max(1, Math.round(f.lots ?? 1)), status: st,
      allotted_shares: got ? Math.round(f.allotted_shares ?? 0) : 0,
      listing_date: st === "listed" || st === "sold" ? f.listing_date || null : null,
      listing_price: st === "listed" || st === "sold" ? f.listing_price ?? null : null,
      sold_date: st === "sold" ? f.sold_date || null : null, sold_price: st === "sold" ? f.sold_price ?? null : null,
      account_id: f.account_id || null, broker: f.broker?.trim() || null, notes: f.notes?.trim() || null,
    };
    setBusy(true);
    try {
      if (ipo) await useStore.getState().patch("ipo_applications", ipo.id, row);
      else await useStore.getState().add("ipo_applications", row);
      onClose();
    } catch {
      /* shown by the store */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={ipo ? `Edit ${ipo.name} IPO` : "Add an IPO application"}
        size="md"
        footer={
          <div className="flex items-center gap-2">
            {ipo && (
              <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>
                Delete
              </Button>
            )}
            <Button className={ipo ? "" : "ml-auto"} onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>{ipo ? "Save" : "Add IPO"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
            <Field label="Company">
              <Input value={f.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Swiggy" maxLength={200} autoFocus={!ipo} />
            </Field>
            <Field label="Symbol" optional>
              <Input value={f.symbol ?? ""} onChange={(e) => set("symbol", e.target.value.toUpperCase())} placeholder="e.g. JIO" maxLength={40} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Applied on">
              <DateInput value={f.apply_date ?? today} onChange={(e) => set("apply_date", e.target.value)} />
            </Field>
            <Field label="Category">
              <Select value={f.category ?? "retail"} onChange={(e) => set("category", e.target.value as IpoApplication["category"])}>
                {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Issue price">
              <AmountInput value={f.price ?? null} onChange={(v) => set("price", v ?? 0)} currency={ctx.currency} locale={ctx.locale} ariaLabel="Issue price" />
            </Field>
            <Field label="Lot size">
              <NumberInput min={1} step={1} value={f.lot_size ?? ""} onChange={(e) => set("lot_size", n(e.target.value) ?? 0)} placeholder="shares" />
            </Field>
            <Field label="Lots">
              <NumberInput min={1} step={1} value={f.lots ?? 1} onChange={(e) => set("lots", n(e.target.value) ?? 1)} />
            </Field>
          </div>
          {applied != null && <p className="text-[12.5px] text-ink-3">Blocked in your bank for the bid: <span className="num font-semibold text-ink">{formatMoney(applied, ctx)}</span></p>}
          <Field label="Where it stands">
            <Chips label="Status" value={st} onChange={(v) => setF((x) => ({ ...x, status: v, allotted_shares: (v === "allotted" || v === "listed" || v === "sold") && !x.allotted_shares ? (x.lot_size ?? 0) : x.allotted_shares }))} options={STATUSES.map((id) => ({ id, label: IPO_STATUS_LABEL[id] }))} />
          </Field>
          {got && (
            <Field label="Shares allotted">
              <NumberInput min={1} step={1} value={f.allotted_shares ?? ""} onChange={(e) => set("allotted_shares", n(e.target.value) ?? 0)} />
            </Field>
          )}
          {(st === "listed" || st === "sold") && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Listed on">
                <DateInput value={f.listing_date ?? ""} onChange={(e) => set("listing_date", e.target.value)} />
              </Field>
              <Field label="Listing price">
                <AmountInput value={f.listing_price ?? null} onChange={(v) => set("listing_price", v)} currency={ctx.currency} locale={ctx.locale} ariaLabel="Listing price" />
              </Field>
            </div>
          )}
          {st === "sold" && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sold on">
                <DateInput value={f.sold_date ?? ""} onChange={(e) => set("sold_date", e.target.value)} />
              </Field>
              <Field label="Sold at">
                <AmountInput value={f.sold_price ?? null} onChange={(v) => set("sold_price", v)} currency={ctx.currency} locale={ctx.locale} ariaLabel="Sold at" />
              </Field>
            </div>
          )}
          {listGain != null && f.price ? (
            <div className={cn("flex items-center justify-between rounded-2xl px-4 py-3", listGain >= 0 ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
              <span className="text-[13.5px] font-medium">Listing {listGain >= 0 ? "gain" : "loss"} ({formatPct(((f.listing_price! - f.price) / f.price) * 100)})</span>
              <span className="num text-[18px] font-semibold">{formatMoney(listGain, ctx, { sign: true })}</span>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank account" optional>
              <Select value={f.account_id ?? ""} onChange={(e) => set("account_id", e.target.value || null)}>
                <option value="">—</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Applied through" optional>
              <Input value={f.broker ?? ""} onChange={(e) => set("broker", e.target.value)} placeholder="e.g. Zerodha" maxLength={60} />
            </Field>
          </div>
          <Field label="Notes" optional>
            <Textarea value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} maxLength={4000} />
          </Field>
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Delete this IPO?"
        body="It's removed from your IPO list and totals."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (ipo) await useStore.getState().remove("ipo_applications", ipo.id);
          setConfirm(false);
          onClose();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

/** Paste or pick a broker tradebook / P&L export; trades already in the journal are skipped. */
export function ImportTradesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ds, ctx } = useFinance();
  const [text, setText] = useState("");
  const [broker, setBroker] = useState("Zerodha");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText("");
  }, [open]);
  const res = useMemo((): { ok: TradeImport; fresh: TradeImport["trades"] } | { error: string } | null => {
    if (!text.trim()) return null;
    try {
      const ok = importTrades(text, broker);
      const fresh = ok.trades.filter((t) => !ds.trades.some((x) => sameTrade(x, t)));
      return { ok, fresh };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Couldn't read this file." };
    }
  }, [text, broker, ds.trades]);
  const preview = res && "ok" in res ? res : null;
  const net = preview ? preview.fresh.reduce((s, t) => s + (tradePnl({ ...t, id: "" }) ?? 0), 0) : 0;
  async function add() {
    if (!preview?.fresh.length) return;
    setBusy(true);
    try {
      await useStore.getState().addMany("trades", preview.fresh);
      toast.success(`Added ${preview.fresh.length} trade${preview.fresh.length === 1 ? "" : "s"}.`);
      onClose();
    } catch {
      /* shown by the store */
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import trades"
      description="From your broker's tradebook or P&L report (CSV). Zerodha Console → Reports → Tradebook works best."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!preview?.fresh.length} onClick={add}>
            {preview?.fresh.length ? `Add ${preview.fresh.length} trade${preview.fresh.length === 1 ? "" : "s"}` : "Add trades"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Broker">
            <Input value={broker} onChange={(e) => setBroker(e.target.value)} maxLength={60} />
          </Field>
          <Field label="File">
            <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13.5px] font-medium hover:bg-surface-2">
              <FileUp className="h-4 w-4" aria-hidden /> Choose CSV
              <input
                type="file"
                accept=".csv,text/csv,.txt"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setText(await file.text());
                  e.target.value = "";
                }}
              />
            </label>
          </Field>
        </div>
        <Field label="…or paste it here">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={"symbol,trade_date,trade_type,quantity,price\nINFY,2026-10-01,buy,10,1800\nINFY,2026-10-01,sell,10,1812"} className="font-mono text-[12px]" />
        </Field>
        {res && "error" in res && <p role="alert" className="text-[13px] text-danger">{res.error}</p>}
        {preview && (
          <div className="rounded-2xl border border-line bg-surface-2/60 p-3 text-[13.5px]">
            <p>
              Found <b>{preview.ok.trades.length}</b> trade{preview.ok.trades.length === 1 ? "" : "s"} ({preview.ok.format === "tradebook" ? "buys and sells matched into round trips" : "from a P&L sheet"})
              {preview.ok.trades.length - preview.fresh.length > 0 && <>, {preview.ok.trades.length - preview.fresh.length} already in your journal</>}
              {preview.ok.skipped > 0 && <>, {preview.ok.skipped} row{preview.ok.skipped === 1 ? "" : "s"} skipped</>}.
            </p>
            {preview.fresh.length > 0 && (
              <p className="mt-1 text-ink-2">
                {preview.fresh.filter((t) => t.segment === "intraday").length} intraday · {preview.fresh.filter((t) => t.exit_price == null).length} still open · net{" "}
                <span className={cn("num font-semibold", net >= 0 ? "text-ok" : "text-danger")}>{formatMoney(net, ctx, { sign: true })}</span> before charges
              </p>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
