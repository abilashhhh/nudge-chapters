// Month-by-month tables for Version 2 (rows = items, columns = months).
//
// These builders only arrange numbers the engine already produces (FinEvents from `buildEvents`, positions
// from `computePositions`, and recorded transactions). They never calculate money of their own, so every
// cell matches what the rest of the app shows.

import { addDays, formatDate, monthKey } from "../dates";
import { dueDateFor, isPending, statementDateOnOrAfter, SETTLED, type FinEvent } from "../engine/events";
import type { Positions } from "../engine/ledger";
import { personKey } from "../engine/reimburse";
import { round2 } from "../money";
import type { Dataset, ISODate } from "../types";

/** ✓ Paid · ⏰ Due this week · ⚠ Late · ○ Upcoming · — Skipped · ½ Part paid */
export type CellStatus = "paid" | "due" | "late" | "upcoming" | "skipped" | "partial";

export interface GridCell {
  amount: number;
  status: CellStatus;
  /** A forecast rather than a known amount: shown in the violet "Estimate" style. */
  estimated: boolean;
  /** Events behind this cell (tapping opens the first one still to pay, else the first one). */
  eventKeys: string[];
  /** Money coming in rather than going out (income, repayments). */
  incoming?: boolean;
}

export interface GridRow {
  id: string;
  label: string;
  /** The "For" / note column. */
  note?: string;
  /** A small line under the name (e.g. the date of a spend). */
  hint?: string;
  /** Sort key for rows with a date. */
  hintDate?: string;
  cells: Record<string, GridCell>;
  /** What the row stands for, so the screen can open the right form. */
  ref?: { kind: "card" | "loan" | "chit" | "sip" | "rule" | "lending" | "person" | "card-spends"; id: string };
}

export interface GridGroup {
  id: string;
  label: string;
  note?: string;
  /** The group's own total row (card total, all chits…). */
  total: GridRow;
  rows: GridRow[];
  ref?: GridRow["ref"];
  /** Extra facts for the screen (e.g. card spends not billed yet). */
  meta?: Record<string, number | string | null>;
  /** A running figure shown under the name (e.g. everything still owed on a card). */
  sub?: { label: string; value: number };
}

export interface MonthGridData {
  months: string[];
  groups: GridGroup[];
  /** Grand total per month (sum of group totals only — nothing is counted twice). */
  grand: Record<string, GridCell>;
}

const WEEK = 7;
const formatShortDate = (d: ISODate) => formatDate(d, "short");

function settledAmount(e: FinEvent): number {
  if (e.status === "skipped" || e.status === "cancelled") return 0;
  return e.paid || e.amount;
}

/** Amount a single event contributes to its month's cell. */
export function eventAmount(e: FinEvent): number {
  return SETTLED.includes(e.status) ? settledAmount(e) : e.amount;
}

export function cellStatus(evs: FinEvent[], today: ISODate): CellStatus {
  if (!evs.length) return "upcoming";
  const pending = evs.filter((e) => !SETTLED.includes(e.status));
  if (!pending.length) return evs.every((e) => e.status === "skipped" || e.status === "cancelled") ? "skipped" : "paid";
  if (pending.some((e) => e.status === "overdue" || (e.date < today && isPending(e)))) return "late";
  if (pending.some((e) => e.status === "partial")) return "partial";
  if (pending.some((e) => e.date <= addDays(today, WEEK))) return "due";
  return "upcoming";
}

export function makeCell(evs: FinEvent[], today: ISODate): GridCell {
  return {
    amount: round2(evs.reduce((s, e) => s + eventAmount(e), 0)),
    status: cellStatus(evs, today),
    estimated: evs.some((e) => e.estimated && !SETTLED.includes(e.status)),
    // Still-to-pay first, so tapping the cell opens what needs doing.
    eventKeys: [...evs.filter((e) => !SETTLED.includes(e.status)), ...evs.filter((e) => SETTLED.includes(e.status))].map((e) => e.key),
    incoming: evs.length > 0 && evs.every((e) => e.flow === "in"),
  };
}

/** Group events into cells by month, keeping only the months shown. */
function cellsFrom(evs: FinEvent[], months: string[], today: ISODate, monthOf: (e: FinEvent) => string = (e) => monthKey(e.date)): Record<string, GridCell> {
  const by = new Map<string, FinEvent[]>();
  for (const e of evs) {
    const m = monthOf(e);
    if (!months.includes(m)) continue;
    by.set(m, [...(by.get(m) ?? []), e]);
  }
  const out: Record<string, GridCell> = {};
  for (const [m, list] of by) out[m] = makeCell(list, today);
  return out;
}

/** Sum rows into a total row. Status: the most urgent status among the rows. */
export function sumCells(rows: Record<string, GridCell>[], months: string[]): Record<string, GridCell> {
  const order: CellStatus[] = ["late", "partial", "due", "upcoming", "paid", "skipped"];
  const out: Record<string, GridCell> = {};
  for (const m of months) {
    const parts = rows.map((r) => r[m]).filter(Boolean) as GridCell[];
    if (!parts.length) continue;
    out[m] = {
      amount: round2(parts.reduce((s, c) => s + c.amount, 0)),
      status: order.find((st) => parts.some((c) => c.status === st)) ?? "upcoming",
      estimated: parts.some((c) => c.estimated),
      eventKeys: parts.flatMap((c) => c.eventKeys),
      incoming: parts.every((c) => c.incoming),
    };
  }
  return out;
}

/**
 * Payments made before you started tracking in the app (EMIs before `emis_paid_offset`, chit installments marked
 * paid earlier, SIPs before `track_from`). Their cash is already in today's balances, so the engine has no event
 * for them; the month tables still show them as paid so each month reads complete.
 */
function paidBefore(base: Pick<FinEvent, "key" | "source" | "sourceId" | "kind" | "title"> & Partial<FinEvent>, date: ISODate, amount: number): FinEvent {
  return {
    occurrence: date,
    date,
    amount,
    paid: amount,
    remaining: 0,
    status: "paid",
    flow: "out",
    isFixed: true,
    isEssential: false,
    certainty: "known",
    excluded: false,
    estimated: false,
    txIds: [],
    ...base,
  };
}

/** EMIs of a loan that were paid before tracking began, as paid events. */
function emisPaidBefore(ds: Dataset, positions: Positions, loanId: string): FinEvent[] {
  const lp = positions.loans.get(loanId);
  const loan = ds.loans.find((l) => l.id === loanId);
  if (!lp || !loan) return [];
  return lp.state.schedule
    .slice(0, Math.max(0, loan.emis_paid_offset))
    .map((inst, i) => paidBefore({ key: `before:loan:${loanId}:${inst.date}`, source: "loan", sourceId: loanId, loanId, cardId: loan.card_id, kind: "emi", title: `EMI · ${loan.name}`, installment: i + 1 }, inst.date, inst.emi));
}

/**
 * Order for one month: bills still to pay first (late ones on top), then ones already paid, then groups with
 * nothing that month. Within each, the earliest due date first, then the biggest amount.
 */
export function orderForMonth(groups: GridGroup[], month: string): GridGroup[] {
  const rank = (g: GridGroup) => {
    const c = g.total.cells[month];
    if (!c || Math.abs(c.amount) < 0.005) return 3;
    if (c.status === "late") return 0;
    if (c.status === "paid" || c.status === "skipped") return 2;
    return 1;
  };
  const due = (g: GridGroup) => String(g.meta?.[`due:${month}`] ?? "9999");
  const amt = (g: GridGroup) => Math.abs(g.total.cells[month]?.amount ?? 0);
  return groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => rank(a.g) - rank(b.g) || (due(a.g) < due(b.g) ? -1 : due(a.g) > due(b.g) ? 1 : 0) || amt(b.g) - amt(a.g) || a.i - b.i)
    .map((x) => x.g);
}

/** Table order: by the first month shown; groups with nothing then but something later come before empty ones. */
function billsFirst(groups: GridGroup[], months: string[]): GridGroup[] {
  const later = (g: GridGroup) => (months.slice(1).some((m) => Math.abs(g.total.cells[m]?.amount ?? 0) > 0.005) ? 0 : 1);
  const first = orderForMonth(groups, months[0]);
  const idx = new Map(first.map((g, i) => [g.id, i]));
  return [...first].sort((a, b) => {
    const ra = Math.abs(a.total.cells[months[0]]?.amount ?? 0) > 0.005 ? 0 : 1 + later(a);
    const rb = Math.abs(b.total.cells[months[0]]?.amount ?? 0) > 0.005 ? 0 : 1 + later(b);
    return ra - rb || idx.get(a.id)! - idx.get(b.id)!;
  });
}

export function rowTotal(cells: Record<string, GridCell>, months: string[]): number {
  return round2(months.reduce((s, m) => s + (cells[m]?.amount ?? 0), 0));
}

// ---------------------------------------------------------------------------
// To Pay → Credit cards
// ---------------------------------------------------------------------------

/**
 * One group per card: the card total (= the bill for that month), then each EMI billed on the card, then
 * "Spends (bill)" = bill − EMIs on that bill. EMIs sit in the month of the bill that carries them, exactly as
 * the engine bills them, so the card total is never the bill plus the EMIs again.
 */
export function cardGrid(ds: Dataset, positions: Positions, events: FinEvent[], months: string[], today: ISODate): MonthGridData {
  const groups: GridGroup[] = [];
  for (const card of ds.credit_cards) {
    if (card.archived) continue;
    const cp = positions.cards.get(card.id);
    const bills = events.filter((e) => e.kind === "card_bill" && e.cardId === card.id);
    const emis = [
      ...events.filter((e) => e.kind === "emi" && e.cardId === card.id),
      ...ds.loans.filter((l) => l.card_id === card.id && l.emis_paid_offset > 0).flatMap((l) => emisPaidBefore(ds, positions, l.id)),
    ];

    // Statement → due date, for recorded statements and the engine's projected ones.
    const cycles: { s: ISODate; due: ISODate }[] = [
      ...(cp?.statements ?? []).map((st) => ({ s: st.statement.statement_date, due: st.statement.due_date })),
      ...events.filter((e) => e.kind === "card_statement" && e.cardId === card.id && e.estimated).map((e) => ({ s: e.date, due: dueDateFor(card, e.date) })),
    ].sort((a, b) => (a.s < b.s ? -1 : 1));
    const billMonthOf = (e: FinEvent) => {
      // Like the engine: an unbilled EMI from an earlier date lands on the next bill.
      const d = isPending(e) && e.date < today ? today : e.date;
      const expected = statementDateOnOrAfter(card, d);
      // Use a recorded (or projected) statement only when it is the one closing this cycle — a statement
      // months later must not swallow EMIs from cycles that simply weren't recorded.
      const cyc = cycles.find((c) => c.s >= d);
      const near = cyc && cyc.s <= addDays(expected, 7) ? cyc : null;
      return monthKey(near ? near.due : dueDateFor(card, expected));
    };

    // A bill you moved (e.g. paying November's bill in October) takes everything on it along to the new month.
    const movedTo = new Map<string, string>();
    for (const o of ds.event_overrides) {
      if (o.source_type === "card" && o.source_id === card.id && o.action === "reschedule" && o.new_date) movedTo.set(monthKey(o.occurrence_date), monthKey(o.new_date));
    }
    for (const b of bills) if (b.occurrence) movedTo.set(monthKey(b.occurrence), monthKey(b.date));
    const placed = (e: FinEvent) => {
      const m = billMonthOf(e);
      return movedTo.get(m) ?? m;
    };

    const billCells = cellsFrom(bills, months, today);
    const byLoan = new Map<string, FinEvent[]>();
    for (const e of emis) if (e.loanId) byLoan.set(e.loanId, [...(byLoan.get(e.loanId) ?? []), e]);
    const emiRows: GridRow[] = [];
    for (const [loanId, list] of byLoan) {
      const loan = ds.loans.find((l) => l.id === loanId);
      const cells = cellsFrom(list, months, today, placed);
      // An EMI is paid when the card bill that carries it is paid.
      for (const m of Object.keys(cells)) if (billCells[m]) cells[m] = { ...cells[m], status: billCells[m].status };
      if (!Object.keys(cells).length) continue;
      emiRows.push({ id: `emi:${loanId}`, label: loan?.name ?? "EMI", note: loan?.reimbursable_person || "Me", cells, ref: { kind: "loan", id: loanId } });
    }

    // Every spend on its own row, on the bill that carries it. Recorded spends open their entry when tapped.
    const spendRows: GridRow[] = [];
    const asEvent = (date: ISODate): FinEvent => ({ date, status: "planned" }) as FinEvent;
    for (const t of ds.transactions) {
      if (t.card_id !== card.id || t.type !== "card_spend") continue;
      const m = placed(asEvent(t.date));
      if (!months.includes(m)) continue;
      const bill = billCells[m];
      // No bill that month means nothing is left to pay on it: it was paid (often ahead of time).
      const status: CellStatus = bill ? bill.status : t.date > today ? "upcoming" : "paid";
      spendRows.push({
        id: `spend:${t.id}`,
        label: t.description || t.category || "Card spend",
        hint: formatShortDate(t.date),
        hintDate: t.date,
        note: "Me",
        cells: { [m]: { amount: round2(t.amount), status, estimated: false, eventKeys: [`tx:${t.id}`] } },
        ref: { kind: "card-spends", id: card.id },
      });
    }
    // Repeating spends on this card that aren't recorded yet (subscriptions and the like).
    for (const e of events) {
      if (e.cardId !== card.id || e.kind !== "card_spend" || e.estimated || SETTLED.includes(e.status)) continue;
      const m = placed(e);
      if (!months.includes(m)) continue;
      const bill = billCells[m];
      spendRows.push({
        id: `spend:${e.key}`,
        label: e.title,
        hint: formatShortDate(e.date),
        hintDate: e.date,
        note: "Me",
        cells: { [m]: { ...makeCell([e], today), status: bill ? bill.status : cellStatus([e], today) } },
        ref: { kind: "card-spends", id: card.id },
      });
    }
    spendRows.sort((a, b) => ((a.hintDate ?? "") < (b.hintDate ?? "") ? -1 : 1));
    const emiSum = sumCells(emiRows.map((r) => r.cells), months);
    const itemSum = sumCells(spendRows.map((r) => r.cells), months);

    const totalCells: Record<string, GridCell> = {};
    // What's left of each bill after its EMIs and itemised spends: one row per bill, so two bills in a month show as two.
    const restRows = new Map<string, GridRow>();
    for (const m of months) {
      const bill = billCells[m];
      const em = emiSum[m];
      const it = itemSum[m];
      if (bill) {
        totalCells[m] = bill;
        const inMonth = bills.filter((x) => monthKey(x.date) === m);
        // Two bills can share a due date (and so an event key): track each by its position.
        const left = new Map<FinEvent, number>(inMonth.map((x) => [x, eventAmount(x)]));
        // Put each EMI and spend on the bill most likely to carry it, so what's left of each bill is its own row.
        const assign = (amount: number, preferRecorded: boolean) => {
          const fits = (x: FinEvent) => (left.get(x) ?? 0) >= amount - 0.5;
          const pick =
            inMonth.find((x) => Math.abs((left.get(x) ?? 0) - amount) <= 0.5) ??
            inMonth.find((x) => fits(x) && !!x.statementId === preferRecorded) ??
            inMonth.find(fits) ??
            [...inMonth].sort((x, y) => (left.get(y) ?? 0) - (left.get(x) ?? 0))[0];
          if (pick) left.set(pick, round2(Math.max(0, (left.get(pick) ?? 0) - amount)));
        };
        for (const r of emiRows) if (r.cells[m]) assign(r.cells[m].amount, true);
        for (const r of spendRows) if (r.cells[m]) assign(r.cells[m].amount, false);
        for (const x of inMonth) {
          const rest = round2(left.get(x) ?? 0);
          if (rest <= 0.5) continue;
          const st = x.statementId ? ds.card_statements.find((y) => y.id === x.statementId) : null;
          const note = st?.notes?.trim();
          const label = note && note.length <= 28 && !/emi/i.test(note) && note.toLowerCase() !== "spends" ? note : st ? "Bill" : spendRows.length ? "Other on the bill" : "Spends (bill)";
          const id = `rest:${card.id}:${st ? st.id : "est"}`;
          const row = restRows.get(id) ?? { id, label, hint: st && inMonth.length > 1 ? `Bill of ${formatShortDate(st.statement_date)}` : undefined, note: "Me", cells: {}, ref: { kind: "card-spends", id: card.id } };
          row.cells[m] = { ...makeCell([x], today), amount: rest };
          restRows.set(id, row);
        }
      } else if (em || it) {
        // No bill in this month (yet, or already paid): the EMIs and spends are what it carries.
        totalCells[m] = sumCells([em ? { [m]: em } : {}, it ? { [m]: it } : {}], [m])[m];
      }
    }
    const rows: GridRow[] = [...emiRows, ...spendRows, ...restRows.values()];
    // Everything still owed on this card: the unpaid bill, spends not billed yet and the EMIs still to come.
    const emiLeft = round2(
      ds.loans
        .filter((l) => l.card_id === card.id && l.status === "active")
        .reduce((t, l) => {
          const st = positions.loans.get(l.id)?.state;
          return t + (st ? st.schedule.slice(st.paidCount).reduce((a, i) => a + i.emi, 0) : 0);
        }, 0),
    );
    const totalDue = round2(Math.max(0, cp?.outstanding ?? 0) + emiLeft);
    groups.push({
      id: `card:${card.id}`,
      sub: totalDue > 0.5 ? { label: "All dues", value: totalDue } : undefined,
      label: card.name,
      note: [card.issuer, card.last4 ? `··${card.last4}` : null].filter(Boolean).join(" "),
      total: { id: `card-total:${card.id}`, label: "Card total", cells: totalCells, ref: { kind: "card", id: card.id } },
      rows,
      ref: { kind: "card", id: card.id },
      meta: {
        unbilled: cp?.unbilled ?? 0,
        outstanding: cp?.outstanding ?? 0,
        limit: card.credit_limit,
        utilization: cp?.utilization ?? 0,
        statementDay: card.statement_day,
        firstDue: months.map((m) => bills.filter((e) => monthKey(e.date) === m).map((e) => e.date).sort()[0]).find(Boolean) ?? null,
        ...Object.fromEntries(months.map((m) => [`due:${m}`, bills.filter((e) => monthKey(e.date) === m).map((e) => e.date).sort()[0] ?? null])),
        dueDay: card.due_day,
        totalDue,
        emiLeft,
      },
    });
  }
  const ordered = billsFirst(groups, months);
  return { months, groups: ordered, grand: sumCells(ordered.map((g) => g.total.cells), months) };
}

// ---------------------------------------------------------------------------
// To Pay → Chits & SIPs
// ---------------------------------------------------------------------------

export function chitSipGrid(ds: Dataset, positions: Positions, events: FinEvent[], months: string[], today: ISODate): MonthGridData {
  const groups: GridGroup[] = [];
  // Installments paid before tracking, shown as paid in their own month.
  const chitBefore = (chitId: string): FinEvent[] =>
    (positions.chits.get(chitId)?.summary.rows ?? [])
      .filter((r) => !r.tracked && r.paid != null && r.paid > 0)
      .map((r) => paidBefore({ key: `before:chit:${chitId}:${r.scheduledDate}`, source: "chit", sourceId: chitId, chitId, kind: "chit", title: "Chit", installment: r.no }, r.scheduledDate, r.paid!));
  const sipBefore = (inv: Dataset["investments"][number]): FinEvent[] => {
    const out: FinEvent[] = [];
    if (!inv.start_date || !inv.sip_amount) return out;
    const [y, m] = inv.start_date.split("-").map(Number);
    for (let i = 0; i < 240; i++) {
      const mm = m - 1 + i;
      const yy = y + Math.floor(mm / 12);
      const mo = (mm % 12) + 1;
      const day = Math.min(inv.sip_day ?? Number(inv.start_date.slice(8, 10)), new Date(Date.UTC(yy, mo, 0)).getUTCDate());
      const d = `${yy}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (d < inv.start_date) continue;
      if (d >= inv.track_from || d > today) break;
      out.push(paidBefore({ key: `before:sip:${inv.id}:${d}`, source: "sip", sourceId: inv.id, investmentId: inv.id, kind: "sip", title: `SIP · ${inv.name}` }, d, inv.sip_amount));
    }
    return out;
  };

  const chitRows: GridRow[] = ds.chits
    .filter((c) => c.status === "active")
    .map((c) => ({
      id: `chit:${c.id}`,
      label: c.name,
      cells: cellsFrom([...chitBefore(c.id), ...events.filter((e) => e.kind === "chit" && e.chitId === c.id)], months, today),
      ref: { kind: "chit" as const, id: c.id },
    }));
  if (chitRows.length) groups.push({ id: "chits", label: "Chits", total: { id: "chits-total", label: "All chits", cells: sumCells(chitRows.map((r) => r.cells), months) }, rows: chitRows });

  const sipRows: GridRow[] = ds.investments
    .filter((i) => !i.archived && i.sip_active && i.sip_amount > 0)
    .map((i) => ({
      id: `sip:${i.id}`,
      label: i.name,
      cells: cellsFrom([...sipBefore(i), ...events.filter((e) => e.kind === "sip" && e.investmentId === i.id)], months, today),
      ref: { kind: "sip" as const, id: i.id },
    }));
  if (sipRows.length)
    groups.push({ id: "sips", label: "Monthly investments (SIP)", total: { id: "sips-total", label: "All SIPs", cells: sumCells(sipRows.map((r) => r.cells), months) }, rows: sipRows });

  return { months, groups, grand: sumCells(groups.map((g) => g.total.cells), months) };
}

// ---------------------------------------------------------------------------
// To Pay → Loans & borrowed (card EMIs stay with their card)
// ---------------------------------------------------------------------------

export function loanGrid(ds: Dataset, positions: Positions, events: FinEvent[], months: string[], today: ISODate): MonthGridData {
  const groups: GridGroup[] = [];
  const loanRows: GridRow[] = ds.loans
    .filter((l) => l.status === "active" && !l.card_id)
    .map((l) => ({
      id: `loan:${l.id}`,
      label: l.name,
      cells: cellsFrom([...emisPaidBefore(ds, positions, l.id), ...events.filter((e) => e.kind === "emi" && e.loanId === l.id && !e.cardId)], months, today),
      ref: { kind: "loan" as const, id: l.id },
    }));
  if (loanRows.length) groups.push({ id: "loans", label: "Loans", total: { id: "loans-total", label: "All loans", cells: sumCells(loanRows.map((r) => r.cells), months) }, rows: loanRows });

  const borrowRows: GridRow[] = ds.lendings
    .filter((l) => l.direction === "borrowed")
    .map((l) => ({
      id: `borrow:${l.id}`,
      label: l.person,
      cells: cellsFrom(events.filter((e) => e.kind === "borrow_due" && e.lendingId === l.id), months, today),
      ref: { kind: "lending" as const, id: l.id },
    }))
    .filter((r) => Object.keys(r.cells).length);
  if (borrowRows.length)
    groups.push({ id: "borrowed", label: "Borrowed from people", total: { id: "borrowed-total", label: "All borrowed", cells: sumCells(borrowRows.map((r) => r.cells), months) }, rows: borrowRows });

  return { months, groups, grand: sumCells(groups.map((g) => g.total.cells), months) };
}

// ---------------------------------------------------------------------------
// My Money → People owe me
// ---------------------------------------------------------------------------

/**
 * One row per person. A cell holds what they should pay that month (still to come, from the engine's expected
 * repayments) plus what they actually paid back that month (recorded repayments, shown ✓).
 */
export function owedGrid(ds: Dataset, events: FinEvent[], months: string[], today: ISODate): MonthGridData {
  const people = new Map<string, { person: string; evs: FinEvent[] }>();
  const lendingPerson = new Map<string, string>();
  for (const l of ds.lendings) {
    if (l.direction !== "lent") continue;
    const p = personKey(l.person);
    lendingPerson.set(l.id, p);
    if (!people.has(p.toLowerCase())) people.set(p.toLowerCase(), { person: p, evs: [] });
  }
  for (const e of events) {
    if (e.kind !== "lend_due" || !e.lendingId) continue;
    const p = lendingPerson.get(e.lendingId);
    if (p) people.get(p.toLowerCase())!.evs.push(e);
  }
  // Repayments already received become "paid" pseudo-events built straight from the transactions.
  for (const t of ds.transactions) {
    if (t.type !== "lend_repayment" || !t.lending_id) continue;
    const p = lendingPerson.get(t.lending_id);
    if (!p) continue;
    people.get(p.toLowerCase())!.evs.push({
      key: `tx:${t.id}`,
      source: "lending",
      sourceId: t.lending_id,
      lendingId: t.lending_id,
      occurrence: t.date,
      date: t.date,
      kind: "lend_due",
      title: `Repayment from ${p}`,
      amount: t.amount,
      paid: t.amount,
      remaining: 0,
      status: "received",
      flow: "in",
      isFixed: false,
      isEssential: false,
      certainty: "known",
      excluded: false,
      estimated: false,
      txIds: [t.id],
    });
  }
  const rows: GridRow[] = [...people.values()]
    .map(({ person, evs }) => ({ id: `person:${person.toLowerCase()}`, label: person, cells: cellsFrom(evs, months, today), ref: { kind: "person" as const, id: person } }))
    .filter((r) => Object.keys(r.cells).length);
  const groups: GridGroup[] = rows.length ? [{ id: "people", label: "People owe me", total: { id: "people-total", label: "All people", cells: sumCells(rows.map((r) => r.cells), months) }, rows }] : [];
  return { months, groups, grand: sumCells(groups.map((g) => g.total.cells), months) };
}

// ---------------------------------------------------------------------------
// Menu → My jobs & income
// ---------------------------------------------------------------------------

export function incomeGrid(ds: Dataset, events: FinEvent[], months: string[], today: ISODate): MonthGridData {
  const rows: GridRow[] = ds.recurring_rules
    .filter((r) => r.kind === "income")
    .map((r) => ({
      id: `rule:${r.id}`,
      label: r.name,
      note: r.category ?? "",
      cells: cellsFrom(events.filter((e) => e.kind === "income" && e.ruleId === r.id && !e.excluded), months, today),
      ref: { kind: "rule" as const, id: r.id },
    }))
    .filter((r) => Object.keys(r.cells).length || ds.recurring_rules.find((x) => `rule:${x.id}` === r.id)?.active);
  // Money received that isn't from a planned source (one-off income), shown as received.
  const other: FinEvent[] = ds.transactions
    .filter((t) => t.type === "income" && !t.rule_id && !(t.tags ?? []).includes("refund") && !(t.tags ?? []).includes("opening"))
    .map((t) => ({
      key: `tx:${t.id}`,
      source: "rule" as const,
      sourceId: t.id,
      occurrence: t.date,
      date: t.date,
      kind: "income" as const,
      title: t.description || t.category || "Income",
      amount: t.amount,
      paid: t.amount,
      remaining: 0,
      status: "received" as const,
      flow: "in" as const,
      isFixed: false,
      isEssential: false,
      certainty: "known" as const,
      excluded: false,
      estimated: false,
      txIds: [t.id],
    }));
  const otherCells = cellsFrom(other, months, today);
  if (Object.keys(otherCells).length) rows.push({ id: "income:other", label: "Other money received", note: "One-off", cells: otherCells });
  const groups: GridGroup[] = rows.length ? [{ id: "income", label: "Income", total: { id: "income-total", label: "All income", cells: sumCells(rows.map((r) => r.cells), months) }, rows }] : [];
  return { months, groups, grand: sumCells(groups.map((g) => g.total.cells), months) };
}

/** Months from `first` (YYYY-MM-01) for `count` months, as "YYYY-MM" keys. */
export function monthRange(first: ISODate, count: number): string[] {
  const out: string[] = [];
  const [y, m] = first.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const mm = m - 1 + i;
    out.push(`${y + Math.floor(mm / 12)}-${String((mm % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}
