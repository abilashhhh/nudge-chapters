// Insurance policies: kinds, premium maths, and the two records each policy keeps in step —
// the repeating bill that carries its premium, and the reminder that rings before / on the premium date.
// Pure functions (tested); the screens and the sync hook call these.

import { addDays, maxDate } from "./dates";
import { buildEvents, SETTLED, type FinEvent } from "./engine/events";
import type { Positions } from "./engine/ledger";
import type { Dataset, ISODate, InsurancePolicy, LifeItem, PremiumFrequency, RecurringRule, TableName } from "./types";

export interface InsuranceKind {
  id: string;
  label: string;
  icon: string;
  /** What the cover amount is called for this kind. */
  coverLabel: string;
}

export const INSURANCE_KINDS: InsuranceKind[] = [
  { id: "health", label: "Health", icon: "🏥", coverLabel: "Cover" },
  { id: "life", label: "Life", icon: "🛡️", coverLabel: "Sum assured" },
  { id: "term", label: "Term life", icon: "📜", coverLabel: "Sum assured" },
  { id: "vehicle", label: "Vehicle", icon: "🚗", coverLabel: "IDV" },
  { id: "home", label: "Home", icon: "🏠", coverLabel: "Cover" },
  { id: "travel", label: "Travel", icon: "✈️", coverLabel: "Cover" },
  { id: "accident", label: "Personal accident", icon: "🩹", coverLabel: "Cover" },
  { id: "critical_illness", label: "Critical illness", icon: "❤️‍🩹", coverLabel: "Cover" },
  { id: "other", label: "Other", icon: "📄", coverLabel: "Cover" },
];

/** A kind by id; your own kinds (free text) get a generic look with their own name. */
export function insuranceKind(type: string | null | undefined): InsuranceKind {
  const k = INSURANCE_KINDS.find((x) => x.id === type);
  if (k) return k;
  const label = (type ?? "").trim();
  return { id: label || "other", label: label ? label[0].toUpperCase() + label.slice(1) : "Other", icon: "📄", coverLabel: "Cover" };
}

export const PREMIUM_FREQUENCIES: { id: PremiumFrequency; label: string; perYear: number }[] = [
  { id: "monthly", label: "Every month", perYear: 12 },
  { id: "quarterly", label: "Every 3 months", perYear: 4 },
  { id: "half_yearly", label: "Every 6 months", perYear: 2 },
  { id: "yearly", label: "Every year", perYear: 1 },
  { id: "once", label: "One time (single premium)", perYear: 0 },
];

export const frequencyLabel = (f: PremiumFrequency) => PREMIUM_FREQUENCIES.find((x) => x.id === f)?.label ?? f;

/** Premiums you pay in a year (single-premium policies count 0). */
export function annualPremium(p: Pick<InsurancePolicy, "premium" | "frequency" | "status">): number {
  if (p.status !== "active") return 0;
  return (p.premium || 0) * (PREMIUM_FREQUENCIES.find((x) => x.id === p.frequency)?.perYear ?? 0);
}

/** Policies that still need premiums (active, a premium, a date). */
export const paysPremium = (p: InsurancePolicy) => p.status === "active" && p.premium > 0 && !!p.premium_due_date;

// ---------------------------------------------------------------------------
// The premium as a repeating bill
// ---------------------------------------------------------------------------

/** The repeating-bill fields that follow from a policy (created or updated together with it). */
export function premiumRule(p: InsurancePolicy, existing?: RecurringRule | null): Partial<RecurringRule> {
  const start = p.premium_due_date!;
  // When the next premium date moves, the schedule restarts there; earlier dates don't turn into "late" bills.
  const track = existing && existing.start_date === start ? existing.track_from : start;
  return {
    name: `${p.name} premium`,
    kind: "expense",
    amount: p.premium,
    frequency: p.frequency,
    start_date: start,
    track_from: track,
    end_date: p.end_date && p.end_date >= start ? p.end_date : null,
    day_of_month: null,
    account_id: p.card_id ? null : p.account_id ?? null,
    card_id: p.card_id ?? null,
    category: "Insurance",
    is_fixed: true,
    is_essential: true,
    is_subscription: false,
    certainty: "known",
    tax_deducted: 0,
    active: true,
    notes: `Insurance policy${p.policy_number ? ` ${p.policy_number}` : ""}${p.insurer ? ` · ${p.insurer}` : ""}`,
  };
}

/** Only this policy's premium events (built with the same engine as the rest of the app). */
export function premiumEvents(p: InsurancePolicy, ds: Dataset, today: ISODate, positions?: Positions, days = 800): FinEvent[] {
  const rule = p.rule_id ? ds.recurring_rules.find((r) => r.id === p.rule_id) : null;
  if (!rule) return [];
  const empty = Object.fromEntries(
    (Object.keys(ds) as (keyof Dataset)[]).filter((k) => k !== "profile").map((k) => [k, [] as unknown[]]),
  ) as unknown as Omit<Dataset, "profile">;
  const only: Dataset = { ...empty, profile: ds.profile, accounts: ds.accounts, credit_cards: ds.credit_cards, recurring_rules: [rule], transactions: ds.transactions, event_overrides: ds.event_overrides };
  return buildEvents(only, { from: addDays(today, -400), to: addDays(today, days), today, positions }).filter((e) => e.ruleId === rule.id);
}

/** The next premium still to pay: an overdue one first, otherwise the next upcoming one. */
export function nextPremium(p: InsurancePolicy, ds: Dataset, today: ISODate, positions?: Positions): FinEvent | null {
  if (!paysPremium(p)) return null;
  const evs = premiumEvents(p, ds, today, positions).filter((e) => !SETTLED.includes(e.status));
  return evs.sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null;
}

// ---------------------------------------------------------------------------
// The reminder
// ---------------------------------------------------------------------------

/** When the reminder should ring for a premium due on `due`: N days before, at the chosen time — never in the past day. */
export function reminderDate(p: Pick<InsurancePolicy, "notify_days_before">, due: ISODate, today: ISODate): ISODate {
  return maxDate(addDays(due, -(p.notify_days_before || 0)), today);
}

/**
 * The reminder fields for the next upcoming premium (today or later), or null when there's nothing to remind about.
 * Overdue premiums aren't re-rung here — they already show as late in To Pay and in alerts.
 */
export function reminderFor(p: InsurancePolicy, ds: Dataset, today: ISODate, positions?: Positions): Partial<LifeItem> | null {
  if (!p.notify || !paysPremium(p)) return null;
  const next = premiumEvents(p, ds, today, positions)
    .filter((e) => !SETTLED.includes(e.status) && e.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (!next) return null;
  const when = p.notify_days_before ? `${p.notify_days_before} day${p.notify_days_before === 1 ? "" : "s"} before` : "on the day";
  return {
    kind: "reminder",
    title: `Insurance premium: ${p.name}`,
    body: `Premium of ${money(p.premium, ds)} due on ${next.date}${p.insurer ? ` (${p.insurer})` : ""}. Reminder ${when}.`,
    due_date: reminderDate(p, next.date, today),
    due_time: p.notify_time || "09:00",
    repeat: "none",
    status: "open",
    priority: 1,
    tags: ["insurance"],
    source: "insurance",
  };
}

function money(n: number, ds: Dataset): string {
  try {
    return new Intl.NumberFormat(ds.profile.locale || "en-IN", { style: "currency", currency: ds.profile.currency || "INR", maximumFractionDigits: 0 }).format(n);
  } catch {
    return String(n);
  }
}

/** What has to change so the reminder matches the policy. */
export type ReminderSync =
  | { op: "none" }
  | { op: "create"; row: Partial<LifeItem> }
  | { op: "update"; id: string; patch: Partial<LifeItem> }
  | { op: "remove"; id: string };

export function reminderSync(p: InsurancePolicy, ds: Dataset, today: ISODate, positions?: Positions): ReminderSync {
  const want = reminderFor(p, ds, today, positions);
  const have = p.reminder_id ? ds.life_items.find((i) => i.id === p.reminder_id) : null;
  if (!want) return have ? { op: "remove", id: have.id } : { op: "none" };
  if (!have) return { op: "create", row: want };
  // Same date and time: leave it alone — including when you've already marked it done or turned the alarm off.
  if (have.due_date === want.due_date && have.due_time === want.due_time) {
    return have.title === want.title && have.body === want.body ? { op: "none" } : { op: "update", id: have.id, patch: { title: want.title, body: want.body } };
  }
  // A new date or time rings again (the alarm remembers which date+time you turned off).
  return { op: "update", id: have.id, patch: { ...want, data: { ...have.data, alarm_ack: null } } };
}

/** Tables a policy touches (for reloads after a delete). */
export const INSURANCE_TABLES: TableName[] = ["insurance_policies", "recurring_rules", "life_items"];
