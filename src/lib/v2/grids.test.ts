import { describe, expect, it } from "vitest";
import { addMonths, startOfMonth } from "../dates";
import { buildEvents } from "../engine/events";
import { computePositions } from "../engine/ledger";
import type { CardStatement, CreditCard, Dataset, Lending, Loan, Transaction } from "../types";
import { cardGrid, monthRange, owedGrid, rowTotal } from "./grids";
import { hrefForV2, toV2Href, v2Crumbs } from "./routes";

const TODAY = "2026-10-11";

function emptyDs(): Dataset {
  return {
    profile: {
      id: "u", country: "IN", currency: "INR", locale: "en-IN", timezone: "Asia/Kolkata", retirement_age: 60,
      life_expectancy: 85, mode: "simple", onboarding_done: true, assumptions: {}, preferences: {}, fx_rates: {},
    },
    accounts: [], categories: [], credit_cards: [], card_statements: [], loans: [], chits: [], goals: [],
    investments: [], investment_valuations: [], lendings: [], reserves: [], recurring_rules: [], event_overrides: [],
    transactions: [], net_worth_snapshots: [], life_items: [], habits: [], habit_logs: [], insurance_policies: [],
  };
}

let n = 0;
const card = (name: string, statement_day: number, due_day: number): CreditCard => ({
  id: `c${++n}`, name, credit_limit: 2_00_000, statement_day, due_day, opening_outstanding: 0, opening_date: "2026-06-01",
  expected_monthly_spend: 0, annual_fee: 0, interest_rate_apr: 42, reward_points: 0, archived: false,
});
const emiLoan = (name: string, cardId: string, emi: number, months: number, first: string, person?: string): Loan => ({
  id: `l${++n}`, name, type: "card_emi", principal: Math.round(emi * months * 100) / 100, interest_rate: 0, interest_type: "reducing",
  tenure_months: months, emi_amount: emi, first_emi_date: first, emis_paid_offset: 0, card_id: cardId, payment_account_id: null,
  reimbursable_person: person ?? null, processing_fee: 0, status: "active",
});
const stmt = (cardId: string, statement_date: string, due_date: string, total_due: number): CardStatement => ({
  id: `s${++n}`, card_id: cardId, statement_date, due_date, total_due, min_due: Math.round(total_due * 0.05),
});
const billedEmi = (loan: Loan, date: string): Transaction => ({
  id: `t${++n}`, date, type: "loan_emi", amount: loan.emi_amount!, loan_id: loan.id, card_id: loan.card_id, account_id: null,
  occurrence_date: date, principal_part: loan.emi_amount!, interest_part: 0, is_partial: false, reconciled: false, tags: [],
});
const cardSpend = (cardId: string, date: string, amount: number): Transaction => ({
  id: `t${++n}`, date, type: "card_spend", amount, card_id: cardId, is_partial: false, reconciled: false, tags: [],
});

/** The card sheet from the Version 2 requirements (Oct-26 … Apr-27). */
function cardSheet(): Dataset {
  const ds = emptyDs();
  const idfc = card("IDFC First Bank", 20, 15);
  const flipkart = card("Axis Flipkart", 5, 25);
  const icici = card("Amazon ICICI", 15, 3);
  const neo = card("Axis Neo", 1, 20);
  const swiggy = card("HDFC Swiggy", 3, 22);
  const ace = card("Yes ACE", 10, 30);
  const amex = card("Axis Amex", 12, 2);
  const bob = card("BOB OneCard", 18, 8);
  ds.credit_cards = [idfc, flipkart, icici, neo, swiggy, ace, amex, bob];

  const surya = emiLoan("Laptop", idfc.id, 10_222.64, 7, "2026-09-18", "Surya");
  const irfan = emiLoan("Bill", flipkart.id, 1_699.16, 1, "2026-10-02", "Irfan");
  const purifier = emiLoan("Water Purifier", icici.id, 2_783.7, 1, "2026-10-14");
  const gauntlet = emiLoan("Full Gauntlet", neo.id, 1_251.94, 2, "2026-09-28");
  ds.loans = [surya, irfan, purifier, gauntlet];

  ds.card_statements = [
    stmt(idfc.id, "2026-09-20", "2026-10-15", 10_222.64),
    stmt(flipkart.id, "2026-10-05", "2026-10-25", 3_128.16),
    stmt(neo.id, "2026-10-01", "2026-10-20", 3_465.8),
    stmt(swiggy.id, "2026-10-03", "2026-10-22", 998.97),
  ];
  ds.transactions = [
    billedEmi(surya, "2026-09-18"),
    billedEmi(irfan, "2026-10-02"),
    billedEmi(gauntlet, "2026-09-28"),
    cardSpend(flipkart.id, "2026-09-20", 1_429),
    cardSpend(neo.id, "2026-09-12", 2_213.86),
    cardSpend(swiggy.id, "2026-09-25", 998.97),
  ];
  return ds;
}

function gridFor(ds: Dataset) {
  const positions = computePositions(ds, TODAY);
  const months = monthRange(startOfMonth(TODAY), 7);
  const events = buildEvents(ds, { from: addMonths(startOfMonth(TODAY), -2), to: `${months.at(-1)}-31`, today: TODAY, positions });
  return cardGrid(ds, positions, events, months, TODAY);
}

describe("Version 2 month tables", () => {
  it("credit cards: EMIs and spends grouped under each card, totals match the sheet, nothing counted twice", () => {
    const g = gridFor(cardSheet());
    expect(g.months).toEqual(["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);

    // Every card is listed, even with nothing due.
    // Cards with a bill this month come first (earliest due date first), then later bills, then cards with nothing due.
    expect(g.groups.map((x) => x.label)).toEqual(["IDFC First Bank", "Axis Neo", "HDFC Swiggy", "Axis Flipkart", "Amazon ICICI", "Yes ACE", "Axis Amex", "BOB OneCard"]);
    const grp = (label: string) => g.groups.find((x) => x.label === label)!;

    const idfc = grp("IDFC First Bank");
    for (const m of g.months) expect(idfc.total.cells[m]?.amount).toBe(10_222.64);
    expect(idfc.rows.map((r) => [r.label, r.note])).toEqual([["Laptop", "Surya"]]);
    expect(rowTotal(idfc.total.cells, g.months)).toBe(71_558.48);

    const flip = grp("Axis Flipkart");
    expect(flip.total.cells["2026-10"].amount).toBe(3_128.16);
    expect(flip.rows.find((r) => r.label === "Bill")!.cells["2026-10"].amount).toBe(1_699.16);
    expect(flip.rows.find((r) => r.label === "Spends (bill)")!.cells["2026-10"].amount).toBe(1_429);
    expect(flip.total.cells["2026-11"]).toBeUndefined();

    const icici = grp("Amazon ICICI");
    expect(icici.total.cells["2026-10"]).toBeUndefined();
    expect(icici.total.cells["2026-11"].amount).toBe(2_783.7);

    const neo = grp("Axis Neo");
    expect(neo.total.cells["2026-10"].amount).toBe(3_465.8);
    expect(neo.rows.find((r) => r.label === "Spends (bill)")!.cells["2026-10"].amount).toBe(2_213.86);
    expect(neo.total.cells["2026-11"].amount).toBe(1_251.94);

    expect(grp("HDFC Swiggy").total.cells["2026-10"].amount).toBe(998.97);
    for (const empty of g.groups.slice(5)) expect(Object.keys(empty.total.cells)).toHaveLength(0);

    // Grand total = card totals only (EMIs are inside them).
    expect(g.grand["2026-10"].amount).toBe(17_815.57);
    expect(g.grand["2026-11"].amount).toBe(14_258.28);
    expect(g.grand["2026-12"].amount).toBe(10_222.64);
    expect(rowTotal(g.grand, g.months)).toBe(83_187.05);

    // Each card total equals its EMIs + spends.
    for (const grp of g.groups)
      for (const m of g.months) {
        const parts = grp.rows.reduce((s, r) => s + (r.cells[m]?.amount ?? 0), 0);
        if (grp.total.cells[m]) expect(Math.round(parts * 100) / 100).toBe(grp.total.cells[m].amount);
      }
  });

  it("EMIs from earlier, unrecorded cycles don't pile onto a later recorded bill", () => {
    const ds = emptyDs();
    const c = card("Old card", 20, 15);
    ds.credit_cards = [c];
    const loan = emiLoan("Phone", c.id, 5_000, 6, "2026-07-18");
    ds.loans = [loan];
    ds.card_statements = [stmt(c.id, "2026-09-20", "2026-10-15", 5_000)];
    ds.transactions = [billedEmi(loan, "2026-07-18"), billedEmi(loan, "2026-08-18"), billedEmi(loan, "2026-09-18")];
    const g = gridFor(ds);
    const grp = g.groups[0];
    expect(grp.total.cells["2026-10"].amount).toBe(5_000);
    expect(grp.rows.find((r) => r.label === "Phone")!.cells["2026-10"].amount).toBe(5_000);
    // The earlier EMIs were never on a recorded bill, so the engine carries them into the next bill:
    // they show as that bill's other charges — the Phone row still has one EMI per month.
    expect(grp.rows.find((r) => r.label === "Spends (bill)")!.cells["2026-10"]).toBeUndefined();
    expect(grp.rows.find((r) => r.label === "Phone")!.cells["2026-11"].amount).toBe(5_000);
    expect(grp.total.cells["2026-11"].amount).toBe(15_000);
  });

  it("past bills are marked paid or late; future known EMIs are not estimates", () => {
    const ds = cardSheet();
    const swiggy = ds.credit_cards.find((c) => c.name === "HDFC Swiggy")!;
    const st = ds.card_statements.find((s) => s.card_id === swiggy.id)!;
    ds.transactions.push({ id: "pay1", date: "2026-10-10", type: "card_payment", amount: 998.97, card_id: swiggy.id, statement_id: st.id, account_id: "a1", is_partial: false, reconciled: false, tags: [] });
    const g = gridFor(ds);
    expect(g.groups.find((x) => x.label === "HDFC Swiggy")!.total.cells["2026-10"].status).toBe("paid");
    expect(g.groups.find((x) => x.label === "IDFC First Bank")!.total.cells["2026-10"].status).toBe("due");
    expect(g.groups.find((x) => x.label === "IDFC First Bank")!.total.cells["2026-12"].status).toBe("upcoming");
  });

  it("people owe me: expected repayments by month, received ones shown as paid", () => {
    const ds = emptyDs();
    const lend = (p: Partial<Lending>): Lending => ({ id: `ln${++n}`, direction: "lent", person: "Surya", amount: 10_222.64, date: "2026-09-18", interest_rate: 0, include_in_projection: true, written_off: false, ...p });
    const a = lend({ expected_date: "2026-10-05" });
    const b = lend({ expected_date: "2026-11-05" });
    ds.lendings = [a, b];
    ds.transactions = [{ id: "r1", date: "2026-10-04", type: "lend_repayment", amount: 10_222.64, lending_id: a.id, account_id: "x", is_partial: false, reconciled: false, tags: [] }];
    const positions = computePositions(ds, TODAY);
    const months = monthRange("2026-10-01", 3);
    const events = buildEvents(ds, { from: "2026-08-01", to: "2026-12-31", today: TODAY, positions });
    const g = owedGrid(ds, events, months, TODAY);
    const row = g.groups[0].rows[0];
    expect(row.label).toBe("Surya");
    expect(row.cells["2026-10"]).toMatchObject({ amount: 10_222.64, status: "paid" });
    expect(row.cells["2026-11"]).toMatchObject({ amount: 10_222.64, status: "upcoming" });
  });
});

describe("Version 2 redirects", () => {
  it("maps every old screen to its new place", () => {
    expect(toV2Href("/money", "")).toBe("/");
    expect(toV2Href("/assets", "?tab=accounts")).toBe("/my-money?tab=accounts");
    expect(toV2Href("/owed", "")).toBe("/my-money?tab=owed");
    expect(toV2Href("/assets", "?tab=lending")).toBe("/my-money?tab=owed");
    expect(toV2Href("/liabilities", "?tab=cards")).toBe("/to-pay?tab=cards");
    expect(toV2Href("/liabilities", "?tab=chits")).toBe("/to-pay?tab=chits");
    expect(toV2Href("/liabilities", "?tab=loans&loan=abc")).toBe("/to-pay?tab=loans&loan=abc");
    expect(toV2Href("/liabilities", "?tab=borrowed")).toBe("/to-pay?tab=loans");
    expect(toV2Href("/cash-flow", "?tab=bills")).toBe("/to-pay");
    expect(toV2Href("/cash-flow", "?tab=transactions")).toBe("/my-money?tab=accounts");
    expect(toV2Href("/cash-flow", "?tab=recurring")).toBe("/menu/budgets");
    expect(toV2Href("/assets", "?tab=investments")).toBe("/savings?tab=funds");
    expect(toV2Href("/assets", "?tab=retirement")).toBe("/savings?tab=other");
    expect(toV2Href("/assets", "?tab=property")).toBe("/savings?tab=other");
    expect(toV2Href("/budgets", "")).toBe("/menu/budgets");
    expect(toV2Href("/plan", "")).toBe("/daily?tab=todo");
    expect(toV2Href("/plan", "?tab=notes")).toBe("/daily?tab=notes");
    expect(toV2Href("/menu/wishlist", "")).toBe("/daily?tab=wishlist");
    expect(v2Crumbs("/to-pay", "?tab=chits").map((c) => c.label)).toEqual(["Home", "To Pay", "Chits & SIPs"]);
    expect(v2Crumbs("/menu/budgets", "").map((c) => c.label)).toEqual(["Home", "Menu", "Budgets & spending plans"]);
    expect(v2Crumbs("/daily", "").map((c) => c.href)).toEqual(["/", "/daily", "/daily?tab=rhythm"]);
    expect(v2Crumbs("/", "")).toEqual([]);
    expect(toV2Href("/goals", "")).toBe("/menu/future#goals");
    expect(toV2Href("/projection", "?date=2027-12-31")).toBe("/menu/future?date=2027-12-31");
    expect(toV2Href("/calendar", "")).toBe("/menu/calendar");
    expect(toV2Href("/reports", "")).toBe("/");
    expect(toV2Href("/settings", "?tab=data")).toBe("/menu/settings?tab=data");
    expect(toV2Href("/more", "")).toBe("/menu");
    expect(toV2Href("/my-money", "")).toBeNull();
    expect(toV2Href("/", "")).toBeNull();
    expect(toV2Href("/settings/", "")).toBe("/menu/settings");
    expect(hrefForV2("/liabilities?tab=loans&loan=9")).toBe("/to-pay?tab=loans&loan=9");
    expect(hrefForV2("/to-pay")).toBe("/to-pay");
  });
});
