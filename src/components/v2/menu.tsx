"use client";

import { Bell, Briefcase, CalendarDays, ChartCandlestick, HelpCircle, Landmark, MessageSquareText, PiggyBank, Repeat, Users, Settings, ShieldCheck, Target, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useFinance } from "@/lib/finance";
import { annualPremium } from "@/lib/insurance";
import { formatMoney } from "@/lib/money";
import { V2PageHeader } from "./ui";
import { useTraining } from "../training/actions";
import { monthlyNeed } from "./sinking";

type Tile = { href?: string; onClick?: () => void; label: string; icon: typeof Bell; hint: ReactNode };

export function MenuScreen() {
  const { ds, month, goals, ctx, today } = useFinance();
  const incomeCount = ds.recurring_rules.filter((r) => r.kind === "income" && r.active).length;
  const budgetLeft = Math.max(0, month.budgetLimit - month.budgetSpent);
  const activeGoals = goals.filter((g) => g.status !== "done").length;
  const activePolicies = (ds.insurance_policies ?? []).filter((p) => p.status === "active");
  const policyCount = activePolicies.length;
  const yearlyPremium = activePolicies.reduce((t, p) => t + annualPremium(p), 0);
  const sinking = ds.profile.preferences?.sinkingFunds ?? [];
  const sinkingMonth = sinking.reduce((s, f) => s + monthlyNeed(f, today), 0);
  const n = (k: string, c: number, none: string) => (c ? `${c} ${k}${c === 1 ? "" : "s"}` : none);

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: "Money plans",
      tiles: [
        { href: "/menu/income", label: "My jobs & income", icon: Briefcase, hint: n("source", incomeCount, "Add your salary") },
        { href: "/menu/budgets", label: "Budgets & spending plans", icon: PiggyBank, hint: month.budgetLimit ? `${formatMoney(budgetLeft, ctx)} left this month` : "Set a monthly limit" },
        { href: "/menu/insurance", label: "Insurance", icon: ShieldCheck, hint: policyCount ? `${policyCount} ${policyCount === 1 ? "policy" : "policies"} · ${formatMoney(yearlyPremium, ctx)} a year` : "Life, health, vehicle and more" },
        { href: "/menu/calendar", label: "Calendar", icon: CalendarDays, hint: `${month.unpaid.length} payment${month.unpaid.length === 1 ? "" : "s"} left this month` },
        { href: "/menu/sinking", label: "Sinking funds", icon: Repeat, hint: sinking.length ? `${formatMoney(sinkingMonth, ctx)} to put aside this month` : "Save monthly for yearly costs" },
        { href: "/menu/tax", label: "Tax estimate", icon: Landmark, hint: "Old vs new regime · 80C, 80D" },
        { href: "/menu/goals", label: "Goals", icon: Target, hint: activeGoals ? `${activeGoals} goal${activeGoals === 1 ? "" : "s"}` : "What you're saving for" },
        { href: "/menu/future", label: "Future", icon: Sparkles, hint: "Your money on any date · Can I afford it?" },
      ],
    },
    {
      title: "App",
      tiles: [
        { href: "/menu/contacts", label: "Contacts", icon: Users, hint: ds.contacts?.length ? `${ds.contacts.length} people` : "Import from your phone (.vcf)" },
        { href: "/menu/sms", label: "Bank SMS", icon: MessageSquareText, hint: "Add payments from bank messages (iPhone)" },
        { href: "/menu/settings", label: "Settings", icon: Settings, hint: "Profile, import & export, security, look" },
        { href: "/menu/help", label: "Help & support", icon: HelpCircle, hint: "Questions and answers" },
      ],
    },
  ];

  const cls = "group flex min-h-24 flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong";
  return (
    <>
      <V2PageHeader title="Menu" />
      <div className="flex flex-col gap-6">
        <TrainingTile />
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">{g.title}</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {g.tiles.map((t) => {
                const body = (
                  <>
                    <t.icon className="h-5 w-5 text-brand" aria-hidden />
                    <span>
                      <span className="block text-[15px] font-semibold leading-tight">{t.label}</span>
                      <span className="mt-0.5 block text-[12.5px] text-ink-3">{t.hint}</span>
                    </span>
                  </>
                );
                return t.href ? (
                  <Link key={t.label} href={t.href} className={cls}>
                    {body}
                  </Link>
                ) : (
                  <button key={t.label} type="button" onClick={t.onClick} className={cls}>
                    {body}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** Trading Training lives in the desktop sidebar; on phones (no room on the bottom bar) it leads the Menu. */
function TrainingTile() {
  const t = useTraining();
  const started = t.data.attempts.length > 0 || t.data.lessons.length > 0;
  return (
    <Link href="/trading-training" className="lift group flex items-center gap-4 rounded-2xl bg-inverse p-4 text-on-inverse lg:hidden">
      <ChartCandlestick className="h-8 w-8 shrink-0 text-warn" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-tight">Trading Training</span>
        <span className="mt-0.5 block text-[12.5px] opacity-75">
          {started ? `Level ${t.level.level} · ${t.streak.current}-day streak · ${t.todayStats.xp} XP today` : "Learn to read candlestick charts, step by step"}
        </span>
      </span>
      <span className="text-[13px] font-semibold text-warn">Open →</span>
    </Link>
  );
}
