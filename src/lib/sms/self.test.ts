import { describe, expect, it } from "vitest";
import { buildEvents } from "../engine/events";
import { computePositions } from "../engine/ledger";
import type { Dataset } from "../types";
import { mentions, pairSms, proposeFromSms, type SmsRow } from "./match";
import { parseSms } from "./parse";

const TODAY = "2026-10-17";
const acct = (id: string, name: string, institution: string, last4: string | null, type = "savings") => ({ id, name, type, institution, last4, currency: "INR", opening_balance: 10_000, opening_date: "2026-10-01", min_balance: 0, include_in_cash: true, is_emergency_fund: false, archived: false });
function ds(): Dataset {
  return {
    profile: { id: "u", name: "abi", country: "IN", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", retirement_age: 60, life_expectancy: 85, mode: "simple", onboarding_done: true, assumptions: {}, preferences: { sms: { selfNames: ["Abilash N"] } }, fx_rates: {} },
    accounts: [acct("slice", "Slice Bank Account", "Slice Bank", "6080"), acct("dhan", "Dhanalaxmi Bank Account", "Dhanalaxmi Bank", "1766"), acct("cred", "Cred Wallet", "Cred", null, "wallet")],
    categories: [{ id: "f", name: "Fees & charges", kind: "expense", is_fixed: false, is_essential: false, archived: false }],
    credit_cards: [{ id: "sbi", name: "SBI BPCL", issuer: "State Bank of India", last4: "1697", credit_limit: 1_00_000, statement_day: 12, due_day: 30, opening_outstanding: 0, opening_date: "2026-09-01", expected_monthly_spend: 0, annual_fee: 0, interest_rate_apr: 42, reward_points: 0, archived: false }],
    card_statements: [], loans: [], chits: [], goals: [], investments: [], investment_valuations: [], lendings: [], reserves: [], recurring_rules: [], event_overrides: [],
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

describe("self transfers from bank SMS", () => {
  it("Dhanlaxmi: credited to XX1766, debited from XX6080 — two messages, one transfer Slice → Dhanlaxmi", () => {
    const r = items(ds(), [
      ["VM-DHANBK-S", "Your a/c no. XX1766 is credited for Rs.100.00 on 17-10-26 and debited from a/c no. XX6080 (UPI Ref no 665621449834).-DhanlaxmiBank", "2026-10-16T19:56:00Z"],
      ["VM-DHANBK-S", 'INR 100.00 is credited to A/c XXXX1766 on 17-OCT-2026 - "UPI TXN: /665621449834-Abilash N/Paid via CRED/7902253958@yescred/917902253958/4172120261016000101119339". Aval Bal is INR 2,937.91 -DhanlaxmiBank', "2026-10-16T19:56:10Z"],
    ]);
    expect(r[0].p.state).toBe("ready");
    expect(r[0].p.tx).toMatchObject({ type: "transfer", account_id: "slice", to_account_id: "dhan", amount: 100 });
    expect(r[0].p.balance).toEqual({ accountId: "dhan", bank: 2937.91 });
    expect(r[1].p.state).toBe("duplicate");
  });
  it("Slice: sent to ABILASH N is a transfer to yourself; with the other bank's credit it becomes one transfer", () => {
    const alone = items(ds(), [["VK-SLCBNK-S", "Rs. 1,421.66 sent from a/c xx6080 on 15-Oct-26 to ABILASH N (UPI Ref: 665427245035). Not you? Call 08048329999 - slice", "2026-10-15T15:01:00Z"]]);
    expect(alone[0].p.tx).toMatchObject({ type: "transfer", account_id: "slice", to_account_id: null });
    expect(alone[0].p.state).toBe("check");
    // Paid to someone else stays a payment.
    const other = items(ds(), [["VM-SLCBNK-S", "Rs. 10,999 sent from a/c xx6080 on 11-Oct-26 to SYED SALMAN (UPI Ref: 628482080263). Not you? Call 08048329999 - slice", "2026-10-11T14:25:00Z"]]);
    expect(other[0].p.tx).toMatchObject({ type: "expense", account_id: "slice", amount: 10999, description: "Syed Salman" });
  });
  it("round-ups and beneficiary messages are ignored", () => {
    const r = items(ds(), [
      ["VA-SLCBNK-S", "You transferred Rs. 62 from Round ups to slice xx6080 savings successfully. For queries, call 080-4832-9999 - slice", "2026-10-16T20:21:00Z"],
      ["CREDWL-S", "You've updated/added a beneficiary: 'Abilash N' on your CRED wallet.For any queries or support, please call on 080-62752800", "2026-10-16T20:21:00Z"],
    ]);
    expect(r.map((i) => i.p.state)).toEqual(["ignore", "ignore"]);
  });
  it("SBI card spend at Dreamplug (CRED) + CRED wallet credit = loading the wallet, with the fee as a spend", () => {
    const r = items(ds(), [
      ["VA-SBICRD-S", "Rs.15,289.93 spent on your SBI Credit Card ending 1697 at DreamplugtechnologiesPV on 16/10/26. Trxn. not done by you? Report at https://sbicard.com/Dispute", "2026-10-16T17:05:00Z"],
      ["CREDWL-S", "Update from CRED wallet: Rs.15,000.00 has been successfully credited to your CRED wallet. Your updated CRED wallet balance is Rs.20,000.00. For any queries or support, call 080-62752800", "2026-10-16T17:05:30Z"],
    ]);
    expect(r[0].p.state).toBe("ready");
    expect(r[0].p.tx).toMatchObject({ type: "card_spend", card_id: "sbi", amount: 15000, tags: ["self-transfer"] });
    expect(r[0].p.also).toEqual([
      expect.objectContaining({ type: "income", account_id: "cred", amount: 15000, tags: ["self-transfer"] }),
      expect.objectContaining({ type: "card_spend", amount: 289.93, category: "Fees & charges" }),
    ]);
    expect(r[0].p.balance).toEqual({ accountId: "cred", bank: 20000 });
    expect(r[1].p.state).toBe("duplicate");
  });
  it("CRED wallet cashback is money in; a wallet payment with no payee pairs with your own bank's credit", () => {
    const r = items(ds(), [
      ["CREDWL-S", "Update: ₹50 has been successfully credited to your CRED wallet. Your updated CRED wallet balance is ₹20,050.", "2026-10-16T18:00:00Z"],
    ]);
    expect(r[0].p.tx).toMatchObject({ type: "income", account_id: "cred", amount: 50 });
    expect(r[0].p.balance).toEqual({ accountId: "cred", bank: 20050 });
    const t = items(ds(), [
      ["CREDWL-S", "Update from CRED wallet: You have successfully paid Rs.5000.0 and your updated wallet balance is Rs.5000.0.", "2026-10-16T18:10:00Z"],
      ["VM-DHANBK-S", 'INR 5,000.00 is credited to A/c XXXX1766 on 17-OCT-2026 - "UPI TXN: /665600000001-Abilash N/Paid via CRED/x@yescred". Aval Bal is INR 7,937.91 -DhanlaxmiBank', "2026-10-16T18:10:20Z"],
    ]);
    expect(t[0].p.tx).toMatchObject({ type: "transfer", account_id: "cred", to_account_id: "dhan", amount: 5000 });
    expect(t[1].p.state).toBe("duplicate");
  });

  // The real messages from 18 Oct: CRED wallet pays ₹5,000 to Slice, and Slice says "from Abilash Narayanan".
  const CRED_PAID = "Update from CRED wallet:\n\nYou have successfully paid Rs.5000.0 and your updated wallet balance is Rs.0.0. \n\nFor any queries or support, call 080-62752800";
  const SLICE_IN = "Rs. 5,000 received in slice A/c xx6080 on 18-Oct-26 from Abilash Narayanan via UPI (Ref ID: 629118065844). Avl. Bal. Rs. 29,916.96 - slice";

  it("knows you by first name + initial or full name, either way round", () => {
    expect(mentions("from Abilash Narayanan via UPI", ["Abilash N"])).toBe(true);
    expect(mentions("to ABILASH N (UPI Ref", ["Abilash Narayanan"])).toBe(true);
    expect(mentions("from ABILASH via UPI", ["Abilash N"])).toBe(false);
    expect(mentions("from Abhijith S via UPI", ["Abilash N"])).toBe(false);
    expect(mentions("from Abilashkumar N", ["Abilash N"])).toBe(false);
  });

  it("wallet 'paid' + Slice 'received from Abilash Narayanan' arriving together = one transfer CRED → Slice", () => {
    const r = items(ds(), [
      ["CREDWL-S", CRED_PAID, "2026-10-18T08:38:28Z"],
      ["SLCBNK-T", SLICE_IN, "2026-10-18T08:38:30Z"],
    ]);
    expect(r[0].p.state).toBe("ready");
    expect(r[0].p.tx).toMatchObject({ type: "transfer", account_id: "cred", to_account_id: "slice", amount: 5000 });
    expect(r[1].p.state).toBe("duplicate");
  });

  it("if the wallet's message was already saved as a payment, the Slice message turns it into the transfer", () => {
    const d = ds();
    d.transactions.push({ id: "w1", date: "2026-10-18", type: "expense", amount: 5000, account_id: "cred", description: "Payment", tags: ["sms:x"], is_partial: false, reconciled: false } as never);
    const [r] = items(d, [["SLCBNK-T", SLICE_IN, "2026-10-18T08:38:30Z"]]);
    expect(r.p.state).toBe("ready");
    expect(r.p.replaces?.id).toBe("w1");
    expect(r.p.tx).toMatchObject({ type: "transfer", account_id: "cred", to_account_id: "slice", amount: 5000 });
    expect(r.p.balance).toEqual({ accountId: "slice", bank: 29916.96 });
  });

  it("a balance correction or a payment with another reference is never mistaken for this one", () => {
    const d = ds();
    d.transactions.push({ id: "adj", date: "2026-10-16", type: "adjustment", amount: 5000, account_id: "slice", description: "Balance matched with bank", tags: ["reconcile"] } as never);
    d.transactions.push({ id: "other", date: "2026-10-18", type: "income", amount: 5000, account_id: "slice", description: "X", notes: "Ref 111111111111 · From bank SMS", tags: [] } as never);
    const [r] = items(d, [["SLCBNK-T", SLICE_IN.replace("Abilash Narayanan", "RAHUL K"), "2026-10-18T08:38:30Z"]]);
    expect(r.p.state).toBe("ready");
    expect(r.p.tx).toMatchObject({ type: "income", account_id: "slice", amount: 5000 });
  });
});
