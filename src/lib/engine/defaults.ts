import type { Assumptions, Category, Profile, ScenarioAssumptions } from "../types";

export const DEFAULT_RETURNS = {
  equity: 12,
  debt: 7,
  hybrid: 9.5,
  gold: 8,
  real_estate: 6,
  cash: 3.5,
  other: 6,
  epf: 8.25,
};

const base: ScenarioAssumptions = {
  salaryGrowth: 7,
  expenseGrowth: 6,
  incomeFactor: 1,
  variableExpenseFactor: 1,
  returns: { ...DEFAULT_RETURNS },
  includeUncertain: false,
};

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  inflation: 6,
  scenarios: {
    base,
    conservative: {
      salaryGrowth: 3,
      expenseGrowth: 8,
      incomeFactor: 0.95,
      variableExpenseFactor: 1.15,
      returns: { equity: 8, debt: 6, hybrid: 7, gold: 5, real_estate: 3, cash: 3, other: 4, epf: 8 },
      includeUncertain: false,
    },
    optimistic: {
      salaryGrowth: 10,
      expenseGrowth: 5,
      incomeFactor: 1,
      variableExpenseFactor: 0.95,
      returns: { equity: 14, debt: 7.5, hybrid: 11, gold: 10, real_estate: 8, cash: 4, other: 8, epf: 8.25 },
      includeUncertain: true,
    },
    custom: { ...base, returns: { ...DEFAULT_RETURNS } },
  },
};

export function resolveAssumptions(profile: Pick<Profile, "assumptions"> | null | undefined): Assumptions {
  const a = profile?.assumptions ?? {};
  const s = a.scenarios ?? ({} as Partial<Assumptions["scenarios"]>);
  const merge = (key: keyof Assumptions["scenarios"]): ScenarioAssumptions => ({
    ...DEFAULT_ASSUMPTIONS.scenarios[key],
    ...(s[key] ?? {}),
    returns: { ...DEFAULT_ASSUMPTIONS.scenarios[key].returns, ...(s[key]?.returns ?? {}) },
  });
  return {
    inflation: a.inflation ?? DEFAULT_ASSUMPTIONS.inflation,
    scenarios: {
      base: merge("base"),
      conservative: merge("conservative"),
      optimistic: merge("optimistic"),
      custom: merge("custom"),
    },
  };
}

type CategorySeed = Pick<Category, "name" | "kind" | "is_fixed" | "is_essential" | "color">;

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: "Salary", kind: "income", is_fixed: true, is_essential: false, color: "#1f7a5a" },
  { name: "Freelance", kind: "income", is_fixed: false, is_essential: false, color: "#2f9e75" },
  { name: "Business", kind: "income", is_fixed: false, is_essential: false, color: "#3aa37f" },
  { name: "Interest & dividends", kind: "income", is_fixed: false, is_essential: false, color: "#53b38f" },
  { name: "Rental income", kind: "income", is_fixed: true, is_essential: false, color: "#6cc3a1" },
  { name: "Bonus", kind: "income", is_fixed: false, is_essential: false, color: "#86d1b2" },
  { name: "Gifts received", kind: "income", is_fixed: false, is_essential: false, color: "#a3dec6" },
  { name: "Other income", kind: "income", is_fixed: false, is_essential: false, color: "#8fb8a8" },
  { name: "Rent", kind: "expense", is_fixed: true, is_essential: true, color: "#5b4fc4" },
  { name: "Family support", kind: "expense", is_fixed: true, is_essential: true, color: "#7a6fd6" },
  { name: "Groceries", kind: "expense", is_fixed: false, is_essential: true, color: "#c2410c" },
  { name: "Food & dining", kind: "expense", is_fixed: false, is_essential: false, color: "#e0662b" },
  { name: "Fuel", kind: "expense", is_fixed: false, is_essential: true, color: "#b45309" },
  { name: "Transport", kind: "expense", is_fixed: false, is_essential: true, color: "#d97706" },
  { name: "Utilities", kind: "expense", is_fixed: true, is_essential: true, color: "#0e7490" },
  { name: "Mobile & internet", kind: "expense", is_fixed: true, is_essential: true, color: "#0891b2" },
  { name: "Subscriptions", kind: "expense", is_fixed: true, is_essential: false, color: "#7c3aed" },
  { name: "Insurance", kind: "expense", is_fixed: true, is_essential: true, color: "#2563eb" },
  { name: "Health", kind: "expense", is_fixed: false, is_essential: true, color: "#dc2626" },
  { name: "Education", kind: "expense", is_fixed: true, is_essential: true, color: "#4f46e5" },
  { name: "Shopping", kind: "expense", is_fixed: false, is_essential: false, color: "#db2777" },
  { name: "Entertainment", kind: "expense", is_fixed: false, is_essential: false, color: "#c026d3" },
  { name: "Travel", kind: "expense", is_fixed: false, is_essential: false, color: "#0d9488" },
  { name: "Personal care", kind: "expense", is_fixed: false, is_essential: false, color: "#e11d48" },
  { name: "Household", kind: "expense", is_fixed: false, is_essential: true, color: "#65a30d" },
  { name: "Gifts & donations", kind: "expense", is_fixed: false, is_essential: false, color: "#9333ea" },
  { name: "Taxes", kind: "expense", is_fixed: false, is_essential: true, color: "#475569" },
  { name: "Fees & charges", kind: "expense", is_fixed: false, is_essential: false, color: "#64748b" },
  { name: "Interest", kind: "expense", is_fixed: true, is_essential: true, color: "#334155" },
  { name: "Other", kind: "expense", is_fixed: false, is_essential: false, color: "#94a3b8" },
];

export const TX_TYPE_LABEL: Record<string, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  card_spend: "Card spend",
  card_payment: "Card bill payment",
  lend: "Money lent",
  lend_repayment: "Repayment received",
  borrow: "Money borrowed",
  borrow_repayment: "Repayment made",
  invest_buy: "Investment",
  invest_sell: "Investment sale",
  loan_emi: "EMI",
  loan_prepayment: "Loan prepayment",
  chit_installment: "Chit installment",
  chit_payout: "Chit payout",
  adjustment: "Balance adjustment",
};

export const INVESTMENT_TYPE_LABEL: Record<string, string> = {
  mutual_fund: "Mutual fund",
  stock: "Stock",
  etf: "ETF",
  epf: "EPF",
  ppf: "PPF",
  nps: "NPS",
  fd: "Fixed deposit",
  rd: "Recurring deposit",
  gold: "Gold",
  bond: "Bond",
  real_estate: "Real estate",
  vehicle: "Vehicle",
  crypto: "Crypto",
  other: "Other asset",
};

export const DEFAULT_ASSET_CLASS: Record<string, string> = {
  mutual_fund: "equity",
  stock: "equity",
  etf: "equity",
  epf: "debt",
  ppf: "debt",
  nps: "hybrid",
  fd: "debt",
  rd: "debt",
  gold: "gold",
  bond: "debt",
  real_estate: "real_estate",
  vehicle: "other",
  crypto: "other",
  other: "other",
};

export const RETIREMENT_TYPES = new Set(["epf", "ppf", "nps"]);
export const MARKET_TYPES = new Set(["mutual_fund", "stock", "etf", "crypto"]);
export const PHYSICAL_TYPES = new Set(["real_estate", "vehicle"]);

export const LOAN_TYPE_LABEL: Record<string, string> = {
  home: "Home loan",
  personal: "Personal loan",
  vehicle: "Vehicle loan",
  education: "Education loan",
  gold: "Gold loan",
  card_emi: "Card EMI",
  consumer: "Consumer durable",
  other: "Other loan",
};

export const FREQUENCY_LABEL: Record<string, string> = {
  once: "One time",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Every 6 months",
  yearly: "Yearly",
  custom: "Every N days",
};
