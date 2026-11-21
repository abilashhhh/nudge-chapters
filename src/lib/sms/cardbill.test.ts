// A credit card bill paid through CRED sends two messages: the bank's "debited … CRED Club" (which account, but not
// which card) and the card's "payment received" (which card, but not which account). They're one payment.

import { describe, expect, it } from "vitest";
import { buildEvents } from "../engine/events";
import { computePositions } from "../engine/ledger";
import type { Dataset, Transaction } from "../types";
import { pairSms, proposeFromSms, type SmsRow } from "./match";
import { parseSms } from "./parse";

const TODAY = "2026-11-21";
const CRED_DEBIT: [string, string, string] = [
  "VM-DHANBK-S",
  'INR 5,387.00 is debited from A/c XXXX1766 on 18-NOV-2026 - "UPI TXN: /668814606006-CRED Club/payment on CRED/cred.club@axisb/AXIS0000001/4172120261118000101119339". Aval Bal is INR 12,000.00 -DhanlaxmiBank',
  "2026-11-18T09:14:00Z",
];
const AXIS_RECEIVED: [string, string, string] = ["AX-AXISBK-S", "Payment of INR 5387 has been received towards your Axis Bank Credit Card XX1811 on 18-11-26", "2026-11-18T09:15:00Z"];

const card = (id: string, name: string, last4: string) => ({ id, name, issuer: "Axis Bank", last4, credit_limit: 1_00_000, statement_day: 28, due_day: 18, opening_outstanding: 0, opening_date: "2026-09-01", expected_monthly_spend: 0, annual_fee: 0, interest_rate_apr: 42, reward_points: 0, archived: false, payment_account_id: "dhan" });
function ds(): Dataset {
  return {
    profile: { id: "u", name: "abi", country: "IN", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", retirement_age: 60, life_expectancy: 85, mode: "simple", onboarding_done: true, assumptions: {}, preferences: {}, fx_rates: {} },
    accounts: [{ id: "dhan", name: "Dhanalaxmi Bank Account", type: "savings", institution: "Dhanalaxmi Bank", last4: "1766", currency: "INR", opening_balance: 20_000, opening_date: "2026-10-01", min_balance: 0, include_in_cash: true, is_emergency_fund: false, archived: false }],
    categories: [],
    // Both Axis cards owe about the same: guessing a card from the amount (or from "@axisb") picks the wrong one.
    credit_cards: [card("neo", "AXIS NEO", "4410"), card("fk", "AXIS FLIPKART", "1811")],
    card_statements: [
      { id: "s-neo", card_id: "neo", statement_date: "2026-10-28", due_date: "2026-11-18", total_due: 5390, min_due: 300 },
      { id: "s-fk", card_id: "fk", statement_date: "2026-10-28", due_date: "2026-11-20", total_due: 5387, min_due: 300 },
    ],
    loans: [], chits: [], goals: [], investments: [], investment_valuations: [], lendings: [], reserves: [], recurring_rules: [], event_overrides: [],
    transactions: [], net_worth_snapshots: [], life_items: [], habits: [], habit_logs: [], insurance_policies: [],
  } as unknown as Dataset;
}

let n = 0;
function items(d: Dataset, msgs: [string, string, string][]) {
  const positions = computePositions(d, TODAY);
  const events = buildEvents(d, { from: "2026-09-01", to: "2026-12-31", today: TODAY, positions });
  const list = msgs.map(([sender, body, at]) => {
    const row: SmsRow = { id: `r${++n}`, sender, body, received_at: at, status: "new", transaction_id: null };
    return { row, p: proposeFromSms(row, parseSms(body, sender, TODAY), d, positions, events, TODAY) };
  });
  return pairSms(list, d);
}
const toAdd = (r: ReturnType<typeof items>) => r.filter((i) => i.p.state === "ready" || i.p.state === "check");

describe("card bill paid through CRED", () => {
  it("both messages waiting → one card payment on the card ending 1811, paid from the 1766 account", () => {
    const r = items(ds(), [CRED_DEBIT, AXIS_RECEIVED]);
    const open = toAdd(r);
    expect(open).toHaveLength(1);
    const [one] = open;
    expect(one.p.state).toBe("ready");
    expect(one.p.tx).toMatchObject({ type: "card_payment", card_id: "fk", account_id: "dhan", amount: 5387, date: "2026-11-18" });
    expect(one.p.tx?.notes).toContain("Ref 668814606006");
    expect(one.p.balance).toEqual({ accountId: "dhan", bank: 12000 });
    // Both inbox rows go to that one entry.
    const bank = r.find((i) => i.row.body === CRED_DEBIT[1])!;
    expect(one.p.merged?.map((m) => m.id)).toEqual([bank.row.id]);
    expect(bank.p).toMatchObject({ state: "duplicate", mergedInto: one.row.id });
  });
  it("the same when the card's message comes first", () => {
    const open = toAdd(items(ds(), [AXIS_RECEIVED, CRED_DEBIT]));
    expect(open).toHaveLength(1);
    expect(open[0].p.tx).toMatchObject({ type: "card_payment", card_id: "fk", account_id: "dhan", amount: 5387 });
  });
  it("the bank's message alone waits for the card's: no card guessed, nothing planned paid", () => {
    const [b] = items(ds(), [CRED_DEBIT]);
    expect(b.p.state).toBe("check");
    expect(b.p.tx).toMatchObject({ type: "card_payment", card_id: null, account_id: "dhan", amount: 5387 });
    expect(b.p.card).toBeUndefined();
    expect(b.p.event).toBeUndefined();
    expect(b.p.reason).toMatch(/CRED/);
  });
  it("the card's message already recorded with no account: the bank's message completes it, not a second entry", () => {
    const d = ds();
    const old = { id: "t1", type: "card_payment", amount: 5387, date: "2026-11-18", card_id: "fk", account_id: null, description: "AXIS FLIPKART bill", tags: ["sms:old"], is_partial: false, reconciled: false } as unknown as Transaction;
    d.transactions.push(old);
    const [b] = items(d, [CRED_DEBIT]);
    expect(b.p.state).toBe("ready");
    expect(b.p.replaces?.id).toBe("t1");
    expect(b.p.tx).toMatchObject({ type: "card_payment", card_id: "fk", account_id: "dhan", amount: 5387 });
  });
  it("the card's message already recorded from the same account: the bank's message is a duplicate", () => {
    const d = ds();
    d.transactions.push({ id: "t1", type: "card_payment", amount: 5387, date: "2026-11-18", card_id: "fk", account_id: "dhan", description: "AXIS FLIPKART bill", tags: ["sms:old"], is_partial: false, reconciled: false } as unknown as Transaction);
    const [b] = items(d, [CRED_DEBIT]);
    expect(b.p.state).toBe("duplicate");
    expect(b.p.duplicateOf?.id).toBe("t1");
  });
  it("a different amount on the card isn't paired", () => {
    const r = items(ds(), [CRED_DEBIT, ["AX-AXISBK-S", "Payment of INR 2000 has been received towards your Axis Bank Credit Card XX1811 on 18-11-26", "2026-11-18T09:15:00Z"]]);
    expect(toAdd(r)).toHaveLength(2);
    expect(r[0].p.tx?.card_id).toBeNull();
  });
});
