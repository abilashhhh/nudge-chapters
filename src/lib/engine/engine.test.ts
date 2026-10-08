import { describe, expect, it } from "vitest";
import { addMonths } from "../dates";
import { buildDemoDataset } from "../data/demo";
import type { Account, Chit, CreditCard, Dataset, RecurringRule, Transaction } from "../types";
import { chitSummary } from "./chits";
import { buildAlerts } from "./alerts";
import { dueDateFor, buildEvents, settlementDraft, statementDateOnOrAfter } from "./events";
import { goalProgress, requiredMonthly } from "./goals";
import { classify, computePositions, moneyCtx } from "./ledger";
import { amortize, debtPlan, emiFor, simulatePrepayment } from "./loans";
import { monthMetrics } from "./metrics";
import { affordability, project } from "./projection";
import { nextOccurrenceAfter, occurrences } from "./schedule";
import { xirr } from "./xirr";

const TODAY = "2026-10-08";

function emptyDs(): Dataset {
  return {
    profile: {
      id: "u", country: "IN", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", retirement_age: 60,
      life_expectancy: 85, mode: "simple", onboarding_done: true, assumptions: {}, preferences: {}, fx_rates: {},
    },
    accounts: [], categories: [], credit_cards: [], card_statements: [], loans: [], chits: [], goals: [],
    investments: [], investment_valuations: [], lendings: [], reserves: [], recurring_rules: [], event_overrides: [],
    transactions: [], net_worth_snapshots: [],
  };
}

let n = 0;
const acc = (p: Partial<Account> = {}): Account => ({
  id: `a${++n}`, name: "Bank", type: "savings", currency: "INR", opening_balance: 100_000, opening_date: "2026-01-01",
  min_balance: 0, include_in_cash: true, is_emergency_fund: false, archived: false, ...p,
});
const tx = (p: Partial<Transaction> & Pick<Transaction, "type" | "amount">): Transaction => ({
  id: `t${++n}`, date: "2026-10-01", is_partial: false, reconciled: false, tags: [], ...p,
});
const card = (p: Partial<CreditCard> = {}): CreditCard => ({
  id: `c${++n}`, name: "Card", credit_limit: 100_000, statement_day: 5, due_day: 25, opening_outstanding: 0,
  opening_date: "2026-01-01", expected_monthly_spend: 0, annual_fee: 0, interest_rate_apr: 42, reward_points: 0, archived: false, ...p,
});
const rule = (p: Partial<RecurringRule> & Pick<RecurringRule, "name" | "kind" | "amount">): RecurringRule => ({
  id: `r${++n}`, frequency: "monthly", start_date: "2026-10-01", track_from: "2026-10-01", is_fixed: true, is_essential: false,
  is_subscription: false, certainty: "known", tax_deducted: 0, active: true, ...p,
});

describe("business rules (PRD §31)", () => {
  it("transfers between own accounts are never income or expense", () => {
    const ds = emptyDs();
    const a = acc();
    const b = acc({ opening_balance: 0 });
    ds.accounts = [a, b];
    ds.transactions = [tx({ type: "transfer", amount: 25_000, account_id: a.id, to_account_id: b.id })];
    const p = computePositions(ds, TODAY);
    expect(p.accounts.get(a.id)!.balance).toBe(75_000);
    expect(p.accounts.get(b.id)!.balance).toBe(25_000);
    expect(classify(ds.transactions[0])).toEqual({ income: 0, expense: 0, invested: 0, debtPaid: 0 });
    expect(p.totals.netWorth).toBe(100_000);
  });

  it("a card purchase is the expense; paying the bill only settles the liability", () => {
    const ds = emptyDs();
    const a = acc();
    const c = card();
    ds.accounts = [a];
    ds.credit_cards = [c];
    const spend = tx({ type: "card_spend", amount: 4_000, card_id: c.id, category: "Shopping" });
    const pay = tx({ type: "card_payment", amount: 4_000, card_id: c.id, account_id: a.id, date: "2026-10-05" });
    ds.transactions = [spend, pay];
    expect(classify(spend).expense).toBe(4_000);
    expect(classify(pay).expense).toBe(0);
    const p = computePositions(ds, TODAY);
    expect(p.cards.get(c.id)!.outstanding).toBe(0);
    expect(p.accounts.get(a.id)!.balance).toBe(96_000);
    expect(p.totals.netWorth).toBe(96_000);
  });

  it("lending moves cash into a receivable and back", () => {
    const ds = emptyDs();
    const a = acc();
    ds.accounts = [a];
    ds.lendings = [{ id: "l1", direction: "lent", person: "Ravi", amount: 10_000, date: "2026-09-01", interest_rate: 0, account_id: a.id, include_in_projection: true, written_off: false }];
    ds.transactions = [
      tx({ type: "lend", amount: 10_000, account_id: a.id, lending_id: "l1", date: "2026-09-01" }),
      tx({ type: "lend_repayment", amount: 4_000, account_id: a.id, lending_id: "l1", date: "2026-10-01" }),
    ];
    const p = computePositions(ds, TODAY);
    expect(p.accounts.get(a.id)!.balance).toBe(94_000);
    expect(p.totals.receivables).toBe(6_000);
    expect(p.totals.netWorth).toBe(100_000);
    expect(ds.transactions.every((t) => classify(t).expense === 0)).toBe(true);
    expect(p.lendings.get("l1")!.status).toBe("partially_repaid");
  });

  it("investment purchases are not consumption", () => {
    const t = tx({ type: "invest_buy", amount: 5_000 });
    expect(classify(t).expense).toBe(0);
    expect(classify(t).invested).toBe(5_000);
  });

  it("a settled planned event is not counted again in the projection", () => {
    const ds = emptyDs();
    const a = acc({ opening_balance: 50_000, opening_date: "2026-10-01" });
    ds.accounts = [a];
    const rent = rule({ name: "Rent", kind: "expense", amount: 20_000, day_of_month: 5, account_id: a.id });
    ds.recurring_rules = [rent];
    ds.transactions = [tx({ type: "expense", amount: 20_000, account_id: a.id, rule_id: rent.id, occurrence_date: "2026-10-05", date: "2026-10-05" })];
    const evs = buildEvents(ds, { from: "2026-10-01", to: "2026-10-31", today: TODAY });
    const oct = evs.find((e) => e.occurrence === "2026-10-05")!;
    expect(oct.status).toBe("paid");
    expect(oct.remaining).toBe(0);
    const res = project(ds, { today: TODAY, to: "2026-10-31" });
    expect(res.end.cash).toBe(30_000); // 50k − rent once
    const nov = project(ds, { today: TODAY, to: "2026-11-30" });
    expect(nov.end.cash).toBe(10_000); // November rent applied once more
  });

  it("editing a rule does not change historical actuals", () => {
    const ds = emptyDs();
    const a = acc({ opening_balance: 50_000, opening_date: "2026-09-01" });
    ds.accounts = [a];
    const r = rule({ name: "Rent", kind: "expense", amount: 20_000, day_of_month: 5, account_id: a.id, start_date: "2026-09-01", track_from: "2026-09-01" });
    ds.recurring_rules = [r];
    ds.transactions = [tx({ type: "expense", amount: 20_000, account_id: a.id, rule_id: r.id, occurrence_date: "2026-09-05", date: "2026-09-05" })];
    const before = computePositions(ds, TODAY).accounts.get(a.id)!.balance;
    r.amount = 25_000;
    const after = computePositions(ds, TODAY).accounts.get(a.id)!.balance;
    expect(after).toBe(before);
    const sep = buildEvents(ds, { from: "2026-09-01", to: "2026-09-30", today: TODAY }).find((e) => e.occurrence === "2026-09-05")!;
    expect(sep.status).toBe("adjusted");
    expect(sep.paid).toBe(20_000);
  });

  it("overdue unpaid bills stay pending and are paid 'today' in projections", () => {
    const ds = emptyDs();
    const a = acc({ opening_balance: 10_000, opening_date: "2026-10-01" });
    ds.accounts = [a];
    ds.recurring_rules = [rule({ name: "Electricity", kind: "expense", amount: 2_000, day_of_month: 2, account_id: a.id })];
    const m = monthMetrics(ds, computePositions(ds, TODAY), TODAY);
    expect(m.overdue).toHaveLength(1);
    const res = project(ds, { today: TODAY, to: TODAY });
    expect(res.end.cash).toBe(8_000);
  });
});

describe("schedules", () => {
  it("clamps monthly occurrences to month end", () => {
    const d = occurrences({ frequency: "monthly", start_date: "2026-01-31", day_of_month: 31 }, "2026-01-01", "2026-04-30");
    expect(d).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("handles quarterly and yearly", () => {
    expect(occurrences({ frequency: "quarterly", start_date: "2026-01-15" }, "2026-01-01", "2026-12-31")).toEqual(["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]);
    expect(occurrences({ frequency: "yearly", start_date: "2025-03-10" }, "2026-01-01", "2028-12-31")).toEqual(["2026-03-10", "2027-03-10", "2028-03-10"]);
  });
  it("finds the next occurrence long after the start (budget periods)", () => {
    const spec = { frequency: "monthly" as const, start_date: "2026-07-01", day_of_month: 1 };
    expect(nextOccurrenceAfter(spec, "2026-09-01")).toBe("2026-10-01");
    expect(nextOccurrenceAfter({ ...spec, start_date: "2020-01-01" }, "2026-09-01")).toBe("2026-10-01");
  });
  it("finds card statement and due dates", () => {
    const c = { statement_day: 20, due_day: 5 };
    expect(statementDateOnOrAfter(c, "2026-10-08")).toBe("2026-10-20");
    expect(dueDateFor(c, "2026-10-20")).toBe("2026-11-05");
    const c2 = { statement_day: 5, due_day: 25 };
    expect(dueDateFor(c2, "2026-10-05")).toBe("2026-10-25");
  });
});

describe("loans", () => {
  it("computes EMI with the reducing-balance formula", () => {
    expect(emiFor(120_000, 9.5, 24)).toBeCloseTo(5509.8, 0);
    expect(emiFor(1_000_000, 0, 10)).toBe(100_000);
  });
  it("amortizes to zero and prepayment shortens tenure", () => {
    const loan = { principal: 500_000, interest_rate: 10, tenure_months: 60, interest_type: "reducing" as const, emi_amount: null, first_emi_date: "2026-01-05" };
    const s = amortize(loan);
    expect(s).toHaveLength(60);
    expect(s[59].balance).toBe(0);
    expect(s.reduce((a, x) => a + x.principal, 0)).toBeCloseTo(500_000, 0);
    const withPre = amortize(loan, [{ date: "2026-06-01", amount: 100_000 }]);
    expect(withPre.length).toBeLessThan(60);
    const sim = simulatePrepayment({ ...loan, id: "l", name: "L", type: "personal", emis_paid_offset: 0, processing_fee: 0, status: "active" }, [], { date: "2026-06-01", amount: 100_000 });
    expect(sim.interestSaved).toBeGreaterThan(0);
    expect(sim.monthsSaved).toBeGreaterThan(0);
  });
  it("avalanche never pays more interest than snowball", () => {
    const debts = [
      { id: "a", name: "Card", balance: 50_000, rate: 40, minPayment: 2_500 },
      { id: "b", name: "Personal", balance: 200_000, rate: 12, minPayment: 6_000 },
    ];
    const av = debtPlan(debts, 5_000, "avalanche");
    const sn = debtPlan(debts, 5_000, "snowball");
    const min = debtPlan(debts, 5_000, "minimum");
    expect(av.feasible).toBe(true);
    expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest + 1);
    expect(av.months).toBeLessThan(min.months);
  });
});

describe("math", () => {
  it("xirr of 10% in a year", () => {
    expect(xirr([{ date: "2025-01-01", amount: -1000 }, { date: "2026-01-01", amount: 1100 }])!).toBeCloseTo(10, 0);
  });
  it("required monthly reaches the target", () => {
    const m = requiredMonthly(120_000, 0, 0, 12);
    expect(m).toBe(10_000);
  });
});

describe("card bill projection", () => {
  it("bills card spends and pays them from the payment account on the due date", () => {
    const ds = emptyDs();
    const a = acc({ opening_balance: 50_000, opening_date: "2026-10-01" });
    const c = card({ payment_account_id: a.id, statement_day: 20, due_day: 5, opening_outstanding: 3_000, opening_date: TODAY });
    ds.accounts = [a];
    ds.credit_cards = [c];
    ds.recurring_rules = [rule({ name: "Netflix", kind: "expense", amount: 649, day_of_month: 18, card_id: c.id, track_from: TODAY, start_date: TODAY })];
    const res = project(ds, { today: TODAY, to: "2026-11-10" });
    // Bill on 5 Nov = 3,000 unbilled + 649 Netflix (18 Oct) — cash drops by exactly that.
    expect(res.end.cash).toBe(50_000 - 3_649);
    expect(res.totals.cardPayments).toBe(3_649);
    // The Netflix spend counts as an expense once; the bill payment does not.
    expect(res.totals.expenses).toBe(649);
  });

  it("settling a card bill event creates a card payment, not an expense", () => {
    const ds = emptyDs();
    const a = acc();
    const c = card({ payment_account_id: a.id });
    ds.accounts = [a];
    ds.credit_cards = [c];
    ds.card_statements = [{ id: "s1", card_id: c.id, statement_date: "2026-10-05", due_date: "2026-10-25", total_due: 8_000, min_due: 400 }];
    ds.credit_cards[0].opening_outstanding = 8_000;
    const ev = buildEvents(ds, { from: "2026-10-01", to: "2026-10-31", today: TODAY }).find((e) => e.kind === "card_bill")!;
    expect(ev.remaining).toBe(8_000);
    const draft = settlementDraft(ev, { amount: 8_000, date: TODAY });
    expect(draft.type).toBe("card_payment");
    expect(draft.statement_id).toBe("s1");
  });
});

describe("demo dataset", () => {
  const today = TODAY;
  const ds = buildDemoDataset(today);
  const positions = computePositions(ds, today);

  it("produces sensible current positions", () => {
    expect(positions.totals.cash).toBeGreaterThan(20_000);
    expect(positions.totals.investments).toBeGreaterThan(500_000);
    expect(positions.totals.netWorth).toBeGreaterThan(0);
    for (const p of positions.accounts.values()) expect(p.balance).toBeGreaterThan(0);
  });

  it("projects a year ahead with scenarios ordered sensibly", () => {
    const to = addMonths(today, 12);
    const base = project(ds, { today, to, scenario: "base", positions });
    const cons = project(ds, { today, to, scenario: "conservative", positions });
    const opt = project(ds, { today, to, scenario: "optimistic", positions });
    expect(cons.end.netWorth).toBeLessThan(base.end.netWorth);
    expect(opt.end.netWorth).toBeGreaterThan(base.end.netWorth);
    expect(base.series.length).toBeGreaterThanOrEqual(12);
    // Cash breakdown reconciles exactly.
    const c = base.cash;
    const recon = c.startCash + c.income - c.expenses - c.cardBills - c.emis - c.investments - c.chitInstallments + c.chitPayouts + c.repaymentsIn - c.repaymentsOut + c.transfersNet + c.otherActuals;
    expect(recon).toBeCloseTo(c.endCash, 0);
  });

  it("builds month metrics, alerts and goal progress without errors", () => {
    const m = monthMetrics(ds, positions, today);
    expect(m.incomeTotal).toBeGreaterThan(90_000);
    expect(Number.isFinite(m.spendable)).toBe(true);
    const goals = ds.goals.map((g) => goalProgress(g, positions, today));
    expect(goals.length).toBe(4);
    const alerts = buildAlerts({ ds, positions, events: m.events, goals, today, ctx: moneyCtx(ds) });
    expect(Array.isArray(alerts)).toBe(true);
  });

  it("checks affordability of a large purchase", () => {
    const res = affordability(ds, today, { name: "Laptop", price: 2_00_000, date: addMonths(today, 1), financing: "cash" });
    expect(res.cashImpactAtHorizon).toBeLessThan(0);
  });
});

describe("chits with auction-dependent installments", () => {
  // ₹10 lakh chit over 40 months, ₹25,000 base. Started Sep 2026; today is 8 Oct 2026.
  const chit = (p: Partial<Chit> = {}): Chit => ({
    id: "ch1", name: "Test chit", chit_value: 10_00_000, monthly_contribution: 25_000, installments: 40, start_date: "2026-09-05",
    installments_paid_offset: 0, payout_status: "pending", commission_pct: 5, status: "active", installment_records: [], ...p,
  });
  const pay = (amount: number, occurrence: string) => tx({ type: "chit_installment", amount, chit_id: "ch1", occurrence_date: occurrence, date: occurrence });

  it("never assumes the first installment repeats: later months are TBD until the auction is known", () => {
    const s = chitSummary(chit(), [pay(25_000, "2026-09-05")], TODAY);
    expect(s.rows[0]).toMatchObject({ status: "paid", paid: 25_000, amountState: "actual", adjustment: 0 });
    expect(s.rows[1]).toMatchObject({ status: "overdue", payable: null, amountState: "projected" }); // due 5 Oct, auction result not entered
    expect(s.rows[2]).toMatchObject({ payable: null, amountState: "projected", status: "upcoming" });
    expect(s.actualPaid).toBe(25_000);
    expect(s.tbdCount).toBe(39);
    // Actual figures only: nothing received yet, ₹25,000 paid.
    expect(s.currentNet).toBe(-25_000);
    // No auction history yet → the estimate is the base and the range is "up to" 39 × base.
    expect(s.estimateFromHistory).toBe(false);
    expect(s.tbdHigh).toBe(39 * 25_000);
  });

  it("uses each installment's actual auction-adjusted amount for totals", () => {
    const c = chit({
      installment_records: [
        { no: 2, auction_date: "2026-10-04", dividend: 5_000, source: "foreman_slip" },
        { no: 3, payable: 22_000 },
      ],
    });
    const s = chitSummary(c, [pay(25_000, "2026-09-05"), pay(20_000, "2026-10-05")], TODAY);
    expect(s.rows[1]).toMatchObject({ payable: 20_000, paid: 20_000, adjustment: -5_000, status: "paid", amountState: "actual" });
    expect(s.rows[2]).toMatchObject({ payable: 22_000, adjustment: -3_000, status: "payable", amountState: "confirmed" });
    expect(s.rows[3]).toMatchObject({ payable: null, amountState: "projected" });
    expect(s.actualPaid).toBe(45_000); // 25,000 + 20,000 — not 2 × 25,000
    expect(s.auctionSavings).toBe(5_000);
    expect(s.remainingConfirmed).toBe(22_000);
    expect(s.tbdCount).toBe(37);
    // Estimate from history: savings of 5,000 and 3,000 → average 4,000 → ₹21,000 per future installment.
    expect(s.estimatePerInstallment).toBe(21_000);
    expect(s.tbdEstimate).toBe(37 * 21_000);
    expect(s.tbdLow).toBe(37 * 20_000);
    expect(s.tbdHigh).toBe(37 * 25_000);
    expect(s.currentNet).toBe(-45_000);
    expect(s.projectedOverallNet).toBe(9_50_000 - (45_000 + 22_000 + 37 * 21_000));
  });

  it("feeds confirmed amounts and flagged estimates into the plan, and recalculates when a result is entered", () => {
    const ds = emptyDs();
    const a = acc();
    ds.accounts = [a];
    ds.chits = [chit({ account_id: a.id, installment_records: [{ no: 2, dividend: 5_000 }] })];
    ds.transactions = [pay(25_000, "2026-09-05")];
    const ev = (d: Dataset) => buildEvents(d, { from: "2026-10-01", to: "2026-12-31", today: TODAY }).filter((e) => e.kind === "chit");
    const before = ev(ds);
    expect(before.map((e) => [e.installment, e.amount, e.estimated])).toEqual([
      [2, 20_000, false],
      [3, 20_000, true],
      [4, 20_000, true],
    ]);
    ds.chits = [{ ...ds.chits[0], installment_records: [{ no: 2, dividend: 5_000 }, { no: 3, payable: 23_500, source: "foreman_message" }] }];
    const after = ev(ds);
    expect(after[1]).toMatchObject({ installment: 3, amount: 23_500, estimated: false });
  });

  it("values installments paid before tracking at the base but keeps them out of actual totals", () => {
    const c = chit({ installments_paid_offset: 2, installment_records: [{ no: 2, paid_amount: 19_000 }] });
    const s = chitSummary(c, [], TODAY);
    expect(s.rows[0].status).toBe("unrecorded");
    expect(s.rows[1]).toMatchObject({ status: "paid", paid: 19_000, tracked: false });
    expect(s.actualPaid).toBe(19_000);
    expect(s.unrecordedCount).toBe(1);
    expect(s.unrecordedEstimate).toBe(25_000);
    const p = computePositions({ ...emptyDs(), chits: [c] }, TODAY);
    expect(p.chits.get("ch1")!.paidAmount).toBe(44_000);
  });

  it("after the payout, the remaining debt uses confirmed amounts and estimates, not base × months", () => {
    const c = chit({ payout_status: "received", payout_amount: 8_00_000, installment_records: [{ no: 2, dividend: 6_000 }] });
    const s = chitSummary(c, [pay(25_000, "2026-09-05"), pay(19_000, "2026-10-05")], TODAY);
    expect(s.payoutReceived).toBe(8_00_000);
    expect(s.currentNet).toBe(8_00_000 - 44_000);
    const p = computePositions({ ...emptyDs(), chits: [c], transactions: [pay(25_000, "2026-09-05"), pay(19_000, "2026-10-05")] }, TODAY);
    expect(p.chits.get("ch1")!.liability).toBe(38 * 19_000);
  });
});

describe("backup restore", () => {
  const fakeRepo = (failOn?: string) => {
    const rows: Record<string, Record<string, unknown>[]> = {};
    return {
      rows,
      insertMany: async (t: string, list: Record<string, unknown>[]) => {
        if (t === failOn) throw new Error(`insert into ${t} failed.`);
        rows[t] = [...(rows[t] ?? []), ...list];
        return list;
      },
      upsertSnapshot: async () => undefined,
      updateProfile: async (p: unknown) => p,
      remove: async (t: string, id: string) => {
        rows[t] = (rows[t] ?? []).filter((r) => r.id !== id);
      },
    };
  };
  const file = {
    app: "kosh",
    version: 1,
    profile: { currency: "INR", unknown_profile_thing: 1 },
    tables: {
      accounts: [{ id: "a1", name: "SBI", opening_balance: 1000, bank_branch: "MG Road" }],
      credit_cards: [{ id: "c1", name: "Card", statement_day: 5, due_day: 25, payment_account_id: "a1" }],
      card_statements: [{ id: "s1", card_id: "c1", statement_date: "2026-09-05", due_date: "2026-09-25", amount_due: 14280, minimum_due: 714 }],
    },
  };

  it("maps known alternative field names, drops unknown ones and remaps links", async () => {
    const { restoreBackup } = await import("../data/io");
    const repo = fakeRepo();
    const report = await restoreBackup(repo as never, structuredClone(file) as never);
    const st = repo.rows.card_statements[0];
    expect(st.total_due).toBe(14280);
    expect(st.min_due).toBe(714);
    expect("amount_due" in st).toBe(false);
    expect(st.card_id).toBe(repo.rows.credit_cards[0].id);
    expect(repo.rows.credit_cards[0].payment_account_id).toBe(repo.rows.accounts[0].id);
    expect(report.ignored.accounts).toEqual(["bank_branch"]);
    expect(report.restored).toMatchObject({ accounts: 1, credit_cards: 1, card_statements: 1 });
  });

  it("refuses incomplete files before writing anything", async () => {
    const { restoreBackup } = await import("../data/io");
    const repo = fakeRepo();
    const bad = structuredClone(file);
    delete (bad.tables.card_statements[0] as Record<string, unknown>).amount_due;
    await expect(restoreBackup(repo as never, bad as never)).rejects.toThrow(/missing total_due/);
    expect(Object.keys(repo.rows)).toHaveLength(0);
  });

  it("removes everything it added when saving fails part-way", async () => {
    const { restoreBackup } = await import("../data/io");
    const repo = fakeRepo("card_statements");
    await expect(restoreBackup(repo as never, structuredClone(file) as never)).rejects.toThrow(/Nothing from the backup was kept/);
    expect(repo.rows.accounts).toHaveLength(0);
    expect(repo.rows.credit_cards).toHaveLength(0);
  });
});
