// Money owed to you (requirement §4): purchases and loans you paid for on someone else's behalf.
//
// Outstanding = total owed − repayments received − amount written off. These never count as your income or
// expense; the card bill that carries them is still a real payment you owe the bank.

import { round2 } from "../money";
import type { Dataset, ISODate, Lending, Loan, Transaction } from "../types";
import type { FinEvent } from "./events";
import type { LendingPosition, Positions } from "./ledger";

export type ReimbursementStatus = "active" | "completed" | "overdue" | "written_off";

export interface ReimbursementGroup {
  key: string;
  person: string;
  /** Lendings belonging to this person (one-time amounts or one per EMI). */
  items: LendingPosition[];
  /** Card EMIs / loans marked as reimbursable by this person. */
  loans: Loan[];
  description: string;
  total: number;
  received: number;
  writtenOff: number;
  outstanding: number;
  /** Outstanding on items whose expected date has passed. */
  overdue: number;
  /** Outstanding on items not due yet (e.g. future EMIs). */
  scheduled: number;
  next: { date: ISODate; amount: number } | null;
  status: ReimbursementStatus;
  history: Transaction[];
  recurring: boolean;
  /** Next repayment lands after the card bill it should cover. */
  cardRisk: { billDate: ISODate; card: string; repaymentDate: ISODate } | null;
}

/** "Surya — laptop EMI 1/7" → "Surya". */
export function personKey(name: string): string {
  return name.split(/\s+[—–-]\s+/)[0].trim();
}

export function reimbursements(ds: Dataset, positions: Positions, today: ISODate, events: FinEvent[] = []): ReimbursementGroup[] {
  const groups = new Map<string, ReimbursementGroup>();
  const get = (person: string) => {
    const key = person.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = {
        key, person, items: [], loans: [], description: "", total: 0, received: 0, writtenOff: 0, outstanding: 0, overdue: 0, scheduled: 0,
        next: null, status: "active", history: [], recurring: false, cardRisk: null,
      };
      groups.set(key, g);
    }
    return g;
  };
  for (const lp of positions.lendings.values()) {
    const l: Lending = lp.lending;
    if (l.direction !== "lent") continue;
    const g = get(personKey(l.person));
    g.items.push(lp);
    g.total += l.amount;
    g.received += lp.repaid;
    if (l.written_off) g.writtenOff += Math.max(0, l.amount - lp.repaid);
    g.outstanding += lp.outstanding;
    const due = l.expected_date ?? l.date;
    if (lp.outstanding > 0.5) {
      if (due < today) g.overdue += lp.outstanding;
      else g.scheduled += lp.outstanding;
      if (due >= today && (!g.next || due < g.next.date)) g.next = { date: due, amount: lp.outstanding };
    }
    g.history.push(...ds.transactions.filter((t) => t.lending_id === l.id));
  }
  for (const loan of ds.loans) {
    if (!loan.reimbursable_person) continue;
    get(loan.reimbursable_person).loans.push(loan);
  }
  const cardName = new Map(ds.credit_cards.map((c) => [c.id, c.name]));
  for (const g of groups.values()) {
    g.items.sort((a, b) => ((a.lending.expected_date ?? a.lending.date) < (b.lending.expected_date ?? b.lending.date) ? -1 : 1));
    g.history.sort((a, b) => (a.date < b.date ? 1 : -1));
    g.recurring = g.items.length > 1 || g.loans.length > 0;
    g.description = g.loans.length ? g.loans.map((l) => l.name).join(", ") : g.items.length === 1 ? g.items[0].lending.notes ?? "One-time" : `${g.items.length} amounts`;
    const all = g.items.every((i) => i.lending.written_off);
    g.status = all && g.items.length ? "written_off" : g.outstanding <= 0.5 ? "completed" : g.overdue > 0.5 ? "overdue" : "active";
    for (const k of ["total", "received", "writtenOff", "outstanding", "overdue", "scheduled"] as const) g[k] = round2(g[k]);
    // Card-bill timing check: the friend's next repayment should arrive before the bill that carries their EMI.
    const cards = new Set(g.loans.map((l) => l.card_id).filter(Boolean) as string[]);
    if (g.next && cards.size) {
      const bill = events.find((e) => e.kind === "card_bill" && e.cardId && cards.has(e.cardId) && (e.reimbursablePart ?? 0) > 0 && e.date >= today);
      if (bill && bill.date < g.next.date) g.cardRisk = { billDate: bill.date, card: cardName.get(bill.cardId!) ?? "card", repaymentDate: g.next.date };
    }
  }
  return [...groups.values()].sort((a, b) => b.outstanding - a.outstanding);
}

export function owedSummary(groups: ReimbursementGroup[]) {
  const sum = (k: "total" | "received" | "writtenOff" | "outstanding" | "overdue" | "scheduled") => round2(groups.reduce((s, g) => s + g[k], 0));
  return { total: sum("total"), received: sum("received"), writtenOff: sum("writtenOff"), outstanding: sum("outstanding"), overdue: sum("overdue"), scheduled: sum("scheduled") };
}
