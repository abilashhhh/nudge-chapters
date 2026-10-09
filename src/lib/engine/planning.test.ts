import { describe, expect, it } from "vitest";
import type { Account, CreditCard, Dataset, Goal, Lending, LifeItem, Loan, RecurringRule, Transaction } from "../types";
import { buildEvents } from "./events";
import { classify, computePositions } from "./ledger";
import { monthMetrics, monthlyNorms } from "./metrics";
import { planMonth } from "./planner";
import { project } from "./projection";
import { owedSummary, reimbursements } from "./reimburse";

const TODAY = "2026-10-09";
let n = 0;
function ds0(): Dataset {
  return {
    profile: { id: "u", country: "IN", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", retirement_age: 60, life_expectancy: 85, mode: "simple", onboarding_done: true, assumptions: {}, preferences: {}, fx_rates: {} },
    accounts: [], categories: [], credit_cards: [], card_statements: [], loans: [], chits: [], goals: [], investments: [], investment_valuations: [],
    lendings: [], reserves: [], recurring_rules: [], event_overrides: [], transactions: [], net_worth_snapshots: [], life_items: [],
  };
}
const acc = (p: Partial<Account> = {}): Account => ({ id: `a${++n}`, name: "Bank", type: "savings", currency: "INR", opening_balance: 50_000, opening_date: "2026-10-01", min_balance: 0, include_in_cash: true, is_emergency_fund: false, archived: false, ...p });
const rule = (p: Partial<RecurringRule> & Pick<RecurringRule, "name" | "kind" | "amount">): RecurringRule => ({ id: `r${++n}`, frequency: "monthly", start_date: "2026-10-01", track_from: "2026-10-01", is_fixed: true, is_essential: false, is_subscription: false, certainty: "known", tax_deducted: 0, active: true, ...p });
const goal = (p: Partial<Goal> & Pick<Goal, "name" | "target_amount">): Goal => ({ id: `g${++n}`, kind: "other", current_amount: 0, monthly_contribution: 0, linked_account_ids: [], linked_investment_ids: [], priority: 3, archived: false, ...p });
const tx = (p: Partial<Transaction> & Pick<Transaction, "type" | "amount">): Transaction => ({ id: `t${++n}`, date: "2026-10-05", is_partial: false, reconciled: false, tags: [], ...p });
const card = (p: Partial<CreditCard> = {}): CreditCard => ({ id: `c${++n}`, name: "Card", credit_limit: 100_000, statement_day: 5, due_day: 25, opening_outstanding: 0, opening_date: "2026-10-01", expected_monthly_spend: 0, annual_fee: 0, interest_rate_apr: 42, reward_points: 0, archived: false, ...p });

function salaryDs() {
  const ds = ds0();
  const a = acc({ opening_balance: 0 });
  ds.accounts = [a];
  ds.recurring_rules = [
    rule({ name: "Salary", kind: "income", amount: 60_000, start_date: "2026-11-01", account_id: a.id }),
    rule({ name: "Rent", kind: "expense", amount: 20_000, start_date: "2026-11-01" }),
  ];
  return ds;
}

describe("goal allocation by priority", () => {
  it("funds every goal when there is enough", () => {
    const ds = salaryDs();
    ds.goals = [goal({ name: "EF", kind: "emergency", target_amount: 120_000, target_date: "2027-11-30", priority: 1 }), goal({ name: "Trip", target_amount: 24_000, target_date: "2027-11-30", priority: 3 })];
    const p = planMonth(ds, computePositions(ds, TODAY), TODAY, "2026-11-01");
    expect(p.available).toBe(40_000);
    expect(p.allocations.every((a) => a.funded === "full")).toBe(true);
    expect(p.shortfall).toBe(0);
  });

  it("protects higher priorities first when money is short", () => {
    const ds = salaryDs();
    ds.goals = [
      goal({ name: "Car", target_amount: 600_000, target_date: "2027-10-31", priority: 2 }),
      goal({ name: "EF", kind: "emergency", target_amount: 300_000, target_date: "2027-10-31", priority: 1 }),
      goal({ name: "Trip", target_amount: 50_000, target_date: "2027-03-31", priority: 4 }),
    ];
    const p = planMonth(ds, computePositions(ds, TODAY), TODAY, "2026-11-01");
    const by = Object.fromEntries(p.allocations.map((a) => [a.goal.name, a]));
    expect(p.allocations[0].goal.name).toBe("EF");
    expect(by.EF.funded).toBe("full");
    expect(by.Car.funded).toBe("partial");
    expect(by.Trip.recommended).toBe(0);
    expect(p.allocated).toBeCloseTo(40_000, 0);
    expect(p.shortfall).toBeGreaterThan(0);
    expect(p.recommendations.length).toBeGreaterThan(0);
  });
});

describe("month-specific figures", () => {
  it("November uses November's bills, not October's", () => {
    const ds = salaryDs();
    ds.recurring_rules.push(rule({ name: "Insurance", kind: "expense", amount: 9_000, frequency: "once", start_date: "2026-12-10" }));
    const pos = computePositions(ds, TODAY);
    const nov = monthMetrics(ds, pos, TODAY, undefined, "2026-11-15");
    const dec = monthMetrics(ds, pos, TODAY, undefined, "2026-12-15");
    expect(nov.period).toBe("future");
    expect(nov.committedTotal).toBe(20_000);
    expect(dec.committedTotal).toBe(29_000);
  });

  it("a task's estimated cost is reserved in its month and reconciled with the actual", () => {
    const ds = salaryDs();
    const task: LifeItem = { id: "bike", kind: "task", title: "Bike service", status: "open", due_date: "2026-11-15", repeat: "none", priority: 1, tags: [], pinned: false, data: { estimated_cost: 3_000 }, source: "user" };
    ds.life_items = [task];
    const pos = computePositions(ds, TODAY);
    expect(monthMetrics(ds, pos, TODAY, undefined, "2026-11-01").committedTotal).toBe(23_000);
    // Done, and it actually cost 3,400: the actual replaces the estimate (never both).
    ds.life_items = [{ ...task, status: "done" }];
    ds.transactions = [tx({ type: "expense", amount: 3_400, date: "2026-11-15", account_id: ds.accounts[0].id, tags: ["task:bike"] })];
    const ev = buildEvents(ds, { from: "2026-11-01", to: "2026-11-30", today: TODAY }).find((e) => e.key === "task:bike")!;
    expect(ev.status).toBe("paid");
    expect(ev.remaining).toBe(0);
    expect(ev.paid).toBe(3_400);
  });
});

describe("reimbursable purchases", () => {
  function surya() {
    const ds = ds0();
    const a = acc({ opening_balance: 100_000 });
    const c = card({ statement_day: 5, due_day: 25 });
    const loan: Loan = {
      id: "laptop", name: "Surya laptop EMI", type: "card_emi", principal: 70_000, interest_rate: 0, interest_type: "reducing", tenure_months: 7, emi_amount: 10_000,
      first_emi_date: "2026-10-26", emis_paid_offset: 0, card_id: c.id, reimbursable_person: "Surya", processing_fee: 0, status: "active",
    };
    const lendings: Lending[] = Array.from({ length: 7 }, (_, i) => ({
      id: `s${i}`, direction: "lent", person: `Surya — laptop EMI ${i + 1}/7`, amount: 10_000, date: `2026-${String(10 + i).padStart(2, "0")}-26`.replace("2026-13", "2027-01").replace("2026-14", "2027-02").replace("2026-15", "2027-03").replace("2026-16", "2027-04"),
      expected_date: null, interest_rate: 0, include_in_projection: true, written_off: false,
    }));
    lendings.forEach((l) => (l.expected_date = l.date));
    ds.accounts = [a];
    ds.credit_cards = [c];
    ds.loans = [loan];
    ds.lendings = lendings;
    return ds;
  }

  it("is not a personal EMI, expense or income, but stays in the card bill", () => {
    const ds = surya();
    const pos = computePositions(ds, TODAY);
    const norms = monthlyNorms(ds, pos);
    expect(norms.emis).toBe(0);
    expect(norms.reimbursableEmis).toBe(10_000);
    const evs = buildEvents(ds, { from: TODAY, to: "2026-12-31", today: TODAY, positions: pos });
    const bill = evs.find((e) => e.kind === "card_bill" && e.date === "2026-11-25")!;
    expect(bill.amount).toBe(10_000);
    expect(bill.reimbursablePart).toBe(10_000);
    const res = project(ds, { today: TODAY, to: "2027-05-31", positions: pos });
    expect(res.totals.expenses).toBe(0);
    expect(res.end.cash).toBeCloseTo(100_000, 0); // card bills out, Surya's repayments in
  });

  it("owed to you = owed − repaid − written off", () => {
    const ds = surya();
    ds.transactions = [tx({ type: "lend_repayment", amount: 10_000, lending_id: "s0", account_id: ds.accounts[0].id, date: "2026-10-27" })];
    ds.lendings[6].written_off = true;
    const g = reimbursements(ds, computePositions(ds, "2026-10-30"), "2026-10-30");
    const s = owedSummary(g);
    expect(g).toHaveLength(1);
    expect(g[0].person).toBe("Surya");
    expect(s.total).toBe(70_000);
    expect(s.received).toBe(10_000);
    expect(s.writtenOff).toBe(10_000);
    expect(s.outstanding).toBe(50_000);
    expect(g[0].next?.date).toBe("2026-11-26");
  });

  it("a tagged reimbursable card spend never touches budgets or spending", () => {
    const t = tx({ type: "card_spend", amount: 5_000, category: "Shopping", tags: ["reimbursable"] });
    expect(classify(t).expense).toBe(0);
  });
});

describe("budgets", () => {
  it("remaining goes down with spending, back up with refunds, ignores reimbursable", () => {
    const ds = ds0();
    const a = acc();
    ds.accounts = [a];
    ds.recurring_rules = [rule({ name: "Groceries", kind: "expense", amount: 5_000, is_fixed: false, category: "Groceries" })];
    ds.transactions = [
      tx({ type: "expense", amount: 100, category: "Groceries", account_id: a.id }),
      tx({ type: "expense", amount: 500, category: "Groceries", account_id: a.id }),
      tx({ type: "expense", amount: 900, category: "Groceries", account_id: a.id, tags: ["reimbursable"] }),
      tx({ type: "income", amount: 50, category: "Groceries", account_id: a.id, tags: ["refund"] }),
    ];
    const b = buildEvents(ds, { from: "2026-10-01", to: "2026-10-31", today: TODAY }).find((e) => e.budget)!;
    expect(b.budget!.spent).toBe(550);
    expect(b.remaining).toBe(4_450);
  });
});

describe("projection explains income ending", () => {
  it("flags salary ending while expenses continue", () => {
    const ds = salaryDs();
    ds.recurring_rules[0].end_date = "2027-06-30";
    const res = project(ds, { today: TODAY, to: "2029-10-09" });
    const i = res.insights.find((x) => x.kind === "income_ends");
    expect(i?.ruleId).toBe(ds.recurring_rules[0].id);
    expect(res.end.cash).toBeLessThan(0);
    ds.recurring_rules[0].end_date = null;
    expect(project(ds, { today: TODAY, to: "2029-10-09" }).end.cash).toBeGreaterThan(0);
  });
});

import { forecast, purchaseCheck, salaryDayPlan, stressPresets } from "./phase2";

describe("phase 2", () => {
  it("salary-day plan protects bills and Critical goals; flexible = what the plan leaves", () => {
    const ds = salaryDs();
    ds.goals = [goal({ name: "EF", kind: "emergency", target_amount: 120_000, target_date: "2027-10-31", priority: 1 })];
    const sp = salaryDayPlan(ds, computePositions(ds, TODAY), TODAY, "2026-11-01");
    const bills = sp.lines.filter((l) => l.group === "bills").reduce((s, l) => s + l.amount, 0);
    expect(bills).toBe(20_000);
    expect(sp.lines.find((l) => l.group === "goal")?.label).toBe("EF");
    expect(sp.flexible).toBeCloseTo(sp.plan.available - sp.plan.allocated, 1);
    expect(sp.assigned).toBeCloseTo(60_000, 0);
  });

  it("forecast's last balance equals projected cash", () => {
    const ds = salaryDs();
    const pos = computePositions(ds, TODAY);
    const fc = forecast(ds, pos, TODAY, "2026-12-31", 45_000);
    expect(fc.rows.at(-1)!.balance).toBeCloseTo(project(ds, { today: TODAY, to: "2026-12-31", positions: pos }).end.cash, 1);
    expect(fc.firstLow?.event.title).toBe("Rent");
  });

  it("purchase check slows only lower-priority goals and adds up to the price", () => {
    const ds = salaryDs();
    ds.goals = [
      goal({ name: "EF", kind: "emergency", target_amount: 240_000, target_date: "2027-10-31", priority: 1 }),
      goal({ name: "Car", target_amount: 600_000, target_date: "2027-10-31", priority: 4 }),
    ];
    const r = purchaseCheck(ds, computePositions(ds, TODAY), TODAY, { name: "Phone", price: 30_000, month: "2026-12-01", priority: 3, financing: "cash" });
    const saved = r.schedule.reduce((s, x) => s + x.fromFree + x.fromGoals, 0);
    expect(saved).toBeCloseTo(30_000, 0);
    expect(r.impacts.map((i) => i.name)).toEqual(["Car"]);
    expect(r.verdict).toBe("slows_goals");
  });

  it("a dependent goal gets nothing until its prerequisite reaches the threshold", () => {
    const ds = salaryDs();
    const ef = goal({ name: "EF", kind: "emergency", target_amount: 100_000, target_date: "2027-10-31", priority: 1, current_amount: 20_000 });
    ds.goals = [ef, goal({ name: "Car", target_amount: 500_000, target_date: "2028-01-31", priority: 2, depends_on: ef.id, min_before_start: 50_000 })];
    let p = planMonth(ds, computePositions(ds, TODAY), TODAY, "2026-11-01");
    expect(p.allocations.find((a) => a.goal.name === "Car")!.recommended).toBe(0);
    ds.goals[0] = { ...ef, current_amount: 60_000 };
    p = planMonth(ds, computePositions(ds, TODAY), TODAY, "2026-11-01");
    expect(p.allocations.find((a) => a.goal.name === "Car")!.recommended).toBeGreaterThan(0);
  });

  it("stress test: no income for 3 months lowers the lowest balance", () => {
    const ds = salaryDs();
    const base = project(ds, { today: TODAY, to: "2027-06-30" });
    const s = project(ds, { today: TODAY, to: "2027-06-30", whatIfs: stressPresets(TODAY)[0].items });
    expect(s.lowest.cash).toBeLessThan(base.lowest.cash);
  });
});
