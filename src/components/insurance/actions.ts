"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { todayISO } from "@/lib/dates";
import { computePositions } from "@/lib/engine/ledger";
import { paysPremium, premiumRule, reminderSync } from "@/lib/insurance";
import { newId } from "@/lib/data/repo";
import { useStore } from "@/lib/store";
import type { Dataset, InsurancePolicy, RecurringRule } from "@/lib/types";

const store = useStore.getState;

/** Apply what the reminder needs (create / move / remove) for one policy. */
async function syncReminder(p: InsurancePolicy, ds: Dataset) {
  const today = todayISO(ds.profile.timezone);
  const s = reminderSync(p, ds, today, computePositions(ds, today));
  if (s.op === "create") {
    const saved = await store().add("life_items", s.row as never);
    await store().patch("insurance_policies", p.id, { reminder_id: (saved as { id: string }).id });
  } else if (s.op === "update") await store().patch("life_items", s.id, s.patch);
  else if (s.op === "remove") {
    await store().remove("life_items", s.id);
    await store().patch("insurance_policies", p.id, { reminder_id: null });
  }
}

/** Save a policy together with its premium bill and reminder. */
export async function savePolicy(form: Partial<InsurancePolicy>, existing?: InsurancePolicy | null): Promise<InsurancePolicy> {
  const ds = store().ds!;
  const id = existing?.id ?? newId();
  const draft = { ...(existing ?? {}), ...form, id } as InsurancePolicy;

  // 1. The premium as a repeating bill (only while the policy is active and has a premium + date).
  const rule = draft.rule_id ? ds.recurring_rules.find((r) => r.id === draft.rule_id) ?? null : null;
  let rule_id: string | null = rule?.id ?? null;
  if (paysPremium(draft)) {
    const fields = premiumRule(draft, rule);
    if (rule) await store().patch("recurring_rules", rule.id, fields);
    else rule_id = (await store().add("recurring_rules", fields as Partial<RecurringRule>)).id;
  } else if (rule && rule.active) {
    // Lapsed, closed or no premium any more: stop the bill but keep its history.
    await store().patch("recurring_rules", rule.id, { active: false });
  }

  // 2. The policy.
  const row = { ...form, rule_id };
  let saved: InsurancePolicy;
  if (existing) {
    await store().patch("insurance_policies", id, row);
    saved = store().ds!.insurance_policies.find((x) => x.id === id)!;
  } else saved = (await store().add("insurance_policies", { ...row, id } as Partial<InsurancePolicy>)) as InsurancePolicy;

  // 3. The reminder.
  await syncReminder(saved, store().ds!);
  return saved;
}

/** Delete a policy, its reminder and its premium bill (payments already recorded stay in your history). */
export async function deletePolicy(p: InsurancePolicy) {
  const ds = store().ds!;
  if (p.reminder_id && ds.life_items.some((i) => i.id === p.reminder_id)) await store().remove("life_items", p.reminder_id);
  await store().remove("insurance_policies", p.id);
  if (p.rule_id && ds.recurring_rules.some((r) => r.id === p.rule_id)) await store().remove("recurring_rules", p.rule_id);
  toast.success(`${p.name} deleted.`);
}

/**
 * Keeps every policy's reminder on its next unpaid premium — after a payment, a skipped premium, a new day, or a
 * change made elsewhere. Mounted once in the app shell.
 */
export function InsuranceReminderSync() {
  const ds = useStore((s) => s.ds);
  const busy = useRef(false);
  useEffect(() => {
    if (!ds || busy.current || !ds.insurance_policies?.length) return;
    const t = window.setTimeout(async () => {
      busy.current = true;
      try {
        const cur = store().ds;
        if (!cur) return;
        for (const p of cur.insurance_policies) await syncReminder(p, store().ds!);
      } catch {
        /* the store already showed why; try again on the next change */
      } finally {
        busy.current = false;
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [ds]);
  return null;
}
