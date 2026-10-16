"use client";

import { Bell, Briefcase, CalendarDays, HelpCircle, PiggyBank, Settings, ShieldCheck, Target, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useFinance } from "@/lib/finance";
import { annualPremium } from "@/lib/insurance";
import { formatMoney } from "@/lib/money";
import { V2PageHeader } from "./ui";

type Tile = { href?: string; onClick?: () => void; label: string; icon: typeof Bell; hint: ReactNode };

export function MenuScreen() {
  const { ds, month, goals, ctx } = useFinance();
  const incomeCount = ds.recurring_rules.filter((r) => r.kind === "income" && r.active).length;
  const budgetLeft = Math.max(0, month.budgetLimit - month.budgetSpent);
  const activeGoals = goals.filter((g) => g.status !== "done").length;
  const activePolicies = (ds.insurance_policies ?? []).filter((p) => p.status === "active");
  const policyCount = activePolicies.length;
  const yearlyPremium = activePolicies.reduce((t, p) => t + annualPremium(p), 0);
  const n = (k: string, c: number, none: string) => (c ? `${c} ${k}${c === 1 ? "" : "s"}` : none);

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: "Money plans",
      tiles: [
        { href: "/menu/income", label: "My jobs & income", icon: Briefcase, hint: n("source", incomeCount, "Add your salary") },
        { href: "/menu/budgets", label: "Budgets & spending plans", icon: PiggyBank, hint: month.budgetLimit ? `${formatMoney(budgetLeft, ctx)} left this month` : "Set a monthly limit" },
        { href: "/menu/insurance", label: "Insurance", icon: ShieldCheck, hint: policyCount ? `${policyCount} ${policyCount === 1 ? "policy" : "policies"} · ${formatMoney(yearlyPremium, ctx)} a year` : "Life, health, vehicle and more" },
        { href: "/menu/calendar", label: "Calendar", icon: CalendarDays, hint: `${month.unpaid.length} payment${month.unpaid.length === 1 ? "" : "s"} left this month` },
        { href: "/menu/goals", label: "Goals", icon: Target, hint: activeGoals ? `${activeGoals} goal${activeGoals === 1 ? "" : "s"}` : "What you're saving for" },
        { href: "/menu/future", label: "Future", icon: Sparkles, hint: "Your money on any date · Can I afford it?" },
      ],
    },
    {
      title: "App",
      tiles: [
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
