// Field definitions and defaults for every editable entity.

import type { FieldDef } from "@/components/entity-form";
import { clampDay, parseISO } from "./dates";
import { DEFAULT_ASSET_CLASS, FREQUENCY_LABEL, INVESTMENT_TYPE_LABEL, LOAN_TYPE_LABEL } from "./engine/defaults";
import { amortize } from "./engine/loans";
import type {
  Account, CardStatement, Chit, CreditCard, Dataset, Goal, Investment, InvestmentType, InvestmentValuation, ISODate, Lending, Loan,
  RecurringRule, Reserve,
} from "./types";

const opts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY", "CHF"];

function primaryAccount(ds: Dataset): string | null {
  const a = ds.accounts.find((x) => !x.archived && x.include_in_cash && x.type === "savings") ?? ds.accounts.find((x) => !x.archived);
  return a?.id ?? null;
}

// ---------------------------------------------------------------- Accounts
export const accountFields: FieldDef<Account>[] = [
  { name: "name", label: "Account name", type: "text", required: true, placeholder: "e.g. SBI Savings", autoFocus: true },
  { name: "type", label: "Type", type: "select", options: opts({ savings: "Savings", current: "Current", cash: "Cash", wallet: "Wallet (Paytm, Amazon Pay…)", other: "Other" }), half: true },
  { name: "institution", label: "Bank / provider", type: "text", optional: true, half: true },
  { name: "opening_balance", label: "Balance", type: "money", allowNegative: true, required: true, half: true, help: "What the account holds at the start of the date beside it." },
  { name: "opening_date", label: "Balance as of", type: "date", required: true, half: true },
  { name: "currency", label: "Currency", type: "select", options: CURRENCIES.map((c) => ({ value: c, label: c })), half: true },
  { name: "min_balance", label: "Minimum balance", type: "money", half: true, optional: true, help: "You'll be warned if it's projected to dip below this." },
  { name: "include_in_cash", label: "Count as available cash", type: "toggle", help: "Turn off for savings you don't want to spend (they still count in net worth)." },
  { name: "is_emergency_fund", label: "This is my emergency fund", type: "toggle" },
  { name: "archived", label: "Archived (hidden from lists)", type: "toggle" },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

export function newAccount(today: ISODate): Partial<Account> {
  return { name: "", type: "savings", currency: "INR", opening_balance: 0, opening_date: today, min_balance: 0, include_in_cash: true, is_emergency_fund: false, archived: false };
}

// ---------------------------------------------------------------- Credit cards
export const cardFields: FieldDef<CreditCard>[] = [
  { name: "name", label: "Card name", type: "text", required: true, placeholder: "e.g. HDFC Millennia", autoFocus: true },
  { name: "issuer", label: "Issuer", type: "text", optional: true, half: true },
  { name: "last4", label: "Last 4 digits", type: "text", optional: true, half: true, placeholder: "1234" },
  { name: "credit_limit", label: "Credit limit", type: "money", required: true, half: true },
  { name: "payment_account_id", label: "Bill paid from", type: "account", half: true },
  { name: "statement_day", label: "Statement generated on day", type: "day", required: true, half: true },
  { name: "due_day", label: "Payment due on day", type: "day", required: true, half: true },
  { name: "opening_outstanding", label: "Current outstanding", type: "money", half: true, help: "Everything owed on the card today, excluding amounts converted to EMI (add those under Loans)." },
  { name: "opening_date", label: "Outstanding as of", type: "date", half: true },
  { name: "expected_monthly_spend", label: "Typical monthly spend", type: "money", optional: true, help: "Spending on this card that isn't already a recurring item. Used to estimate future bills." },
  { name: "annual_fee", label: "Annual fee", type: "money", optional: true, half: true, section: "More details" },
  { name: "interest_rate_apr", label: "Interest rate (APR)", type: "percent", half: true },
  { name: "network", label: "Network", type: "select", options: opts({ Visa: "Visa", Mastercard: "Mastercard", RuPay: "RuPay", Amex: "American Express", Diners: "Diners Club" }), noneLabel: "—", half: true },
  { name: "reward_points", label: "Reward points", type: "number", half: true, optional: true },
  { name: "archived", label: "Archived (card closed)", type: "toggle" },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

export function newCard(ds: Dataset, today: ISODate): Partial<CreditCard> {
  return {
    name: "", credit_limit: 0, statement_day: 5, due_day: 25, payment_account_id: primaryAccount(ds), opening_outstanding: 0,
    opening_date: today, expected_monthly_spend: 0, annual_fee: 0, interest_rate_apr: 42, reward_points: 0, archived: false,
  };
}

export const statementFields: FieldDef<CardStatement>[] = [
  { name: "statement_date", label: "Statement date", type: "date", required: true, half: true },
  { name: "due_date", label: "Due date", type: "date", required: true, half: true },
  { name: "total_due", label: "Total amount due", type: "money", required: true, half: true, autoFocus: true },
  { name: "min_due", label: "Minimum due", type: "money", half: true, optional: true },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

// ---------------------------------------------------------------- Loans
export const loanFields: FieldDef<Loan>[] = [
  { name: "name", label: "Loan name", type: "text", required: true, placeholder: "e.g. Home loan", autoFocus: true },
  { name: "type", label: "Type", type: "select", options: opts(LOAN_TYPE_LABEL), half: true },
  { name: "lender", label: "Lender", type: "text", optional: true, half: true },
  { name: "principal", label: "Loan amount", type: "money", required: true, half: true, min: 1, help: "Original amount — or today's outstanding if you set the first EMI as your next one." },
  { name: "interest_rate", label: "Interest rate (yearly)", type: "percent", required: true, half: true, min: 0 },
  { name: "tenure_months", label: "Tenure (months)", type: "int", required: true, half: true, min: 1, max: 600 },
  { name: "interest_type", label: "Interest type", type: "select", options: opts({ reducing: "Reducing balance", flat: "Flat rate" }), half: true },
  { name: "first_emi_date", label: "First EMI date", type: "date", required: true, half: true },
  { name: "emi_amount", label: "EMI amount", type: "money", optional: true, half: true, help: "Leave blank to calculate it." },
  { name: "payment_account_id", label: "EMI paid from", type: "account", showIf: (v) => !v.card_id, half: true },
  { name: "card_id", label: "Billed on credit card", type: "card", noneLabel: "Not a card EMI", showIf: (v) => v.type === "card_emi", half: true },
  { name: "emis_paid_offset", label: "EMIs already paid", type: "int", optional: true, min: 0, half: true, help: "Leave blank to count EMIs dated before today as paid." },
  { name: "processing_fee", label: "Processing fee", type: "money", optional: true, half: true },
  { name: "status", label: "Status", type: "select", options: opts({ active: "Active", closed: "Closed" }), half: true },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

export function newLoan(ds: Dataset, today: ISODate): Partial<Loan> {
  const d = parseISO(today);
  return {
    name: "", type: "personal", principal: undefined, interest_rate: 10.5, interest_type: "reducing", tenure_months: 36,
    first_emi_date: clampDay(d.getUTCFullYear(), d.getUTCMonth() + 1, 5), emis_paid_offset: undefined, payment_account_id: primaryAccount(ds),
    processing_fee: 0, status: "active",
  };
}

export function finalizeLoan(v: Partial<Loan>, today: ISODate): Partial<Loan> {
  const out = { ...v };
  if (out.emis_paid_offset == null) {
    const s = amortize({ principal: out.principal ?? 0, interest_rate: out.interest_rate ?? 0, tenure_months: out.tenure_months ?? 1, interest_type: out.interest_type ?? "reducing", emi_amount: out.emi_amount, first_emi_date: out.first_emi_date ?? today });
    out.emis_paid_offset = s.filter((i) => i.date < today).length;
  }
  if (out.type !== "card_emi") out.card_id = null;
  if (out.card_id) out.payment_account_id = null;
  return out;
}

// ---------------------------------------------------------------- Chits
export const chitFields: FieldDef<Chit>[] = [
  { name: "name", label: "Chit name", type: "text", required: true, placeholder: "e.g. Shriram 2L chit", autoFocus: true },
  { name: "provider", label: "Provider / foreman", type: "text", optional: true },
  { name: "chit_value", label: "Chit value", type: "money", required: true, half: true, min: 1 },
  { name: "monthly_contribution", label: "Monthly installment", type: "money", required: true, half: true, min: 1 },
  { name: "installments", label: "Number of installments", type: "int", required: true, half: true, min: 1, max: 240 },
  { name: "start_date", label: "First installment date", type: "date", required: true, half: true },
  { name: "installments_paid_offset", label: "Installments already paid", type: "int", optional: true, half: true, help: "Leave blank to count those dated before today." },
  { name: "account_id", label: "Paid from", type: "account", half: true },
  { name: "commission_pct", label: "Foreman commission", type: "percent", half: true },
  { name: "payout_status", label: "Payout", type: "select", options: opts({ pending: "Not taken yet", received: "Already received" }), half: true, section: "Payout" },
  { name: "payout_date", label: "Payout date (expected or actual)", type: "date", optional: true, half: true },
  { name: "payout_amount", label: "Payout amount", type: "money", optional: true, half: true, help: "Leave blank to estimate it as chit value minus commission." },
  { name: "auction_notes", label: "Auction / bid notes", type: "textarea", optional: true },
  { name: "status", label: "Status", type: "select", options: opts({ active: "Active", completed: "Completed", closed: "Closed" }), half: true },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

export function newChit(ds: Dataset, today: ISODate): Partial<Chit> {
  return { name: "", installments: 20, start_date: today, commission_pct: 5, payout_status: "pending", account_id: primaryAccount(ds), status: "active" };
}

export function finalizeChit(v: Partial<Chit>, today: ISODate): Partial<Chit> {
  const out = { ...v };
  if (out.installments_paid_offset == null && out.start_date) {
    const sd = parseISO(out.start_date);
    let n = 0;
    for (let i = 0; i < (out.installments ?? 0); i++) {
      if (clampDay(sd.getUTCFullYear(), sd.getUTCMonth() + i, sd.getUTCDate()) < today) n++;
    }
    out.installments_paid_offset = n;
  }
  return out;
}

// ---------------------------------------------------------------- Investments
const MARKET = ["mutual_fund", "stock", "etf", "crypto", "gold"];
const VALUE_BASED = ["epf", "ppf", "nps", "fd", "rd", "bond", "real_estate", "vehicle", "other"];
const has = (list: string[]) => (v: Partial<Investment>) => list.includes(v.type ?? "");

export const investmentFields: FieldDef<Investment>[] = [
  { name: "type", label: "Type", type: "select", options: opts(INVESTMENT_TYPE_LABEL), half: true },
  { name: "asset_class", label: "Asset class", type: "select", options: opts({ equity: "Equity", debt: "Debt", hybrid: "Hybrid", gold: "Gold", real_estate: "Real estate", cash: "Cash-like", other: "Other" }), half: true },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "Fund, stock, deposit or asset name", autoFocus: true },
  { name: "institution", label: "AMC / broker / bank", type: "text", optional: true, half: true },
  { name: "identifier", label: "Folio, symbol or account no.", type: "text", optional: true, half: true },
  { name: "units", label: "Units / quantity held", type: "number", showIf: has(MARKET), half: true, help: "Grams for gold." },
  { name: "avg_cost", label: "Average buy price", type: "number", showIf: has(MARKET), half: true },
  { name: "current_price", label: "Current price / NAV", type: "number", showIf: has(MARKET), half: true },
  { name: "value_as_of", label: "Price as of", type: "date", showIf: has(MARKET), half: true },
  { name: "current_value", label: "Current value / balance", type: "money", showIf: has(VALUE_BASED), half: true, help: "For EPF, use the latest passbook balance." },
  { name: "value_as_of", label: "Value as of", type: "date", showIf: has(VALUE_BASED), half: true },
  { name: "invested_amount", label: "Total invested", type: "money", half: true, optional: true, help: "Your cost. Leave blank for units × average price." },
  { name: "start_date", label: "Started / bought on", type: "date", optional: true, half: true },
  { name: "interest_rate", label: "Interest rate", type: "percent", showIf: has(["fd", "rd", "bond", "ppf"]), half: true },
  { name: "maturity_date", label: "Maturity date", type: "date", optional: true, showIf: has(["fd", "rd", "bond", "ppf", "nps"]), half: true },
  { name: "employee_contribution", label: "Your monthly contribution", type: "money", showIf: has(["epf"]), half: true, section: "Monthly contribution" },
  { name: "employer_contribution", label: "Employer's EPF share", type: "money", showIf: has(["epf"]), half: true },
  { name: "pension_contribution", label: "Employer's pension (EPS) share", type: "money", showIf: has(["epf"]), half: true, optional: true },
  { name: "sip_active", label: "Monthly SIP / contribution", type: "toggle", showIf: (v) => !["epf", "real_estate", "vehicle", "fd", "bond"].includes(v.type ?? ""), section: "Recurring investment" },
  { name: "sip_amount", label: "Amount each month", type: "money", showIf: (v) => !!v.sip_active, half: true },
  { name: "sip_day", label: "On day", type: "day", showIf: (v) => !!v.sip_active, half: true },
  { name: "sip_account_id", label: "Debited from", type: "account", showIf: (v) => !!v.sip_active, half: true },
  { name: "track_from", label: "Track SIPs from", type: "date", showIf: (v) => !!v.sip_active, half: true, help: "SIPs before this date are already in the units above." },
  { name: "expected_return", label: "Expected yearly return", type: "percent", optional: true, half: true, section: "Projection", help: "Leave blank to use your asset-class assumption. Use a negative number for depreciation." },
  { name: "goal_id", label: "Earmarked for goal", type: "goal", half: true },
  { name: "is_international", label: "International / foreign asset", type: "toggle", showIf: has(["mutual_fund", "stock", "etf", "crypto", "other"]) },
  { name: "archived", label: "Archived (sold or closed)", type: "toggle" },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

export function newInvestment(ds: Dataset, today: ISODate, type: InvestmentType = "mutual_fund"): Partial<Investment> {
  return {
    type, name: "", asset_class: DEFAULT_ASSET_CLASS[type] as Investment["asset_class"], invested_amount: undefined, value_as_of: today,
    sip_amount: 0, sip_active: false, sip_account_id: primaryAccount(ds), track_from: today, employee_contribution: 0, employer_contribution: 0,
    pension_contribution: 0, is_international: false, currency: "INR", archived: false, expected_return: type === "vehicle" ? -12 : undefined,
  };
}

export function finalizeInvestment(v: Partial<Investment>, today: ISODate): Partial<Investment> {
  const out = { ...v };
  const market = MARKET.includes(out.type ?? "");
  if (market) {
    out.current_value = null;
    if (out.invested_amount == null && out.units != null && out.avg_cost != null) out.invested_amount = Math.round(out.units * out.avg_cost * 100) / 100;
    if (out.current_price == null && out.avg_cost != null) out.current_price = out.avg_cost;
  } else {
    out.units = null;
    out.avg_cost = null;
    out.current_price = null;
    if (out.current_value == null) out.current_value = out.invested_amount ?? 0;
  }
  if (out.invested_amount == null) out.invested_amount = out.current_value ?? 0;
  if (!out.value_as_of) out.value_as_of = today;
  if (!out.sip_active) out.sip_amount = out.sip_amount ?? 0;
  if (!out.track_from) out.track_from = today;
  return out;
}

export const valuationFields: FieldDef<InvestmentValuation>[] = [
  { name: "date", label: "Date", type: "date", required: true, half: true },
  { name: "value", label: "Value / balance", type: "money", required: true, half: true, autoFocus: true },
  { name: "note", label: "Note", type: "text", optional: true },
];

// ---------------------------------------------------------------- Goals
export const goalFields: FieldDef<Goal>[] = [
  { name: "name", label: "Goal", type: "text", required: true, placeholder: "e.g. House down payment", autoFocus: true },
  { name: "kind", label: "Kind", type: "select", options: opts({ emergency: "Emergency fund", house: "House", vehicle: "Vehicle", travel: "Travel", education: "Education", retirement: "Retirement", wedding: "Wedding", gadget: "Gadget", other: "Other" }), half: true },
  { name: "priority", label: "Priority", type: "select", options: [{ value: "1", label: "High" }, { value: "2", label: "Medium" }, { value: "3", label: "Low" }], half: true },
  { name: "target_amount", label: "Target amount", type: "money", required: true, half: true, min: 1 },
  { name: "target_date", label: "Target date", type: "date", optional: true, half: true },
  { name: "current_amount", label: "Saved so far (outside linked accounts)", type: "money", half: true, optional: true },
  { name: "monthly_contribution", label: "Monthly contribution", type: "money", half: true, optional: true },
  { name: "linked_account_ids", label: "Linked bank accounts", type: "accounts", help: "Their balances count towards this goal." },
  { name: "linked_investment_ids", label: "Linked investments", type: "investments" },
  { name: "expected_return", label: "Expected return on goal money", type: "percent", optional: true, half: true },
  { name: "archived", label: "Archived", type: "toggle" },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

export function newGoal(): Partial<Goal> {
  return { name: "", kind: "other", priority: 2, target_amount: undefined, current_amount: 0, monthly_contribution: 0, linked_account_ids: [], linked_investment_ids: [], archived: false };
}

export function finalizeGoal(v: Partial<Goal>): Partial<Goal> {
  return { ...v, priority: Number(v.priority ?? 2) as Goal["priority"], current_amount: v.current_amount ?? 0, monthly_contribution: v.monthly_contribution ?? 0 };
}

// ---------------------------------------------------------------- Lending
export const lendingFields: FieldDef<Lending>[] = [
  { name: "direction", label: "Direction", type: "select", options: opts({ lent: "I lent money", borrowed: "I borrowed money" }) },
  { name: "person", label: "Person / entity", type: "text", required: true, autoFocus: true },
  { name: "amount", label: "Amount", type: "money", required: true, half: true, min: 1 },
  { name: "date", label: "Date", type: "date", required: true, half: true },
  { name: "expected_date", label: "Expected repayment", type: "date", optional: true, half: true },
  { name: "account_id", label: "Account", type: "account", half: true, noneLabel: "Cash / not tracked" },
  { name: "interest_rate", label: "Interest (yearly)", type: "percent", optional: true, half: true },
  { name: "include_in_projection", label: "Count the repayment in my projections", type: "toggle", showIf: (v) => v.direction === "lent", help: "Turn off if you're not sure you'll get it back on time." },
  { name: "written_off", label: "Written off (won't be repaid)", type: "toggle", showIf: (v) => v.direction === "lent" },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

export function newLending(ds: Dataset, today: ISODate, direction: Lending["direction"] = "lent"): Partial<Lending> {
  return { direction, person: "", date: today, interest_rate: 0, account_id: primaryAccount(ds), include_in_projection: true, written_off: false };
}

// ---------------------------------------------------------------- Reserves
export const reserveFields: FieldDef<Reserve>[] = [
  { name: "name", label: "Reserve for", type: "text", required: true, placeholder: "e.g. Annual insurance", autoFocus: true },
  { name: "target_amount", label: "Target", type: "money", half: true },
  { name: "current_amount", label: "Set aside now", type: "money", half: true },
  { name: "monthly_funding", label: "Add each month", type: "money", half: true, optional: true },
  { name: "due_date", label: "Needed by", type: "date", half: true, optional: true },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

export function newReserve(): Partial<Reserve> {
  return { name: "", target_amount: 0, current_amount: 0, monthly_funding: 0 };
}

// ---------------------------------------------------------------- Recurring rules
const notOnce = (v: Partial<RecurringRule>) => v.frequency !== "once";
const monthly = (v: Partial<RecurringRule>) => ["monthly", "quarterly", "half_yearly", "yearly"].includes(v.frequency ?? "");

export const ruleFields: FieldDef<RecurringRule>[] = [
  { name: "kind", label: "This is", type: "select", options: opts({ income: "Income", expense: "Expense", transfer: "Transfer between my accounts" }) },
  { name: "name", label: "Name", type: "text", required: true, placeholder: "e.g. Rent, Salary, Netflix", autoFocus: true },
  { name: "amount", label: "Amount", type: "money", required: true, half: true, min: 0.01 },
  { name: "frequency", label: "Repeats", type: "select", options: opts(FREQUENCY_LABEL), half: true },
  { name: "interval_days", label: "Every how many days", type: "int", showIf: (v) => v.frequency === "custom", half: true, min: 1 },
  { name: "start_date", label: "Starts on", type: "date", required: true, half: true },
  { name: "day_of_month", label: "On day", type: "day", showIf: monthly, noneLabel: "Same day as start", half: true },
  { name: "end_date", label: "Ends on", type: "date", optional: true, showIf: notOnce, half: true },
  { name: "account_id", label: "Account", type: "account", showIf: (v) => !(v.kind === "expense" && v.card_id), half: true, help: "Received into / paid from / transfer from." },
  { name: "to_account_id", label: "Transfer to", type: "account", showIf: (v) => v.kind === "transfer", half: true },
  { name: "card_id", label: "Paid by credit card", type: "card", noneLabel: "No — paid from the account", showIf: (v) => v.kind === "expense", half: true },
  { name: "category", label: "Category", type: "category", showIf: (v) => v.kind !== "transfer", categoryKind: (v) => (v.kind === "income" ? "income" : "expense"), half: true },
  {
    name: "is_fixed",
    label: "How to track it",
    type: "select",
    showIf: (v) => v.kind === "expense",
    options: [
      { value: "true", label: "A bill — I'll mark each one paid" },
      { value: "false", label: "A spending budget — tracked against my actual spending in this category" },
    ],
  },
  { name: "is_essential", label: "Essential (counts towards emergency fund needs)", type: "toggle", showIf: (v) => v.kind === "expense" },
  { name: "is_subscription", label: "Subscription", type: "toggle", showIf: (v) => v.kind === "expense" },
  {
    name: "certainty",
    label: "How sure is it?",
    type: "select",
    section: "Planning",
    options: opts({ known: "Known — will happen", expected: "Expected — likely", uncertain: "Uncertain — leave out of the base projection" }),
    half: true,
  },
  { name: "growth_pct", label: "Yearly increase", type: "percent", optional: true, half: true, help: "Blank uses your default salary / expense growth." },
  { name: "tax_deducted", label: "Tax deducted (TDS)", type: "money", optional: true, showIf: (v) => v.kind === "income", half: true },
  { name: "track_from", label: "Track from", type: "date", half: true, help: "Occurrences before this date are already in your balances." },
  { name: "active", label: "Active", type: "toggle" },
  { name: "notes", label: "Notes", type: "textarea", optional: true },
];

export function newRule(ds: Dataset, today: ISODate, kind: RecurringRule["kind"] = "expense"): Partial<RecurringRule> {
  return {
    kind, name: "", frequency: "monthly", start_date: today, track_from: today, account_id: primaryAccount(ds), is_fixed: true,
    is_essential: false, is_subscription: false, certainty: "known", tax_deducted: 0, active: true, category: kind === "income" ? "Salary" : null,
  };
}

export function finalizeRule(v: Partial<RecurringRule>): Partial<RecurringRule> {
  const out = { ...v };
  if (out.kind !== "transfer") out.to_account_id = null;
  if (out.kind !== "expense") {
    out.card_id = null;
    out.is_fixed = true;
  }
  if (out.card_id) out.account_id = null;
  if (out.frequency === "once") {
    out.end_date = null;
    out.day_of_month = null;
  }
  if (out.frequency !== "custom") out.interval_days = null;
  if (!out.track_from || (out.start_date && out.track_from < out.start_date && out.frequency === "once")) out.track_from = out.start_date;
  out.tax_deducted = out.tax_deducted ?? 0;
  return out;
}
