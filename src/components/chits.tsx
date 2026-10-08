"use client";

import { Check, ListOrdered, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate, formatMonthLong } from "@/lib/dates";
import { chitRecord, impliedPayable, upsertChitRecord, type ChitInstallmentRow, type ChitRowStatus, type ChitSummary } from "@/lib/engine/chits";
import type { ChitPosition } from "@/lib/engine/ledger";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import type { Chit, ChitInstallmentRecord, ChitRecordSource } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { Money } from "./money";
import { Button } from "./ui/button";
import { AmountInput, DateInput, Field, Select, Textarea } from "./ui/form";
import { Badge, KV, Progress } from "./ui/misc";
import { ConfirmSheet, Sheet } from "./ui/sheet";

const monthOf = (d: string) => {
  const long = formatMonthLong(d.slice(0, 7));
  return `${long.slice(0, 3)} ${long.slice(-4)}`;
};

const STATUS_LABEL: Record<ChitRowStatus, string> = {
  paid: "Paid",
  partial: "Part-paid",
  overdue: "Overdue",
  due: "Due today",
  payable: "Confirmed",
  upcoming: "Auction pending",
  unrecorded: "Paid earlier",
};

const STATUS_CLS: Record<ChitRowStatus, string> = {
  paid: "bg-brand-soft text-brand-strong",
  partial: "bg-warn-soft text-warn",
  overdue: "bg-danger-soft text-danger",
  due: "bg-warn-soft text-warn",
  payable: "bg-surface-3 text-ink",
  upcoming: "bg-future-soft text-future-ink",
  unrecorded: "bg-surface-3 text-ink-3",
};

function RowStatus({ status }: { status: ChitRowStatus }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium", STATUS_CLS[status])}>{STATUS_LABEL[status]}</span>;
}

const SOURCE_LABEL: Record<ChitRecordSource, string> = {
  foreman_slip: "Foreman's slip / receipt",
  foreman_message: "Message from the foreman",
  passbook: "Chit passbook",
  own_estimate: "My own estimate",
  other: "Other",
};

/** Section heading inside a card: plain, quiet, sentence case. */
function SectionLabel({ children, tone }: { children: React.ReactNode; tone?: "future" }) {
  return <p className={cn("mt-4 text-[12.5px] font-semibold", tone === "future" ? "text-future-ink" : "text-ink-3")}>{children}</p>;
}

function rangeText(s: ChitSummary, money: (n: number) => string) {
  if (!s.tbdCount) return null;
  if (!s.estimateFromHistory || Math.abs(s.tbdHigh - s.tbdLow) < 1) return `up to ${money(s.tbdHigh)}`;
  return `${money(s.tbdLow)} – ${money(s.tbdHigh)}`;
}

// ---------------------------------------------------------------------------
// Card on Liabilities → Chits

export function ChitCard({ cp }: { cp: ChitPosition }) {
  const { events, ctx } = useFinance();
  const c = cp.chit;
  const s = cp.summary;
  const money = (n: number) => formatMoney(n, ctx);
  const received = s.payoutReceived != null || c.payout_status === "received";
  const next = events.find((e) => e.kind === "chit" && e.chitId === c.id && e.status !== "paid" && e.status !== "adjusted" && e.remaining > 0);
  const ui = useUI.getState();
  const range = rangeText(s, money);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] font-semibold">{c.name}</p>
          <p className="text-[12.5px] text-ink-3">
            {c.provider ?? "Chit fund"} · {money(c.chit_value)} value · {c.installments} months · base {money(s.base)}
          </p>
        </div>
        <Badge tone={received ? "warn" : "future"}>{received ? "Payout taken" : "Payout pending"}</Badge>
      </div>

      <div className="mt-3">
        <div className="flex justify-between gap-2 text-[12.5px] text-ink-3">
          <span>
            {s.paidCount} of {c.installments} installments paid
          </span>
          <span>ends {formatDate(cp.endDate, "short")} {cp.endDate.slice(0, 4)}</span>
        </div>
        <Progress className="mt-1" value={s.paidCount / Math.max(1, c.installments)} tone="future" label={`${c.name} installments paid`} />
      </div>

      <SectionLabel>Actual so far</SectionLabel>
      <div className="divide-y divide-line">
        <KV
          k="Paid so far"
          v={
            <>
              {money(s.actualPaid)}
              <span className="ml-1 font-normal text-ink-3">
                · {s.actualPaidCount} installment{s.actualPaidCount === 1 ? "" : "s"}
              </span>
            </>
          }
        />
        {s.auctionSavings > 0 && <KV k="Saved through auctions" v={<span className="text-ok">{money(s.auctionSavings)}</span>} />}
        <KV
          k="Payout"
          v={s.payoutReceived != null ? `${money(s.payoutReceived)} received` : received ? "Received — amount not entered" : <span className="font-normal text-ink-3">Not taken yet</span>}
        />
        <div>
          <KV k="Current actual net" v={<span className={s.currentNet >= 0 ? "text-ok" : "text-danger"}>{formatMoney(s.currentNet, ctx, { sign: true })}</span>} />
          <p className="-mt-1 pb-1.5 text-[12px] text-ink-3">Payout received minus installments paid. Actual figures only.</p>
        </div>
      </div>
      {s.unrecordedCount > 0 && (
        <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
          {s.unrecordedCount} earlier installment{s.unrecordedCount === 1 ? " has" : "s have"} no amount entered, so {s.unrecordedCount === 1 ? "it isn't" : "they aren't"} in the actual totals.{" "}
          <button type="button" className="font-medium text-ink underline" onClick={() => ui.openChitSheet(c.id)}>
            Add the amounts
          </button>
        </p>
      )}

      {s.remainingCount > 0 && (
        <>
          <SectionLabel tone="future">Still to come</SectionLabel>
          <div className="divide-y divide-line">
            {s.remainingConfirmedCount > 0 && (
              <KV k={`Confirmed (${s.remainingConfirmedCount} installment${s.remainingConfirmedCount === 1 ? "" : "s"})`} v={money(s.remainingConfirmed)} />
            )}
            {s.tbdCount > 0 && <KV k={`Auction not held yet (${s.tbdCount})`} v={<span className="projected">{range}</span>} />}
            <KV k="Projected remaining cost" v={<Money value={s.projectedRemainingEstimate} projected={s.tbdCount > 0} />} />
            {!received && <KV k="Expected payout" v={<Money value={s.payoutExpected} projected />} />}
            <div>
              <KV k="Projected overall (estimate)" v={<Money value={s.projectedOverallNet} sign projected />} />
              <p className="-mt-1 pb-1.5 text-[12px] text-ink-3">
                {s.tbdCount > 0
                  ? s.estimateFromHistory
                    ? `Assumes about ${money(s.estimatePerInstallment)} per pending installment, based on past auctions. Updates with every result you enter.`
                    : "No auction results yet, so pending installments are assumed at the full base amount. Updates with every result you enter."
                  : "All remaining amounts are confirmed."}
              </p>
            </div>
          </div>
        </>
      )}

      {c.auction_notes && <p className="mt-2 text-[12.5px] text-ink-3">{c.auction_notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {next && (
          <Button size="sm" variant="primary" onClick={() => ui.openEvent(next.key, "settle")}>
            Pay installment {next.installment} · {formatDate(next.date, "short")}
          </Button>
        )}
        <Button size="sm" icon={<ListOrdered className="h-4 w-4" />} onClick={() => ui.openChitSheet(c.id)}>
          Installments & auctions
        </Button>
        {!received && (
          <Button size="sm" onClick={() => ui.openTx({ type: "chit_payout", chit_id: c.id, account_id: c.account_id, amount: s.payoutExpected })}>
            Record payout
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => ui.openEditor("chit", c.id)}>
          Edit
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Installment table + per-installment record editor

export function ChitInstallmentsSheet() {
  const chitId = useUI((s) => s.chitSheet);
  const { positions } = useFinance();
  const cp = chitId ? positions.chits.get(chitId) : undefined;
  const close = () => useUI.getState().openChitSheet(null);
  if (!chitId) return null;
  if (!cp) {
    return (
      <Sheet open onClose={close} title="Chit not found" size="sm">
        <p className="text-ink-2">This chit no longer exists.</p>
      </Sheet>
    );
  }
  return <InstallmentsView key={chitId} cp={cp} onClose={close} />;
}

function InstallmentsView({ cp, onClose }: { cp: ChitPosition; onClose: () => void }) {
  const { ctx } = useFinance();
  const [editing, setEditing] = useState<number | null>(null);
  const s = cp.summary;
  const money = (n: number) => formatMoney(n, ctx);
  const row = editing != null ? s.rows.find((r) => r.no === editing) : undefined;

  if (row) return <RecordEditor chit={cp.chit} row={row} summary={s} onBack={() => setEditing(null)} onClose={onClose} />;

  const pay = (r: ChitInstallmentRow) => {
    const ui = useUI.getState();
    ui.openChitSheet(null);
    ui.openEvent(`chit:${cp.chit.id}:${r.scheduledDate}`, "settle");
  };
  const adj = (r: ChitInstallmentRow) => (r.adjustment == null ? "—" : r.adjustment === 0 ? money(0) : formatMoney(r.adjustment, ctx, { sign: true }));
  const payableCell = (r: ChitInstallmentRow) =>
    r.payable != null ? (
      money(r.payable)
    ) : r.paid != null && r.status !== "partial" ? (
      money(r.paid)
    ) : r.status === "unrecorded" ? (
      <span className="text-ink-3">Not entered</span>
    ) : (
      <span className="text-future-ink">
        TBD <span className="projected text-[12px]">≈{money(r.planned)}</span>
      </span>
    );
  const range = rangeText(s, money);

  return (
    <Sheet
      open
      onClose={onClose}
      size="xl"
      title={`${cp.chit.name} — installments`}
      description="Each month's amount depends on that month's auction. Enter results as they arrive; every total updates straight away."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Actually paid" value={money(s.actualPaid)} note={`${s.actualPaidCount} installment${s.actualPaidCount === 1 ? "" : "s"}`} />
        <Stat label="Confirmed to pay" value={money(s.remainingConfirmed)} note={`${s.remainingConfirmedCount} installment${s.remainingConfirmedCount === 1 ? "" : "s"}`} />
        <Stat label="Auction pending (TBD)" value={range ?? money(0)} note={`${s.tbdCount} installment${s.tbdCount === 1 ? "" : "s"}`} projected />
        <Stat label="Current actual net" value={formatMoney(s.currentNet, ctx, { sign: true })} note="received − paid" tone={s.currentNet >= 0 ? "ok" : "danger"} />
      </div>

      {/* Table on tablets and up */}
      <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-line sm:block">
        <table className="w-full min-w-[640px] text-[13.5px]">
          <caption className="sr-only">Installments of {cp.chit.name}</caption>
          <thead className="bg-surface-2 text-left text-[12.5px] text-ink-3">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Month</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Base</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Auction adj.</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Actual payable</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Paid</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.rows.map((r) => (
              <tr key={r.no} className={cn(r.no === s.nextUnpaid?.no && "bg-surface-2/60")}>
                <td className="px-3 py-2">
                  <span className="font-medium">{monthOf(r.dueDate)}</span>
                  <span className="ml-1.5 text-[12px] text-ink-3">#{r.no}</span>
                </td>
                <td className="num px-3 py-2 text-right text-ink-2">{money(r.base)}</td>
                <td className={cn("num px-3 py-2 text-right", r.adjustment != null && r.adjustment < 0 ? "text-ok" : "text-ink-2")}>{adj(r)}</td>
                <td className="num px-3 py-2 text-right">{payableCell(r)}</td>
                <td className="num px-3 py-2 text-right">{r.paid != null ? money(r.paid) : <span className="text-ink-3">—</span>}</td>
                <td className="px-3 py-2">
                  <RowStatus status={r.status} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <div className="flex justify-end gap-1">
                    {r.tracked && r.status !== "paid" && (
                      <Button size="sm" variant="ghost" onClick={() => pay(r)} aria-label={`Mark installment ${r.no} paid`}>
                        Pay
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(r.no)} aria-label={`Edit installment ${r.no}`}>
                      <span className="sr-only lg:not-sr-only">Edit</span>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stacked rows on phones */}
      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line sm:hidden">
        {s.rows.map((r) => (
          <li key={r.no}>
            <button type="button" onClick={() => setEditing(r.no)} className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left">
              <span className="min-w-0">
                <span className="block text-[14px] font-medium">
                  {monthOf(r.dueDate)} <span className="text-[12px] font-normal text-ink-3">#{r.no}</span>
                </span>
                <span className="block text-[12px] text-ink-3">
                  Base {money(r.base)}
                  {r.adjustment != null && r.adjustment !== 0 ? ` · ${formatMoney(r.adjustment, ctx, { sign: true })}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="num text-[14px] font-medium">{payableCell(r)}</span>
                <RowStatus status={r.status} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-ink-3">
        TBD amounts are estimates (≈) from past auctions and are never counted as actual. Tap an installment to enter its auction result.
      </p>
    </Sheet>
  );
}

function Stat({ label, value, note, projected, tone }: { label: string; value: string; note?: string; projected?: boolean; tone?: "ok" | "danger" }) {
  return (
    <div className={cn("rounded-xl px-3 py-2.5", projected ? "bg-future-soft" : "bg-surface-2")}>
      <p className={cn("text-[12px]", projected ? "text-future-ink" : "text-ink-3")}>{label}</p>
      <p className={cn("num mt-0.5 text-[15px] font-semibold leading-tight", projected && "text-future-ink", tone === "ok" && "text-ok", tone === "danger" && "text-danger")}>{value}</p>
      {note && <p className="text-[11.5px] text-ink-3">{note}</p>}
    </div>
  );
}

function RecordEditor({ chit, row, summary, onBack, onClose }: { chit: Chit; row: ChitInstallmentRow; summary: ChitSummary; onBack: () => void; onClose: () => void }) {
  const { ctx } = useFinance();
  const patch = useStore((st) => st.patch);
  const existing = chitRecord(chit, row.no);
  const [auctionDate, setAuctionDate] = useState(existing?.auction_date ?? "");
  const [discount, setDiscount] = useState<number | null>(existing?.auction_discount ?? null);
  const [dividend, setDividend] = useState<number | null>(existing?.dividend ?? null);
  const [fees, setFees] = useState<number | null>(existing?.fees ?? null);
  const [slip, setSlip] = useState<number | null>(existing?.payable ?? null);
  const [baseOverride, setBaseOverride] = useState<number | null>(existing?.base_amount ?? null);
  const [dueDate, setDueDate] = useState(existing?.due_date ?? "");
  const [paidAmount, setPaidAmount] = useState<number | null>(existing?.paid_amount ?? null);
  const [paidDate, setPaidDate] = useState(existing?.paid_date ?? "");
  const [source, setSource] = useState<ChitRecordSource | "">(existing?.source ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const money = (n: number) => formatMoney(n, ctx);

  const base = baseOverride ?? summary.base;
  const draft: ChitInstallmentRecord = useMemo(
    () => ({
      no: row.no,
      due_date: dueDate || null,
      base_amount: baseOverride,
      auction_date: auctionDate || null,
      auction_discount: discount,
      dividend,
      fees,
      payable: slip,
      paid_amount: row.tracked ? null : paidAmount,
      paid_date: row.tracked ? null : paidDate || null,
      source: source || null,
      note: note.trim() || null,
    }),
    [row.no, row.tracked, dueDate, baseOverride, auctionDate, discount, dividend, fees, slip, paidAmount, paidDate, source, note],
  );
  const payable = impliedPayable(row.no, base, draft);
  const errors: string[] = [];
  if (dividend != null && dividend > base) errors.push("The dividend can't be more than the installment.");
  if (paidAmount != null && paidAmount <= 0) errors.push("Enter the amount paid, or leave it blank.");

  const save = async (thenPay = false) => {
    if (errors.length) return;
    setBusy(true);
    try {
      await patch("chits", chit.id, { installment_records: upsertChitRecord(chit, draft) });
      toast.success(`Installment ${row.no} saved`);
      if (thenPay) {
        const ui = useUI.getState();
        ui.openChitSheet(null);
        ui.openEvent(`chit:${chit.id}:${row.scheduledDate}`, "settle");
      } else onBack();
    } catch {
      /* the store already showed an error */
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    setBusy(true);
    try {
      await patch("chits", chit.id, { installment_records: upsertChitRecord(chit, { no: row.no }) });
      toast.success(`Installment ${row.no} cleared`);
      onBack();
    } catch {
      /* shown by the store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        size="md"
        title={`Installment ${row.no} · ${monthOf(row.dueDate)}`}
        description={
          row.tracked
            ? row.status === "paid"
              ? `Paid ${money(row.paid ?? 0)}${row.paidDate ? ` on ${formatDate(row.paidDate)}` : ""}. The auction details below are for your records.`
              : "Enter this month's auction result. The amount due updates everywhere straight away."
            : "Paid before you started tracking — its money is already in your balances, so nothing moves. Enter the amount for accurate totals."
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {existing && (
              <Button variant="ghost" onClick={() => setConfirmClear(true)} disabled={busy}>
                Clear
              </Button>
            )}
            <Button onClick={onBack} disabled={busy}>
              Back
            </Button>
            {row.tracked && row.status !== "paid" && (
              <Button onClick={() => save(true)} loading={busy} disabled={errors.length > 0}>
                Save & mark paid
              </Button>
            )}
            <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={() => save(false)} loading={busy} disabled={errors.length > 0}>
              Save
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-surface-2 p-4">
            <p className="text-[13px] text-ink-3">Amount due this month</p>
            <p className="display mt-0.5 text-[28px] font-semibold leading-none">
              {payable != null ? money(payable) : <span className="text-future-ink">TBD</span>}
            </p>
            <p className="mt-1 text-[12.5px] text-ink-2">
              {payable == null
                ? `Until you enter the dividend, fees or the slip amount, plans use about ${money(summary.estimatePerInstallment)}.`
                : slip != null
                  ? "Taken from the slip amount you entered."
                  : row.no === 1 && dividend == null && fees == null
                    ? "First installment: the full base amount (no auction yet)."
                    : `Base ${money(base)}${dividend ? ` − dividend ${money(dividend)}` : ""}${fees ? ` + fees ${money(fees)}` : ""}.`}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Auction date" htmlFor="ci-adate" optional>
              <DateInput id="ci-adate" value={auctionDate} onChange={(e) => setAuctionDate(e.target.value)} />
            </Field>
            <Field label="Your dividend / benefit" htmlFor="ci-div" optional help="Your share of the auction discount; it comes off this installment.">
              <AmountInput id="ci-div" value={dividend} onChange={setDividend} currency={ctx.currency} />
            </Field>
            <Field label="Other fees or charges" htmlFor="ci-fees" optional>
              <AmountInput id="ci-fees" value={fees} onChange={setFees} currency={ctx.currency} />
            </Field>
            <Field label="Amount on the slip" htmlFor="ci-slip" optional help="Only if the slip states a different amount due.">
              <AmountInput id="ci-slip" value={slip} onChange={setSlip} currency={ctx.currency} />
            </Field>
            <Field label="Auction discount (whole group)" htmlFor="ci-disc" optional help="For reference: the discount the winning bidder took.">
              <AmountInput id="ci-disc" value={discount} onChange={setDiscount} currency={ctx.currency} />
            </Field>
            <Field label="Source / confirmation" htmlFor="ci-src" optional>
              <Select id="ci-src" value={source} onChange={(e) => setSource(e.target.value as ChitRecordSource | "")}>
                <option value="">Not specified</option>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {!row.tracked && (
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-line p-3 sm:grid-cols-2">
              <Field label="Amount you paid" htmlFor="ci-paid" optional>
                <AmountInput id="ci-paid" value={paidAmount} onChange={setPaidAmount} currency={ctx.currency} />
              </Field>
              <Field label="Paid on" htmlFor="ci-pdate" optional>
                <DateInput id="ci-pdate" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
              </Field>
            </div>
          )}

          <details className="rounded-2xl border border-line px-3 py-2">
            <summary className="cursor-pointer py-1 text-[13.5px] font-medium text-ink-2">Change the date or base for this month</summary>
            <div className="mt-2 grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2">
              <Field label="Due date" htmlFor="ci-due" optional help={`Scheduled: ${formatDate(row.scheduledDate)}`}>
                <DateInput id="ci-due" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
              <Field label="Base amount" htmlFor="ci-base" optional help={`Chit default: ${money(summary.base)}`}>
                <AmountInput id="ci-base" value={baseOverride} onChange={setBaseOverride} currency={ctx.currency} />
              </Field>
            </div>
          </details>

          <Field label="Note" htmlFor="ci-note" optional>
            <Textarea id="ci-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </Field>

          {errors.length > 0 && (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
              {errors[0]}
            </p>
          )}
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={`Clear installment ${row.no}?`}
        body="Removes the auction details and notes for this installment. Payments you've recorded stay."
        confirmLabel="Clear"
        onConfirm={clear}
      />
    </>
  );
}
