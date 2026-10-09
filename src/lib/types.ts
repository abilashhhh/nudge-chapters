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
  /** Bought for someone else who repays you (e.g. a friend's laptop on your card). Not a personal expense. */
  reimbursable_person?: string | null;
  processing_fee: number;
  status: "active" | "closed";
  notes?: string | null;
}

/** Where a chit installment's figures came from (the "source / confirmation" of the record). */
export type ChitRecordSource = "foreman_slip" | "foreman_message" | "passbook" | "own_estimate" | "other";

/**
 * One installment of a chit. Chit payments depend on each month's auction, so every installment
 * keeps its own figures instead of assuming the first month's amount repeats.
 * Cash actually paid is a `chit_installment` transaction; `paid_amount` is only for installments
 * paid before you started tracking (their cash is already in your balances).
 */
export interface ChitInstallmentRecord {
  /** 1-based installment number. */
  no: number;
  /** Override of the scheduled due date. */
  due_date?: ISODate | null;
  /** Override of the chit's base installment for this month. */
  base_amount?: number | null;
  auction_date?: ISODate | null;
  /** Discount the winning bidder accepted for the whole group (for reference). */
  auction_discount?: number | null;
  /** Your share of that discount (dividend / benefit), which reduces this installment. */
  dividend?: number | null;
  /** Other charges added to this installment. */
  fees?: number | null;
  /** Confirmed amount due, when the slip states it directly. Otherwise base − dividend + fees. */
  payable?: number | null;
  /** Amount paid, only for installments paid before tracking began. */
  paid_amount?: number | null;
  paid_date?: ISODate | null;
  source?: ChitRecordSource | null;
  note?: string | null;
}

export interface Chit extends Owned {
  name: string;
  provider?: string | null;
  chit_value: number;
  /** Base (full) installment before any auction dividend — usually chit value ÷ number of months. */
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
  /** Per-installment auction results and older payments. Missing on rows saved before this existed. */
  installment_records?: ChitInstallmentRecord[] | null;
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
  /** 1 Critical · 2 High · 3 Medium · 4 Low. */
  priority: 1 | 2 | 3 | 4;
  /** Starts receiving money only after this goal reaches `min_before_start` (its full target when 0). */
  depends_on?: UUID | null;
  min_before_start?: number | null;
  /** Paused goals keep their progress but get no new money. */
  paused?: boolean | null;
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
  /** Sections and widgets the user hid. Hiding never changes the underlying data or calculations. */
  hidden?: { sections?: string[]; widgets?: string[] };
  visual?: { emoji?: boolean; celebrations?: boolean; spendIcons?: boolean; motion?: "full" | "subtle" | "off" };
  /** Minimum cash to keep untouched when planning goals. */
  cashBuffer?: number;
  /** Credit-utilisation alert, in % of limit (default 30). */
  utilAlert?: number;
  /** Warn when projected available cash would drop below this. */
  lowBalance?: number;
  /** Salary-day plans the user accepted or skipped, by month ("YYYY-MM"). */
  salaryPlans?: Record<string, { status: "accepted" | "skipped"; at: string }>;
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
// Personal system: tasks, checklists, notes, reminders, wishlist
// ---------------------------------------------------------------------------

export type LifeKind = "task" | "checklist" | "note" | "reminder" | "wishlist";
export type Repeat = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface ChecklistEntry {
  id: string;
  text: string;
  done: boolean;
}

/** Kind-specific fields. Prices and URLs belong to wishlist items; `items` to checklists and task subtasks. */
export interface LifeItemData {
  items?: ChecklistEntry[];
  url?: string | null;
  image_url?: string | null;
  target_price?: number | null;
  current_price?: number | null;
  /** Prices you've recorded over time, for the buy/wait check (facts you entered, not fetched). */
  price_history?: { date: ISODate; price: number }[];
  category?: string | null;
  /** Tasks: expected cost, reserved in the month the task is due. */
  estimated_cost?: number | null;
  /** "YYYY-MM-DD HH:MM" of the alarm you last turned off, so it doesn't ring again. */
  alarm_ack?: string | null;
}

export interface LifeItem extends Owned {
  kind: LifeKind;
  title: string;
  body?: string | null;
  status: "open" | "done" | "archived";
  due_date?: ISODate | null;
  /** "HH:MM", local time — reminders only. */
  due_time?: string | null;
  repeat: Repeat;
  priority: 1 | 2 | 3;
  tags: string[];
  pinned: boolean;
  /** The chapter (goal) this belongs to. */
  goal_id?: UUID | null;
  data: LifeItemData;
  /** Where it came from: "user" for now; integrations will set their own. */
  source: string;
  completed_at?: string | null;
}

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
  life_items: LifeItem[];
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
  "life_items",
];

export type RowOf<T extends TableName> = Dataset[T][number];
