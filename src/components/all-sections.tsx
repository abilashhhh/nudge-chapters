"use client";

import {
  BarChart3, CalendarDays, Coffee, FileUp, Heart, Landmark, ListChecks, PieChart, PiggyBank, Sparkles, Target, TrendingUp, Users, Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Money } from "@/components/money";
import { APP_NAME, BMC_URL } from "@/lib/config";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useHidden } from "@/lib/visual";

type Tile = { href: string; label: string; icon: typeof Wallet; hint: ReactNode; section?: string };

/** Every feature of the app, grouped so it stays easy to scan. Lives in Settings (and /more in the Advanced look). */
export function AllSections() {
  const { positions, month, ctx } = useFinance();
  const hidden = useHidden();
  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: "Everyday",
      tiles: [
        { href: "/plan", label: "Plan", icon: ListChecks, hint: "Tasks, checklists, notes", section: "tasks" },
        { href: "/cash-flow", label: "Cash flow", icon: Wallet, hint: "Bills and transactions", section: "transactions" },
        { href: "/budgets", label: "Budgets", icon: PiggyBank, hint: `${formatMoney(Math.max(0, month.budgetLimit - month.budgetSpent), ctx)} left this month`, section: "budgets" },
        { href: "/calendar", label: "Calendar", icon: CalendarDays, hint: `${month.unpaid.length} bills left this month`, section: "bills" },
        { href: "/owed", label: "Owed to you", icon: Users, hint: <Money value={positions.totals.receivables} />, section: "reimbursements" },
      ],
    },
    {
      title: "What you have and owe",
      tiles: [
        { href: "/money", label: "Money overview", icon: PieChart, hint: "Net worth and health", section: "dashboard" },
        { href: "/assets", label: "Assets", icon: TrendingUp, hint: "Accounts and investments", section: "investments" },
        { href: "/liabilities", label: "Liabilities", icon: Landmark, hint: "Cards, loans, chits", section: "credit_cards" },
      ],
    },
    {
      title: "Planning ahead",
      tiles: [
        { href: "/goals", label: "Chapters", icon: Target, hint: "Goals and how to fund them", section: "goals" },
        { href: "/plan?tab=wishlist", label: "Wishlist", icon: Heart, hint: "Buy, wait or save first" },
        { href: "/projection", label: "Future", icon: Sparkles, hint: "Project any date", section: "projections" },
        { href: "/reports", label: "Reports", icon: BarChart3, hint: "Spending, net worth, health", section: "reports" },
      ],
    },
    {
      title: "Data",
      tiles: [
        { href: "/settings?tab=data", label: "Import & export", icon: FileUp, hint: "CSV, Excel, backup" },
        ...(BMC_URL ? [{ href: "/support", label: `Support ${APP_NAME}`, icon: Coffee, hint: "Buy the developer a coffee" }] : []),
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => {
        const tiles = g.tiles.filter((t) => !t.section || !hidden.isHidden(t.section));
        if (!tiles.length) return null;
        return (
          <section key={g.title} aria-label={g.title}>
            <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wide text-ink-3">{g.title}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {tiles.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className="group flex min-h-24 flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong"
                >
                  <t.icon className="h-5 w-5 text-brand" aria-hidden />
                  <span>
                    <span className="block text-[15px] font-semibold">{t.label}</span>
                    <span className="block text-[12.5px] text-ink-3">{t.hint}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
