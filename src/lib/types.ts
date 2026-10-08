// Domain types. These mirror the Postgres schema in supabase/migrations/0001_init.sql.
// Dates are ISO "YYYY-MM-DD" strings; money values are plain numbers in the
// row's own currency.

export type ISODate = string;
export type UUID = string;

interface Owned {
  id: UUID;
  user_id?: UUID;
  created_at?: string;
  updated_at?: string;
}

export type AccountType = "savings" | "current" | "cash" | "wallet" | "other";

export interface Account extends Owned {
  name: string;
  type: AccountType;
  institution?: string | null;
  currency: string;
  opening_balance: number;
  opening_date: ISODate;
  min_balance: number;
  include_in_cash: boolean;
  is_emergency_fund: boolean;
  last_verified_at?: ISODate | null;
  archived: boolean;
  color?: string | null;
  notes?: string | null;
}

export interface Category extends Owned {
  name: string;
  kind: "income" | "expense";
  is_fixed: boolean;
  is_essential: boolean;
  color?: string | null;
  archived: boolean;
}

export interface CreditCard extends Owned {
  name: string;
  issuer?: string | null;
  last4?: string | null;
  network?: string | null;
  credit_limit: number;
  statement_day: number;
  due_day: number;
  payment_account_id?: UUID | null;
  opening_outstanding: number;
  opening_date: ISODate;
  expected_monthly_spend: number;
  annual_fee: number;
  interest_rate_apr: number;
  reward_points: number;
  color?: string | null;
  archived: boolean;
  notes?: string | null;
}

export interface CardStatement extends Owned {
  card_id: UUID;
  statement_date: ISODate;
  due_date: ISODate;
  total_due: number;
  min_due: number;
  notes?: string | null;
}

export type LoanType = "home" | "personal" | "vehicle" | "education" | "gold" | "card_emi" | "consumer" | "other";

export interface Loan extends Owned {
  name: string;
  lender?: string | null;
  type: LoanType;
  principal: number;
  interest_rate: number;
  interest_type: "reducing" | "flat";
  tenure_months: number;
  emi_amount?: number | null;
  first_emi_date: ISODate;
  emis_paid_offset: number;
  payment_account_id?: UUID | null;
  card_id?: UUID | null;
  processing_fee: number;
  status: "active" | "closed";
  notes?: string | null;
}

export interface Chit extends Owned {
  name: string;
  provider?: string | null;
  chit_value: number;
  monthly_contribution: number;
  installments: number;
  start_date: ISODate;
  installments_paid_offset: number;
  payout_status: "pending" | "received";
  payout_amount?: number | null;
  payout_date?: ISODate | null;
  commission_pct: number;
  auction_notes?: string | null;
  account_id?: UUID | null;
  status: "active" | "completed" | "closed";
  notes?: string | null;
}

export type GoalKind = "emergency" | "house" | "vehicle" | "travel" | "education" | "retirement" | "wedding" | "gadget" | "other";

export interface Goal extends Owned {
  name: string;
  kind: GoalKind;
  target_amount: number;
  target_date?: ISODate | null;
  current_amount: number;
  monthly_contribution: number;
  linked_account_ids: UUID[];
  linked_investment_ids: UUID[];
  priority: 1 | 2 | 3;
  expected_return?: number | null;
  color?: string | null;
  archived: boolean;
  notes?: string | null;
}

export type InvestmentType =
  | "mutual_fund" | "stock" | "etf" | "epf" | "ppf" | "nps" | "fd" | "rd" | "gold"
  | "bond" | "real_estate" | "vehicle" | "crypto" | "other";

export type AssetClass = "equity" | "debt" | "hybrid" | "gold" | "real_estate" | "cash" | "other";

export interface Investment extends Owned {
  type: InvestmentType;
  name: string;
  institution?: string | null;
  identifier?: string | null;
  asset_class: AssetClass;
  units?: number | null;
  avg_cost?: number | null;
  current_price?: number | null;
  invested_amount: number;
  current_value?: number | null;
  value_as_of?: ISODate | null;
  expected_return?: number | null;
  interest_rate?: number | null;
  start_date?: ISODate | null;
  maturity_date?: ISODate | null;
  sip_amount: number;
  sip_day?: number | null;
  sip_account_id?: UUID | null;
  sip_active: boolean;
  track_from: ISODate;
  employee_contribution: number;
  employer_contribution: number;
  pension_contribution: number;
  is_international: boolean;
  currency: string;
  goal_id?: UUID | null;
  archived: boolean;
  notes?: string | null;
}

export interface InvestmentValuation extends Owned {
  investment_id: UUID;
  date: ISODate;
  value: number;
  price?: number | null;
  note?: string | null;
}

export interface Lending extends Owned {
  direction: "lent" | "borrowed";
  person: string;
  amount: number;
  date: ISODate;
  expected_date?: ISODate | null;
  interest_rate: number;
  account_id?: UUID | null;
  include_in_projection: boolean;
  written_off: boolean;
  notes?: string | null;
}

export interface Reserve extends Owned {
  name: string;
  target_amount: number;
  current_amount: number;
  monthly_funding: number;
  due_date?: ISODate | null;
  color?: string | null;
  notes?: string | null;
}

export type Frequency = "once" | "weekly" | "biweekly" | "monthly" | "quarterly" | "half_yearly" | "yearly" | "custom";
export type Certainty = "known" | "expected" | "uncertain";

export interface RecurringRule extends Owned {
  name: string;
  kind: "income" | "expense" | "transfer";
  amount: number;
  frequency: Frequency;
  interval_days?: number | null;
  day_of_month?: number | null;
  start_date: ISODate;
  end_date?: ISODate | null;
  track_from: ISODate;
  account_id?: UUID | null;
  to_account_id?: UUID | null;
  card_id?: UUID | null;
  category?: string | null;
  is_fixed: boolean;
  is_essential: boolean;
  is_subscription: boolean;
  certainty: Certainty;
  growth_pct?: number | null;
  tax_deducted: number;
  active: boolean;
  notes?: string | null;
}

export type OverrideSource = "rule" | "sip" | "loan" | "chit" | "card" | "lending";

export interface EventOverride extends Owned {
  source_type: OverrideSource;
  source_id: UUID;
  occurrence_date: ISODate;
  action: "skip" | "cancel" | "reschedule" | "adjust";
  new_date?: ISODate | null;
  new_amount?: number | null;
  note?: string | null;
}

export type TxType =
  | "income" | "expense" | "transfer" | "card_spend" | "card_payment"
  | "lend" | "lend_repayment" | "borrow" | "borrow_repayment"
  | "invest_buy" | "invest_sell" | "loan_emi" | "loan_prepayment"
  | "chit_installment" | "chit_payout" | "adjustment";

export interface Transaction extends Owned {
  date: ISODate;
  type: TxType;
  amount: number;
  account_id?: UUID | null;
  to_account_id?: UUID | null;
  card_id?: UUID | null;
  statement_id?: UUID | null;
  loan_id?: UUID | null;
  chit_id?: UUID | null;
  investment_id?: UUID | null;
  lending_id?: UUID | null;
  rule_id?: UUID | null;
  occurrence_date?: ISODate | null;
  is_partial: boolean;
  category?: string | null;
  description?: string | null;
  notes?: string | null;
  units?: number | null;
  price?: number | null;
  principal_part?: number | null;
  interest_part?: number | null;
  reconciled: boolean;
  import_hash?: string | null;
  tags: string[];
}

export interface NetWorthSnapshot extends Owned {
  date: ISODate;
  cash: number;
  investments: number;
  other_assets: number;
  liabilities: number;
  net_worth: number;
  breakdown: Record<string, number>;
}

export interface AuditEvent {
  id: number | string;
  table_name: string;
  record_id?: string | null;
  action: "insert" | "update" | "delete";
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Profile, assumptions and preferences
// ---------------------------------------------------------------------------

export interface ReturnAssumptions {
  equity: number;
  debt: number;
  hybrid: number;
  gold: number;
  real_estate: number;
  cash: number;
  other: number;
  epf: number;
}

export interface ScenarioAssumptions {
  /** % per year applied to income rules without their own growth rate. */
  salaryGrowth: number;
  /** % per year applied to expense rules without their own growth rate. */
  expenseGrowth: number;
  /** Multiplier applied to all planned income (1 = as planned). */
  incomeFactor: number;
  /** Multiplier applied to variable (non-fixed) expenses. */
  variableExpenseFactor: number;
  /** Expected annual return by asset class, in %. */
  returns: ReturnAssumptions;
  /** Include events marked "uncertain" (e.g. a bonus, a friend's repayment). */
  includeUncertain: boolean;
}

export type ScenarioKey = "base" | "conservative" | "optimistic" | "custom";

export interface Assumptions {
  inflation: number;
  scenarios: Record<ScenarioKey, ScenarioAssumptions>;
}

export interface DashboardWidgetPref {
  id: string;
  hidden?: boolean;
}

export interface Preferences {
  theme?: "system" | "light" | "dark";
  maskValues?: boolean;
  dashboard?: { desktop?: DashboardWidgetPref[]; mobile?: DashboardWidgetPref[] };
  dismissedAlerts?: Record<string, ISODate>;
  notifications?: {
    browser?: boolean;
    lastNotified?: ISODate;
    modules?: Partial<Record<AlertModule, boolean>>;
    digest?: boolean;
    quietStart?: string;
    quietEnd?: string;
  };
  onboardingStep?: number;
  emergencyMonths?: number;
  projectionDate?: ISODate;
  showBmcWidget?: boolean;
}

export interface Profile {
  id: UUID;
  name?: string | null;
  country: string;
  currency: string;
  locale: string;
  timezone: string;
  birth_year?: number | null;
  retirement_age: number;
  life_expectancy: number;
  mode: "simple" | "advanced";
  onboarding_done: boolean;
  assumptions: Partial<Assumptions>;
  preferences: Preferences;
  fx_rates: Record<string, number>;
  created_at?: string;
  updated_at?: string;
}

export type AlertModule = "bills" | "cards" | "loans" | "chits" | "sip" | "income" | "lending" | "goals" | "balance" | "spending";

// ---------------------------------------------------------------------------
// The full in-memory dataset for a user
// ---------------------------------------------------------------------------

export interface Dataset {
  profile: Profile;
  accounts: Account[];
  categories: Category[];
  credit_cards: CreditCard[];
  card_statements: CardStatement[];
  loans: Loan[];
  chits: Chit[];
  goals: Goal[];
  investments: Investment[];
  investment_valuations: InvestmentValuation[];
  lendings: Lending[];
  reserves: Reserve[];
  recurring_rules: RecurringRule[];
  event_overrides: EventOverride[];
  transactions: Transaction[];
  net_worth_snapshots: NetWorthSnapshot[];
}

export type TableName = Exclude<keyof Dataset, "profile">;

export const TABLES: TableName[] = [
  "accounts",
  "categories",
  "credit_cards",
  "card_statements",
  "loans",
  "chits",
  "goals",
  "investments",
  "investment_valuations",
  "lendings",
  "reserves",
  "recurring_rules",
  "event_overrides",
  "transactions",
  "net_worth_snapshots",
];

export type RowOf<T extends TableName> = Dataset[T][number];
