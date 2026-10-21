import { describe, expect, it } from "vitest";
import { buildEvents } from "../engine/events";
import { computePositions } from "../engine/ledger";
import type { Account, CardStatement, CreditCard, Dataset } from "../types";
import { proposeFromSms, type SmsRow } from "./match";
import { parseSms } from "./parse";

const TODAY = "2026-10-17";
function ds(): Dataset {
  const acct: Account = { id: "a1", name: "Kotak Savings", type: "savings", institution: "Kotak Bank", last4: "9012", currency: "INR", opening_balance: 20_000, opening_date: "2026-10-01", min_balance: 0, include_in_cash: true, is_emergency_fund: false, archived: false };
  const card: CreditCard = { id: "c1", name: "HDFC SWIGGY", issuer: "HDFC Bank", last4: "3996", credit_limit: 1_00_000, statement_day: 27, due_day: 15, opening_outstanding: 0, opening_date: "2026-09-01", expected_monthly_spend: 0, annual_fee: 0, interest_rate_apr: 42, reward_points: 0, archived: false, payment_account_id: "a1" };
  const st: CardStatement = { id: "s1", card_id: "c1", statement_date: "2026-09-27", due_date: "2026-10-20", total_due: 1155.97, min_due: 100 };
  return {
    profile: { id: "u", country: "IN", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", retirement_age: 60, life_expectancy: 85, mode: "simple", onboarding_done: true, assumptions: {}, preferences: {}, fx_rates: {} },
    accounts: [acct], categories: [{ id: "k", name: "Food & dining", kind: "expense", is_fixed: false, is_essential: false, archived: false }], credit_cards: [card], card_statements: [st], loans: [], chits: [], goals: [],
    investments: [], investment_valuations: [], lendings: [], reserves: [], recurring_rules: [], event_overrides: [],
    transactions: [], net_worth_snapshots: [], life_items: [], habits: [], habit_logs: [], insurance_policies: [],
  } as unknown as Dataset;
}
const row = (body: string): SmsRow => ({ id: "r", sender: "AX-HDFCBK", body, received_at: `${TODAY}T10:00:00Z`, status: "new", transaction_id: null });
function propose(d: Dataset, body: string) {
  const positions = computePositions(d, TODAY);
  const events = buildEvents(d, { from: "2026-09-01", to: "2026-12-31", today: TODAY, positions });
  return proposeFromSms(row(body), parseSms(body, "AX-HDFCBK", TODAY), d, positions, events, TODAY);
}

describe("SMS → transaction", () => {
  it("a card spend goes on the card with a category", () => {
    const p = propose(ds(), "Spent Rs.215.00 On HDFC Bank Card 3996 At SWIGGY On 2026-10-16:12:00:00");
    expect(p.state).toBe("ready");
    expect(p.tx).toMatchObject({ type: "card_spend", card_id: "c1", amount: 215, date: "2026-10-16", description: "Swiggy", category: "Food & dining" });
  });
  it("paying the card bill from the bank pays the planned bill, and the card's own SMS is then a duplicate", () => {
    const d = ds();
    const p = propose(d, "Rs.1155.97 debited from A/c XX9012 on 16-10-26 towards HDFC Credit Card. Avl Bal Rs.18,844.03 -Kotak");
    expect(p.state).toBe("ready");
    expect(p.tx).toMatchObject({ type: "card_payment", card_id: "c1", account_id: "a1", amount: 1155.97 });
    expect(p.event?.kind).toBe("card_bill");
    expect(p.balance).toEqual({ accountId: "a1", bank: 18844.03 });
    d.transactions.push({ id: "t1", ...(p.tx as object) } as never);
    const again = propose(d, "Payment of Rs 1,155.97 has been received on your HDFC Bank Credit Card ending 3996 on 16-10-2026.");
    expect(again.state).toBe("duplicate");
  });
  it("a debit card payment goes to the account the card belongs to", () => {
    const d = ds();
    d.accounts[0].card_last4 = "5625";
    const p = propose(d, "Rs 450.00 spent on your Kotak Bank Debit Card XX5625 at DMART on 16-10-26. Avl bal Rs 19,550.00");
    expect(p.state).toBe("ready");
    expect(p.tx).toMatchObject({ type: "expense", account_id: "a1", amount: 450 });
  });
  it("an unknown account waits for you", () => {
    const p = propose(ds(), "Rs.500 debited from A/c XX7777 on 16-10-26 to VPA abc@upi");
    expect(p.state).toBe("check");
    expect(p.reason).toMatch(/7777/);
  });
  it("money from someone who owes you settles what they owe, oldest first; extra stays as money received", () => {
    const d = ds();
    const lend = (id: string, n: number, due: string) => ({ id, direction: "lent", person: `Surya — laptop EMI ${n}/7`, amount: 10222.64, date: due, expected_date: due, interest_rate: 0, account_id: "a1", include_in_projection: true, written_off: false });
    d.lendings = [lend("l2", 2, "2026-11-26"), lend("l1", 1, "2026-10-26")] as never;
    const p = propose(d, "Rs. 10,385 received in Kotak A/c XX9012 on 16-Oct-26 from SURYA P via UPI (Ref ID: 131632497612). Avl. Bal. Rs. 30,385.00");
    expect(p.tx).toMatchObject({ type: "lend_repayment", lending_id: "l1", amount: 10222.64, account_id: "a1", description: "Surya paid back · laptop EMI 1/7" });
    expect(p.also).toHaveLength(1);
    expect(p.also?.[0]).toMatchObject({ type: "lend_repayment", lending_id: "l2", amount: 162.36, is_partial: true });
  });
  it("money from someone who owes nothing is plain income", () => {
    const p = propose(ds(), "Rs. 500 received in Kotak A/c XX9012 on 16-Oct-26 from SURYA P via UPI");
    expect(p.tx?.type).toBe("income");
  });
  it("OTPs are ignored", () => {
    expect(propose(ds(), "123456 is your OTP for Rs 500 at AMAZON").state).toBe("ignore");
  });
});
