// Chit funds with auction-dependent installments.
//
// A chit's monthly amount is not fixed. The first installment is normally the full base amount;
// after that, each month's auction sets a discount, part of which comes back to every member as a
// dividend, so what you actually pay changes month to month (₹25,000 → ₹20,000 → ₹22,000 → …).
//
// This module turns a chit, its per-installment records and its payment transactions into one row
// per installment plus a summary that keeps three kinds of numbers strictly apart:
//   actual     — money really paid (a transaction, or an amount recorded for an older installment)
//   confirmed  — the auction for that month is known, so the amount due is certain
//   projected  — the auction hasn't happened yet: estimated from past auctions, shown as a range,
//                and never mixed into "actual" totals.

import { clampDay, parseISO } from "../dates";
import { round2 } from "../money";
import type { Chit, ChitInstallmentRecord, ISODate, Transaction } from "../types";

export type ChitRowStatus =
  | "paid" // actual amount known
  | "partial" // part-paid, more to come
  | "overdue" // due date passed, not paid
  | "due" // due today
  | "payable" // auction known, amount confirmed, not yet due
  | "upcoming" // auction not held yet — amount TBD
  | "unrecorded"; // paid before tracking began, amount not entered

export type ChitAmountState = "actual" | "confirmed" | "projected";

export interface ChitInstallmentRow {
  no: number;
  /** Date used to identify this installment in the plan (from the chit's schedule). */
  scheduledDate: ISODate;
  dueDate: ISODate;
  base: number;
  auctionDate: ISODate | null;
  auctionDiscount: number | null;
  dividend: number | null;
  fees: number | null;
  /** Confirmed amount due (auction known, or the first installment). null = TBD. */
  payable: number | null;
  /** Amount actually paid. null = nothing recorded. */
  paid: number | null;
  paidDate: ISODate | null;
  txIds: string[];
  /** Paid (or confirmed) amount minus the base. Negative = auction saving. null = not known yet. */
  adjustment: number | null;
  /** Amount used for cash planning: paid, else confirmed payable, else the estimate. */
  planned: number;
  amountState: ChitAmountState;
  status: ChitRowStatus;
  /** false for installments paid before tracking began (no cash transaction expected). */
  tracked: boolean;
  source: ChitInstallmentRecord["source"] | null;
  note: string | null;
}

export interface ChitSummary {
  rows: ChitInstallmentRow[];
  base: number;
  /** Installments paid, including ones from before tracking. */
  paidCount: number;
  /** Sum of actual recorded payments. */
  actualPaid: number;
  actualPaidCount: number;
  /** Installments paid before tracking with no amount entered. */
  unrecordedCount: number;
  /** Those valued at the base amount — an upper bound, never counted as actual. */
  unrecordedEstimate: number;
  /** Base minus actual on paid installments: what auctions have saved you so far (net of fees). */
  auctionSavings: number;
  feesPaid: number;
  remainingCount: number;
  /** Unpaid installments whose amount is confirmed. */
  remainingConfirmed: number;
  remainingConfirmedCount: number;
  /** Unpaid installments whose auction hasn't happened. */
  tbdCount: number;
  tbdLow: number;
  tbdHigh: number;
  tbdEstimate: number;
  /** Estimated amount for one TBD installment (from past auctions; the base when there's no history). */
  estimatePerInstallment: number;
  /** Whether the estimate is based on at least one past auction. */
  estimateFromHistory: boolean;
  projectedRemainingLow: number;
  projectedRemainingHigh: number;
  projectedRemainingEstimate: number;
  payoutReceived: number | null;
  payoutExpected: number;
  /** Payout received (if any) minus actual payments so far. Negative = net cost so far. Actual figures only. */
  currentNet: number;
  /** Estimate of payout minus everything paid and still to pay. Changes with every auction result. */
  projectedOverallNet: number;
  nextUnpaid: ChitInstallmentRow | null;
}

const recordsOf = (chit: Chit) => (Array.isArray(chit.installment_records) ? chit.installment_records : []);

export function chitRecord(chit: Chit, no: number): ChitInstallmentRecord | undefined {
  return recordsOf(chit).find((r) => r.no === no);
}

/** Replace (or add) one installment record, keeping the list sorted. Empty fields are dropped. */
export function upsertChitRecord(chit: Chit, rec: ChitInstallmentRecord): ChitInstallmentRecord[] {
  const clean = Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== null && v !== undefined && v !== "")) as unknown as ChitInstallmentRecord;
  const others = recordsOf(chit).filter((r) => r.no !== rec.no);
  const hasData = Object.keys(clean).some((k) => k !== "no");
  return (hasData ? [...others, clean] : others).sort((a, b) => a.no - b.no);
}

/** The scheduled date of installment `no` (1-based). */
export function chitScheduledDate(chit: Chit, no: number): ISODate {
  const sd = parseISO(chit.start_date);
  return clampDay(sd.getUTCFullYear(), sd.getUTCMonth() + no - 1, sd.getUTCDate());
}

/** Payable implied by a record: explicit amount, else base − dividend + fees, else (first month) the base. */
export function impliedPayable(no: number, base: number, rec?: ChitInstallmentRecord): number | null {
  if (rec?.payable != null) return round2(rec.payable);
  if (rec?.dividend != null || rec?.fees != null) return round2(Math.max(0, base - (rec?.dividend ?? 0) + (rec?.fees ?? 0)));
  return no === 1 ? base : null;
}

export function chitSummary(chit: Chit, txs: Transaction[], today: ISODate): ChitSummary {
  const base = chit.monthly_contribution;
  const offset = Math.max(0, Math.min(chit.installments, chit.installments_paid_offset ?? 0));
  const own = txs.filter((t) => t.chit_id === chit.id);
  const instTxs = own
    .filter((t) => t.type === "chit_installment")
    .sort((a, b) => ((a.occurrence_date ?? a.date) < (b.occurrence_date ?? b.date) ? -1 : (a.occurrence_date ?? a.date) > (b.occurrence_date ?? b.date) ? 1 : 0));

  // Match payments to installments: first by the installment date they were recorded against,
  // then any others in date order to the earliest tracked installments still open.
  const byRow = new Map<number, Transaction[]>();
  const scheduled = Array.from({ length: chit.installments }, (_, i) => chitScheduledDate(chit, i + 1));
  const leftovers: Transaction[] = [];
  for (const t of instTxs) {
    const i = t.occurrence_date ? scheduled.indexOf(t.occurrence_date) : -1;
    if (i >= offset) byRow.set(i, [...(byRow.get(i) ?? []), t]);
    else leftovers.push(t);
  }
  for (const t of leftovers) {
    let i = offset;
    while (i < chit.installments && byRow.has(i)) i++;
    if (i < chit.installments) byRow.set(i, [t]);
  }

  const rows: ChitInstallmentRow[] = [];
  for (let i = 0; i < chit.installments; i++) {
    const no = i + 1;
    const rec = chitRecord(chit, no);
    const rowBase = rec?.base_amount ?? base;
    const tracked = i >= offset;
    const paidTxs = tracked ? (byRow.get(i) ?? []) : [];
    const payable = impliedPayable(no, rowBase, rec);
    const paid = paidTxs.length ? round2(paidTxs.reduce((s, t) => s + t.amount, 0)) : !tracked && rec?.paid_amount != null ? round2(rec.paid_amount) : null;
    const dueDate = rec?.due_date ?? scheduled[i];
    const isPartial = paidTxs.some((t) => t.is_partial) && paid != null && payable != null && paid < payable - 0.5;
    let status: ChitRowStatus;
    if (paid != null) status = isPartial ? "partial" : "paid";
    else if (!tracked) status = "unrecorded";
    else if (dueDate < today) status = "overdue";
    else if (dueDate === today) status = "due";
    else status = payable != null ? "payable" : "upcoming";
    rows.push({
      no,
      scheduledDate: scheduled[i],
      dueDate,
      base: rowBase,
      auctionDate: rec?.auction_date ?? null,
      auctionDiscount: rec?.auction_discount ?? null,
      dividend: rec?.dividend ?? null,
      fees: rec?.fees ?? null,
      payable,
      paid,
      paidDate: paidTxs.length ? paidTxs[paidTxs.length - 1].date : rec?.paid_date ?? null,
      txIds: paidTxs.map((t) => t.id),
      adjustment: paid != null && !isPartial ? round2(paid - rowBase) : payable != null ? round2(payable - rowBase) : null,
      planned: 0, // filled below
      amountState: paid != null && !isPartial ? "actual" : payable != null ? "confirmed" : "projected",
      status,
      tracked,
      source: rec?.source ?? null,
      note: rec?.note ?? null,
    });
  }

  // What past auctions saved per installment (installment 1 has no auction).
  const savings = rows
    .filter((r) => r.no > 1 && (r.status === "paid" || r.payable != null))
    .map((r) => (r.status === "paid" ? r.base - (r.paid ?? r.base) : r.base - (r.payable ?? r.base)))
    .filter((s) => Number.isFinite(s));
  const estimateFromHistory = savings.length > 0;
  const avgSaving = estimateFromHistory ? savings.reduce((a, b) => a + b, 0) / savings.length : 0;
  const maxSaving = estimateFromHistory ? Math.max(...savings) : 0;
  const estimatePerInstallment = round2(Math.max(0, base - Math.max(0, avgSaving)));

  for (const r of rows) {
    r.planned =
      r.status === "partial" ? Math.max(r.payable ?? estimatePerInstallment, r.paid ?? 0) : r.paid ?? r.payable ?? (r.base === base ? estimatePerInstallment : round2(Math.max(0, r.base - Math.max(0, avgSaving))));
  }

  const paidRows = rows.filter((r) => r.status === "paid" || r.status === "unrecorded");
  const actualRows = rows.filter((r) => r.paid != null);
  const unrecorded = rows.filter((r) => r.status === "unrecorded");
  const open = rows.filter((r) => r.status !== "paid" && r.status !== "unrecorded");
  const confirmedOpen = open.filter((r) => r.payable != null);
  const tbdOpen = open.filter((r) => r.payable == null);
  const owedOn = (r: ChitInstallmentRow) => Math.max(0, (r.payable ?? r.planned) - (r.status === "partial" ? r.paid ?? 0 : 0));

  const remainingConfirmed = round2(confirmedOpen.reduce((s, r) => s + owedOn(r), 0));
  const tbdHigh = round2(tbdOpen.reduce((s, r) => s + r.base, 0));
  const tbdLow = round2(tbdOpen.reduce((s, r) => s + Math.max(0, r.base - Math.max(0, maxSaving)), 0));
  const tbdEstimate = round2(tbdOpen.reduce((s, r) => s + owedOn(r), 0));

  const actualPaid = round2(actualRows.reduce((s, r) => s + (r.paid ?? 0), 0));
  const unrecordedEstimate = round2(unrecorded.reduce((s, r) => s + r.base, 0));
  const auctionSavings = round2(rows.filter((r) => r.status === "paid" && r.no > 1).reduce((s, r) => s + (r.base - (r.paid ?? r.base)), 0));
  const feesPaid = round2(rows.filter((r) => r.status === "paid").reduce((s, r) => s + (r.fees ?? 0), 0));

  const payoutTx = own.find((t) => t.type === "chit_payout");
  const payoutReceived = payoutTx ? round2(payoutTx.amount) : chit.payout_status === "received" && chit.payout_amount != null ? round2(chit.payout_amount) : null;
  const payoutExpected = round2(payoutReceived ?? chit.payout_amount ?? chit.chit_value * (1 - chit.commission_pct / 100));

  const projectedRemainingEstimate = round2(remainingConfirmed + tbdEstimate);
  return {
    rows,
    base,
    paidCount: paidRows.length,
    actualPaid,
    actualPaidCount: actualRows.filter((r) => r.status === "paid").length,
    unrecordedCount: unrecorded.length,
    unrecordedEstimate,
    auctionSavings,
    feesPaid,
    remainingCount: open.length,
    remainingConfirmed,
    remainingConfirmedCount: confirmedOpen.length,
    tbdCount: tbdOpen.length,
    tbdLow,
    tbdHigh,
    tbdEstimate,
    estimatePerInstallment,
    estimateFromHistory,
    projectedRemainingLow: round2(remainingConfirmed + tbdLow),
    projectedRemainingHigh: round2(remainingConfirmed + tbdHigh),
    projectedRemainingEstimate,
    payoutReceived,
    payoutExpected,
    currentNet: round2((payoutReceived ?? 0) - actualPaid),
    projectedOverallNet: round2(payoutExpected - (actualPaid + unrecordedEstimate + projectedRemainingEstimate)),
    nextUnpaid: rows.find((r) => r.tracked && r.status !== "paid") ?? null,
  };
}
