import { describe, expect, it } from "vitest";
import { buildDemoDataset } from "./data/demo";
import { annualPremium, insuranceKind, nextPremium, premiumRule, reminderFor, reminderSync } from "./insurance";
import type { InsurancePolicy, RecurringRule, Transaction } from "./types";

const TODAY = "2026-10-12";

function setup(p: Partial<InsurancePolicy> = {}) {
  const ds = buildDemoDataset(TODAY);
  ds.insurance_policies = [];
  const policy: InsurancePolicy = {
    id: "pol", name: "Family health", type: "health", premium: 12_000, frequency: "yearly", premium_due_date: "2026-10-20",
    notify: true, notify_time: "09:30", notify_days_before: 3, status: "active", ...p,
  };
  const rule = { ...(premiumRule(policy) as RecurringRule), id: "rule-pol" };
  ds.recurring_rules.push(rule);
  policy.rule_id = rule.id;
  ds.insurance_policies.push(policy);
  return { ds, policy, rule };
}

describe("insurance", () => {
  it("knows the preset kinds and accepts your own", () => {
    expect(insuranceKind("vehicle").coverLabel).toBe("IDV");
    expect(insuranceKind("pet").label).toBe("Pet");
  });

  it("annual premium by frequency; single premium and closed policies count 0", () => {
    expect(annualPremium({ premium: 1_000, frequency: "monthly", status: "active" })).toBe(12_000);
    expect(annualPremium({ premium: 5_000, frequency: "half_yearly", status: "active" })).toBe(10_000);
    expect(annualPremium({ premium: 50_000, frequency: "once", status: "active" })).toBe(0);
    expect(annualPremium({ premium: 1_000, frequency: "monthly", status: "lapsed" })).toBe(0);
  });

  it("the premium becomes an essential repeating bill", () => {
    const { rule } = setup();
    expect(rule).toMatchObject({ kind: "expense", amount: 12_000, frequency: "yearly", start_date: "2026-10-20", track_from: "2026-10-20", category: "Insurance", is_fixed: true, is_essential: true });
  });

  it("reminds N days before at the chosen time, then moves on once paid", () => {
    const { ds, policy } = setup();
    expect(nextPremium(policy, ds, TODAY)?.date).toBe("2026-10-20");
    expect(reminderFor(policy, ds, TODAY)).toMatchObject({ due_date: "2026-10-17", due_time: "09:30", kind: "reminder", source: "insurance" });
    ds.transactions.unshift({ id: "t", date: "2026-10-12", type: "expense", amount: 12_000, account_id: ds.accounts[0].id, rule_id: "rule-pol", occurrence_date: "2026-10-20" } as Transaction);
    expect(reminderFor(policy, ds, TODAY)?.due_date).toBe("2027-10-17");
  });

  it("never schedules a reminder in the past; nothing when off or closed", () => {
    const { ds, policy } = setup({ notify_days_before: 30 });
    expect(reminderFor(policy, ds, TODAY)?.due_date).toBe(TODAY);
    expect(reminderFor({ ...policy, notify: false }, ds, TODAY)).toBeNull();
    expect(reminderFor({ ...policy, status: "closed" }, ds, TODAY)).toBeNull();
  });

  it("sync: creates, then leaves a handled reminder alone until the date changes", () => {
    const { ds, policy } = setup();
    const first = reminderSync(policy, ds, TODAY);
    expect(first.op).toBe("create");
    const row = { ...(first as { row: object }).row, id: "rem", status: "done", data: { alarm_ack: "2026-10-17 09:30" } } as never;
    ds.life_items.push(row);
    policy.reminder_id = "rem";
    expect(reminderSync(policy, ds, TODAY).op).toBe("none");
    const moved = reminderSync({ ...policy, notify_time: "08:00" }, ds, TODAY);
    expect(moved.op).toBe("update");
    expect((moved as { patch: { data: { alarm_ack: unknown } } }).patch.data.alarm_ack).toBeNull();
    expect(reminderSync({ ...policy, notify: false }, ds, TODAY).op).toBe("remove");
  });
});
