// "Money's already in my bank account": when the bank side of something was already recorded (usually from a bank
// SMS, as plain income or spending), recording the repayment / bill / EMI again would count the money twice.
// These helpers find that bank entry and turn it into the new one, so the money is counted once.

import { diffDays } from "./dates";
import type { Dataset, ISODate, Transaction, TxType } from "./types";

/** Tag on an entry whose money is already in the bank balance through another entry: it doesn't move the balance. */
export const IN_BALANCE = "in-balance";

/** Whether this kind of entry moves money into or out of a bank account (null: it doesn't — card spends, transfers…). */
export function bankDirection(type: TxType, payWith?: string): "in" | "out" | null {
  if (["income", "lend_repayment", "borrow", "invest_sell", "chit_payout"].includes(type)) return "in";
  if (type === "expense") return payWith == null || payWith.startsWith("acct:") ? "out" : null;
  if (["card_payment", "lend", "borrow_repayment", "invest_buy", "loan_prepayment", "chit_installment", "loan_emi"].includes(type)) return "out";
  return null;
}

/** Plain bank entries (income for money in, spending for money out) close in date and amount, best first. */
export function findBankMatches(ds: Dataset, o: { dir: "in" | "out"; accountId?: string | null; date: ISODate; amount?: number | null; excludeId?: string | null }): Transaction[] {
  const want = o.dir === "in" ? "income" : "expense";
  const amt = o.amount ?? null;
  return ds.transactions
    .filter((t) => t.id !== o.excludeId && t.type === want && !t.tags?.includes(IN_BALANCE) && (!o.accountId || t.account_id === o.accountId) && Math.abs(diffDays(t.date, o.date)) <= 15)
    .filter((t) => amt == null || Math.abs(t.amount - amt) <= Math.max(5, amt * 0.25))
    .sort((a, b) => (amt == null ? 0 : Math.abs(a.amount - amt) - Math.abs(b.amount - amt)) || (a.date < b.date ? 1 : -1))
    .slice(0, 5);
}

/** A match close enough to pick on its own (within 5% of the amount). */
export function clearMatch(matches: Transaction[], amount?: number | null): Transaction | null {
  const best = matches[0];
  return best && amount && Math.abs(best.amount - amount) <= Math.max(5, amount * 0.05) ? best : null;
}

/**
 * Turn the bank entry into `body` (amount capped at what reached the bank). If the bank entry was bigger, the rest
 * stays as a separate plain entry. Returns that leftover amount.
 */
export async function mergeIntoBankEntry(
  picked: Transaction,
  body: Partial<Transaction>,
  store: { add: (t: "transactions", row: Partial<Transaction>) => Promise<unknown>; patch: (t: "transactions", id: string, row: Partial<Transaction>) => Promise<void> },
): Promise<number> {
  const { id: _i, created_at: _c, updated_at: _u, user_id: _uid, ...rest } = body as Transaction;
  const amount = Math.min(body.amount ?? picked.amount, picked.amount);
  await store.patch("transactions", picked.id, {
    ...rest,
    amount,
    date: picked.date,
    account_id: picked.account_id ?? rest.account_id ?? null,
    tags: [...new Set([...(picked.tags ?? []), ...(body.tags ?? []).filter((t) => t !== IN_BALANCE)])],
    notes: rest.notes || picked.notes || null,
  });
  const extra = Math.round((picked.amount - amount) * 100) / 100;
  if (extra > 0.5) {
    await store.add("transactions", {
      type: picked.type,
      amount: extra,
      date: picked.date,
      account_id: picked.account_id,
      description: `${picked.description || (picked.type === "income" ? "Money received" : "Payment")} (rest)`,
      category: picked.category ?? null,
      tags: [],
      is_partial: false,
      reconciled: false,
      notes: picked.notes ?? null,
    });
  }
  return extra > 0.5 ? extra : 0;
}
