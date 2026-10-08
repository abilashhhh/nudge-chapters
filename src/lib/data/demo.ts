// A realistic sample dataset, built relative to today, so the app can be
// explored before any real data is entered. Based on the PRD's §32 example:
// ₹94,371 monthly salary, ~₹1 lakh liquid cash, SIPs, EMIs, a chit and cards.

import { addDays, addMonths, clampDay, endOfMonth, parseISO, startOfMonth, todayISO } from "../dates";
import { round2 } from "../money";
import { DEFAULT_CATEGORIES } from "../engine/defaults";
import { amortize } from "../engine/loans";
import { occurrences } from "../engine/schedule";
import type {
  Account, CardStatement, Category, Chit, CreditCard, Dataset, Goal, Investment, Lending, Loan, NetWorthSnapshot,
  RecurringRule, Reserve, Transaction,
} from "../types";
import { computePositions } from "../engine/ledger";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function uuidFactory(seed: number) {
  const r = rng(seed);
  return () => {
    const h = () => Math.floor(r() * 16).toString(16);
    let s = "";
    for (let i = 0; i < 32; i++) s += h();
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${"89ab"[Math.floor(r() * 4)]}${s.slice(17, 20)}-${s.slice(20, 32)}`;
  };
}

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export function buildDemoDataset(today: string = todayISO("Asia/Kolkata")): Dataset {
  const id = uuidFactory(20261008);
  const rand = rng(42);
  const between = (a: number, b: number) => Math.round(a + rand() * (b - a));
  const start = startOfMonth(addMonths(today, -3)); // tracking began three months ago
  const td = parseISO(today);
  const dom = (monthOffset: number, day: number) => clampDay(td.getUTCFullYear(), td.getUTCMonth() + monthOffset, day);

  const tx: Transaction[] = [];
  const addTx = (t: Partial<Transaction> & Pick<Transaction, "date" | "type" | "amount">) => {
    tx.push({
      id: id(),
      is_partial: false,
      reconciled: t.date < startOfMonth(today),
      tags: [],
      ...t,
      amount: round2(t.amount),
    } as Transaction);
  };

  // ---------------------------------------------------------------- Accounts
  const sbi: Account = {
    id: id(), name: "SBI Savings", type: "savings", institution: "State Bank of India", currency: "INR",
    opening_balance: 58_000, opening_date: start, min_balance: 10_000, include_in_cash: true,
    is_emergency_fund: false, last_verified_at: addDays(today, -6), archived: false, color: "#1f5fa8",
  };
  const hdfc: Account = {
    id: id(), name: "HDFC Savings", type: "savings", institution: "HDFC Bank", currency: "INR",
    opening_balance: 21_500, opening_date: start, min_balance: 0, include_in_cash: true,
    is_emergency_fund: false, archived: false, color: "#0b4f8a",
  };
  const cash: Account = {
    id: id(), name: "Cash wallet", type: "cash", currency: "INR", opening_balance: 4_000, opening_date: start,
    min_balance: 0, include_in_cash: true, is_emergency_fund: false, archived: false, color: "#5e6b66",
  };
  const ef: Account = {
    id: id(), name: "Kotak Emergency Fund", type: "savings", institution: "Kotak Mahindra Bank", currency: "INR",
    opening_balance: 1_35_000, opening_date: start, min_balance: 0, include_in_cash: false,
    is_emergency_fund: true, archived: false, color: "#b42318", notes: "Not counted in spendable cash",
  };
  const accounts = [sbi, hdfc, cash, ef];

  // ---------------------------------------------------------------- Cards
  const millennia: CreditCard = {
    id: id(), name: "HDFC Millennia", issuer: "HDFC Bank", last4: "4417", network: "Visa", credit_limit: 1_50_000,
    statement_day: 5, due_day: 25, payment_account_id: null, opening_outstanding: 0, opening_date: today,
    expected_monthly_spend: 3_500, annual_fee: 1_000, interest_rate_apr: 43.2, reward_points: 2_340,
    color: "#3b2f7a", archived: false,
  };
  const slice: CreditCard = {
    id: id(), name: "Slice", issuer: "Slice", last4: "0921", network: "Visa", credit_limit: 40_000,
    statement_day: 20, due_day: 5, payment_account_id: null, opening_outstanding: 0, opening_date: today,
    expected_monthly_spend: 1_500, annual_fee: 0, interest_rate_apr: 36, reward_points: 0, color: "#5b4fc4", archived: false,
  };
  const cards = [millennia, slice];

  // Latest Millennia statement
  const s0 = dom(0, 5) <= today ? dom(0, 5) : dom(-1, 5);
  const d0 = clampDay(parseISO(s0).getUTCFullYear(), parseISO(s0).getUTCMonth(), 25);
  const statement: CardStatement = { id: id(), card_id: millennia.id, statement_date: s0, due_date: d0, total_due: 14_280, min_due: 714 };
  if (d0 < today) {
    addTx({ date: addDays(d0, -2), type: "card_payment", amount: 14_280, account_id: sbi.id, card_id: millennia.id, statement_id: statement.id, description: "Millennia bill" });
    millennia.opening_outstanding = 6_120;
  } else {
    millennia.opening_outstanding = 14_280 + 4_365;
  }
  slice.opening_outstanding = 3_890;

  // ---------------------------------------------------------------- Rules
  const rule = (r: Partial<RecurringRule> & Pick<RecurringRule, "name" | "kind" | "amount">): RecurringRule => ({
    id: id(), frequency: "monthly", start_date: start, track_from: start, is_fixed: true, is_essential: false,
    is_subscription: false, certainty: "known", tax_deducted: 0, active: true, ...r,
  });
  const salary = rule({ name: "Salary — Acme Systems", kind: "income", amount: 94_371, day_of_month: 1, account_id: sbi.id, category: "Salary", tax_deducted: 8_420, growth_pct: 8 });
  const freelance = rule({ name: "Freelance design retainer", kind: "income", amount: 12_000, frequency: "quarterly", day_of_month: 15, start_date: dom(-2, 15), track_from: start, account_id: hdfc.id, category: "Freelance", certainty: "expected", is_fixed: false });
  const bonus = rule({ name: "Annual bonus", kind: "income", amount: 60_000, frequency: "yearly", start_date: clampDay(td.getUTCFullYear() + (td.getUTCMonth() >= 3 ? 1 : 0), 3, 30), track_from: today, account_id: sbi.id, category: "Bonus", certainty: "uncertain", is_fixed: false, growth_pct: 0 });
  const rent = rule({ name: "Rent", kind: "expense", amount: 18_000, day_of_month: 5, account_id: sbi.id, category: "Rent", is_essential: true, growth_pct: 5 });
  const family = rule({ name: "Family support", kind: "expense", amount: 15_000, day_of_month: 2, account_id: sbi.id, category: "Family support", is_essential: true, growth_pct: 0 });
  const electricity = rule({ name: "Electricity (BESCOM)", kind: "expense", amount: 1_800, day_of_month: 15, account_id: sbi.id, category: "Utilities", is_essential: true });
  const efTransfer = rule({ name: "Move to emergency fund", kind: "transfer", amount: 5_000, day_of_month: 3, account_id: sbi.id, to_account_id: ef.id, category: null, growth_pct: 0 });
  const mobile = rule({ name: "Airtel postpaid + fibre", kind: "expense", amount: 1_299, day_of_month: 12, card_id: millennia.id, category: "Mobile & internet", is_essential: true, is_subscription: true, growth_pct: 0 });
  const netflix = rule({ name: "Netflix", kind: "expense", amount: 649, day_of_month: 18, card_id: millennia.id, category: "Subscriptions", is_subscription: true, growth_pct: 0 });
  const spotify = rule({ name: "Spotify", kind: "expense", amount: 119, day_of_month: 22, card_id: slice.id, category: "Subscriptions", is_subscription: true, growth_pct: 0 });
  const icloud = rule({ name: "iCloud+ 200 GB", kind: "expense", amount: 219, day_of_month: 9, card_id: slice.id, category: "Subscriptions", is_subscription: true, growth_pct: 0 });
  const gym = rule({ name: "Cult.fit membership", kind: "expense", amount: 9_990, frequency: "yearly", start_date: dom(2, 20), track_from: today, account_id: hdfc.id, category: "Subscriptions", is_subscription: true, growth_pct: 0 });
  const insurance = rule({ name: "Health insurance premium", kind: "expense", amount: 14_500, frequency: "yearly", start_date: clampDay(td.getUTCFullYear() + 1, 2, 10), track_from: today, account_id: sbi.id, category: "Insurance", is_essential: true, growth_pct: 8 });
  const groceries = rule({ name: "Groceries", kind: "expense", amount: 7_000, day_of_month: 1, account_id: sbi.id, category: "Groceries", is_fixed: false, is_essential: true });
  const fuel = rule({ name: "Fuel", kind: "expense", amount: 3_000, day_of_month: 1, account_id: sbi.id, category: "Fuel", is_fixed: false, is_essential: true });
  const dining = rule({ name: "Eating out", kind: "expense", amount: 4_000, day_of_month: 1, card_id: millennia.id, category: "Food & dining", is_fixed: false });
  const rules = [salary, freelance, bonus, rent, family, electricity, efTransfer, mobile, netflix, spotify, icloud, gym, insurance, groceries, fuel, dining];

  // Settle fixed rule occurrences from the tracking start until today.
  for (const r of rules) {
    if (!r.is_fixed && r.kind === "expense") continue;
    for (const o of occurrences(r, r.track_from, today)) {
      const isCurrentMonth = o >= startOfMonth(today);
      if (r === electricity && isCurrentMonth) continue; // leave this month's bill unpaid to show an overdue item
      if (o > today) continue;
      if (r === freelance && rand() < 0.1) continue;
      const base = { date: o, amount: r.amount, rule_id: r.id, occurrence_date: o, category: r.category, description: r.name };
      if (r.kind === "income") addTx({ ...base, type: "income", account_id: r.account_id });
      else if (r.kind === "transfer") addTx({ ...base, type: "transfer", account_id: r.account_id, to_account_id: r.to_account_id });
      else if (r.card_id) addTx({ ...base, type: "card_spend", card_id: r.card_id });
      else addTx({ ...base, type: "expense", account_id: r.account_id, amount: r === electricity ? between(1500, 2300) : r.amount });
    }
  }

  // Day-to-day spending (variable budgets are consumed by these).
  for (let d = start; d <= today; d = addDays(d, 1)) {
    const wd = parseISO(d).getUTCDay();
    if (wd === 6 || rand() < 0.08) addTx({ date: d, type: "expense", amount: between(900, 2400), account_id: sbi.id, category: "Groceries", description: rand() < 0.5 ? "BigBasket" : "Ratnadeep Supermarket" });
    if (wd === 5 || rand() < 0.07) addTx({ date: d, type: "card_spend", amount: between(350, 1400), card_id: millennia.id, category: "Food & dining", description: rand() < 0.5 ? "Swiggy" : "Zomato" });
    if (wd === 1 && rand() < 0.8) addTx({ date: d, type: "expense", amount: between(500, 1000), account_id: rand() < 0.5 ? sbi.id : cash.id, category: "Fuel", description: "Indian Oil" });
    if (rand() < 0.05) addTx({ date: d, type: "card_spend", amount: between(600, 3800), card_id: rand() < 0.6 ? millennia.id : slice.id, category: "Shopping", description: rand() < 0.5 ? "Amazon" : "Myntra" });
    if (rand() < 0.06) addTx({ date: d, type: "expense", amount: between(80, 450), account_id: cash.id, category: "Transport", description: "Auto / metro" });
    if (rand() < 0.025) addTx({ date: d, type: "expense", amount: between(400, 2200), account_id: hdfc.id, category: "Health", description: "Apollo Pharmacy" });
  }
  addTx({ date: dom(-2, 16), type: "expense", amount: 4_499, account_id: hdfc.id, category: "Household", description: "Mixer grinder" });
  addTx({ date: dom(-1, 21), type: "card_spend", amount: 6_850, card_id: millennia.id, category: "Travel", description: "IndiGo — Hyderabad trip" });
  addTx({ date: dom(-1, 1), type: "income", amount: 1_240, account_id: sbi.id, category: "Interest & dividends", description: "Savings interest" });
  addTx({ date: addDays(today, -3), type: "transfer", amount: 3_000, account_id: sbi.id, to_account_id: cash.id, description: "ATM withdrawal" });

  // Past card bill payments (before the cards' tracking start, so they only affect bank balances).
  for (let m = -3; m <= -1; m++) {
    addTx({ date: dom(m, 24), type: "card_payment", amount: between(11_500, 16_000), account_id: sbi.id, card_id: millennia.id, description: "Millennia bill" });
    addTx({ date: dom(m, 4), type: "card_payment", amount: between(2_400, 4_800), account_id: hdfc.id, card_id: slice.id, description: "Slice bill" });
  }

  // ---------------------------------------------------------------- Loans
  const bike: Loan = {
    id: id(), name: "Two-wheeler loan", lender: "Bajaj Finance", type: "vehicle", principal: 1_20_000, interest_rate: 9.5,
    interest_type: "reducing", tenure_months: 24, emi_amount: null, first_emi_date: dom(-10, 10), emis_paid_offset: 0,
    payment_account_id: sbi.id, card_id: null, processing_fee: 1_500, status: "active",
  };
  const phone: Loan = {
    id: id(), name: "iPhone on EMI", lender: "HDFC Bank", type: "card_emi", principal: 45_000, interest_rate: 14,
    interest_type: "reducing", tenure_months: 9, emi_amount: null, first_emi_date: dom(-3, 5), emis_paid_offset: 0,
    payment_account_id: null, card_id: millennia.id, processing_fee: 199, status: "active",
  };
  for (const loan of [bike, phone]) {
    const sched = amortize(loan);
    loan.emis_paid_offset = sched.filter((i) => i.date < start).length;
    for (const inst of sched) {
      if (inst.date < start || inst.date > today) continue;
      addTx({
        date: inst.date, type: "loan_emi", amount: inst.emi, account_id: loan.card_id ? null : loan.payment_account_id,
        card_id: loan.card_id, loan_id: loan.id, occurrence_date: inst.date, principal_part: inst.principal,
        interest_part: inst.interest, category: "Interest", description: `EMI · ${loan.name}`,
      });
    }
  }

  // ---------------------------------------------------------------- Chit
  const chit: Chit = {
    id: id(), name: "Shriram 2L chit", provider: "Shriram Chits", chit_value: 2_00_000, monthly_contribution: 10_000,
    installments: 20, start_date: dom(-6, 10), installments_paid_offset: 0, payout_status: "pending",
    payout_amount: 1_82_000, payout_date: dom(8, 12), commission_pct: 5, account_id: sbi.id, status: "active",
    auction_notes: "Planning to bid around month 14",
    installment_records: [],
  };
  {
    // Each month's auction leaves a different dividend, so the installment changes month to month:
    // ₹10,000 (no auction yet) → ₹8,200 → ₹8,500 → … Results are known a few days before each due date.
    const dividends = [0, 1_800, 1_500, 1_650, 1_200, 1_350, 1_100, 950];
    const sd = parseISO(chit.start_date);
    let paidBefore = 0;
    for (let i = 0; i < chit.installments; i++) {
      const d = clampDay(sd.getUTCFullYear(), sd.getUTCMonth() + i, 10);
      const auction = addDays(d, -3);
      const dividend = dividends[i];
      const known = i > 0 && dividend != null && auction <= today;
      const paid = 10_000 - (dividend ?? 0);
      if (d < start) {
        paidBefore++;
        chit.installment_records!.push({ no: i + 1, ...(known ? { auction_date: auction, dividend } : {}), paid_amount: paid, paid_date: d, source: "passbook" });
        continue;
      }
      if (known) chit.installment_records!.push({ no: i + 1, auction_date: auction, dividend, source: "foreman_message" });
      if (d <= today) addTx({ date: d, type: "chit_installment", amount: paid, account_id: sbi.id, chit_id: chit.id, occurrence_date: d, description: `Chit · ${chit.name}` });
    }
    chit.installments_paid_offset = paidBefore;
  }

  // ---------------------------------------------------------------- Investments
  const inv = (i: Partial<Investment> & Pick<Investment, "type" | "name" | "asset_class">): Investment => ({
    id: id(), invested_amount: 0, sip_amount: 0, sip_active: false, track_from: start, employee_contribution: 0,
    employer_contribution: 0, pension_contribution: 0, is_international: false, currency: "INR", archived: false, ...i,
  });
  const ppfas = inv({ type: "mutual_fund", name: "Parag Parikh Flexi Cap — Direct", institution: "PPFAS Mutual Fund", identifier: "Folio 1029384/71", asset_class: "equity", units: 1_245.32, avg_cost: 62.4, current_price: 84.15, invested_amount: round2(1_245.32 * 62.4), value_as_of: addDays(today, -1), start_date: dom(-26, 7), sip_amount: 2_000, sip_day: 7, sip_account_id: sbi.id, sip_active: true, is_international: false });
  const nifty = inv({ type: "mutual_fund", name: "UTI Nifty 50 Index — Direct", institution: "UTI Mutual Fund", identifier: "Folio 55821/12", asset_class: "equity", units: 820.5, avg_cost: 148.2, current_price: 171.6, invested_amount: round2(820.5 * 148.2), value_as_of: addDays(today, -1), start_date: dom(-18, 15), sip_amount: 1_000, sip_day: 15, sip_account_id: sbi.id, sip_active: true });
  const tcs = inv({ type: "stock", name: "Tata Consultancy Services", institution: "Zerodha", identifier: "TCS", asset_class: "equity", units: 10, avg_cost: 3_420, current_price: 3_052, invested_amount: 34_200, value_as_of: addDays(today, -1), start_date: dom(-20, 3) });
  const hdfcb = inv({ type: "stock", name: "HDFC Bank", institution: "Zerodha", identifier: "HDFCBANK", asset_class: "equity", units: 25, avg_cost: 1_480, current_price: 1_962, invested_amount: 37_000, value_as_of: addDays(today, -1), start_date: dom(-30, 11) });
  const epf = inv({ type: "epf", name: "EPF — Acme Systems", institution: "EPFO", identifier: "UAN 1012 3456 7890", asset_class: "debt", current_value: 3_85_420, invested_amount: 3_10_000, value_as_of: dom(-2, 28), start_date: dom(-62, 1), employee_contribution: 5_400, employer_contribution: 1_950, pension_contribution: 1_250, notes: "Balance from the EPFO passbook" });
  const ppf = inv({ type: "ppf", name: "PPF — SBI", institution: "State Bank of India", asset_class: "debt", current_value: 1_24_600, invested_amount: 1_05_000, value_as_of: dom(-6, 31), start_date: dom(-40, 1), interest_rate: 7.1, maturity_date: dom(140, 31) });
  const fd = inv({ type: "fd", name: "SBI Fixed Deposit", institution: "State Bank of India", asset_class: "debt", current_value: 50_000, invested_amount: 50_000, value_as_of: dom(-5, 14), start_date: dom(-5, 14), interest_rate: 7.1, maturity_date: dom(7, 14) });
  const sgb = inv({ type: "gold", name: "Sovereign Gold Bond 2023-24", institution: "RBI", asset_class: "gold", units: 6, avg_cost: 6_199, current_price: 9_840, invested_amount: 37_194, value_as_of: addDays(today, -3), start_date: dom(-24, 1) });
  const scooter = inv({ type: "vehicle", name: "Honda Activa 6G", asset_class: "other", current_value: 72_000, invested_amount: 96_000, value_as_of: today, start_date: dom(-10, 1), expected_return: -12 });
  const investments = [ppfas, nifty, tcs, hdfcb, epf, ppf, fd, sgb, scooter];
  for (const i of [ppfas, nifty]) {
    for (const o of occurrences({ frequency: "monthly", start_date: start, day_of_month: i.sip_day }, start, today)) {
      const price = (i.current_price ?? 1) * (0.94 + rand() * 0.08);
      addTx({ date: o, type: "invest_buy", amount: i.sip_amount, account_id: i.sip_account_id, investment_id: i.id, occurrence_date: o, units: round2((i.sip_amount / price) * 1000) / 1000, price: round2(price), description: `SIP · ${i.name}` });
    }
  }

  // ---------------------------------------------------------------- Lending
  const rahul: Lending = { id: id(), direction: "lent", person: "Rahul (college friend)", amount: 25_000, date: addDays(start, 6), expected_date: addDays(today, 18), interest_rate: 0, account_id: sbi.id, include_in_projection: true, written_off: false, notes: "For his laptop repair" };
  addTx({ date: rahul.date, type: "lend", amount: 25_000, account_id: sbi.id, lending_id: rahul.id, description: "Lent to Rahul" });
  addTx({ date: dom(-1, 12), type: "lend_repayment", amount: 5_000, account_id: sbi.id, lending_id: rahul.id, description: "Rahul repaid part" });
  const uncle: Lending = { id: id(), direction: "borrowed", person: "Ravi uncle", amount: 20_000, date: dom(-2, 20), expected_date: dom(4, 1), interest_rate: 0, account_id: hdfc.id, include_in_projection: true, written_off: false };
  addTx({ date: uncle.date, type: "borrow", amount: 20_000, account_id: hdfc.id, lending_id: uncle.id, description: "Borrowed from Ravi uncle" });
  const lendings = [rahul, uncle];

  // ---------------------------------------------------------------- Goals & reserves
  const goal = (g: Partial<Goal> & Pick<Goal, "name" | "target_amount" | "kind">): Goal => ({
    id: id(), current_amount: 0, monthly_contribution: 0, linked_account_ids: [], linked_investment_ids: [], priority: 2, archived: false, ...g,
  });
  const goals = [
    goal({ name: "Emergency fund", kind: "emergency", target_amount: 3_00_000, linked_account_ids: [ef.id], monthly_contribution: 5_000, priority: 1, expected_return: 3.5, color: "#b42318" }),
    goal({ name: "Royal Enfield Hunter", kind: "vehicle", target_amount: 1_80_000, target_date: dom(14, 1), current_amount: 42_000, monthly_contribution: 8_000, priority: 2, expected_return: 6, color: "#1f7a5a" }),
    goal({ name: "Goa trip with friends", kind: "travel", target_amount: 60_000, target_date: dom(5, 15), current_amount: 15_000, monthly_contribution: 6_000, priority: 3, expected_return: 0, color: "#0d9488" }),
    goal({ name: "Retirement", kind: "retirement", target_amount: 3_00_00_000, target_date: clampDay(2056, 0, 1), linked_investment_ids: [epf.id, ppf.id], monthly_contribution: 0, priority: 1, expected_return: 9, color: "#5b4fc4" }),
  ];
  const reserves: Reserve[] = [
    { id: id(), name: "Insurance premium (March)", target_amount: 14_500, current_amount: 9_000, monthly_funding: 1_250, due_date: insurance.start_date, color: "#2563eb" },
    { id: id(), name: "Diwali gifts", target_amount: 10_000, current_amount: 6_000, monthly_funding: 2_000, color: "#c2410c" },
  ];

  const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({ ...c, id: id(), archived: false }));

  const ds: Dataset = {
    profile: {
      id: DEMO_USER_ID,
      name: "Arjun",
      country: "IN",
      currency: "INR",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      birth_year: 1996,
      retirement_age: 58,
      life_expectancy: 85,
      mode: "advanced",
      onboarding_done: true,
      assumptions: {},
      preferences: { emergencyMonths: 6 },
      fx_rates: { USD: 83.5 },
    },
    accounts,
    categories,
    credit_cards: cards,
    card_statements: [statement],
    loans: [bike, phone],
    chits: [chit],
    goals,
    investments,
    investment_valuations: [
      { id: id(), investment_id: epf.id, date: dom(-14, 31), value: 2_96_800, note: "Passbook" },
      { id: id(), investment_id: epf.id, date: dom(-8, 30), value: 3_38_900, note: "Passbook" },
      { id: id(), investment_id: epf.id, date: dom(-2, 28), value: 3_85_420, note: "Passbook" },
    ],
    lendings,
    reserves,
    recurring_rules: rules,
    event_overrides: [],
    transactions: tx.sort((a, b) => (a.date < b.date ? 1 : -1)),
    net_worth_snapshots: [],
  };

  // Synthetic month-end net-worth history so the trend chart has something to show.
  const nw = computePositions(ds, today).totals;
  const snaps: NetWorthSnapshot[] = [];
  for (let m = 11; m >= 1; m--) {
    const d = endOfMonth(addMonths(today, -m));
    const f = 1 - m * 0.021 + (rand() - 0.5) * 0.01;
    snaps.push({
      id: id(), date: d, cash: round2(nw.allAccounts * (1 - m * 0.012)), investments: round2(nw.investments * f),
      other_assets: round2((nw.physical + nw.receivables + nw.chitAssets) * (1 - m * 0.01)),
      liabilities: round2(nw.totalLiabilities * (1 + m * 0.035)), net_worth: round2(nw.netWorth * f), breakdown: {},
    });
  }
  ds.net_worth_snapshots = snaps;
  return ds;
}
