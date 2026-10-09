"use client";

import { BarChart3, CalendarDays, Coffee, FileUp, Heart, Landmark, PiggyBank, Settings, Sparkles, Target, TrendingUp, Users, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { useHidden } from "@/lib/visual";
import Link from "next/link";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { APP_NAME, BMC_URL } from "@/lib/config";
import { useFinance } from "@/lib/finance";
import { useUI } from "@/lib/ui";

export default function MorePage() {
  const { positions, month, ctx } = useFinance();
  const hidden = useHidden();
  const tiles = [
    { href: "/cash-flow", label: "Cash flow", icon: Wallet, hint: "Bills, budgets, transactions", section: "transactions" },
    { href: "/assets", label: "Assets", icon: TrendingUp, hint: "Accounts and investments" },
    { href: "/liabilities", label: "Liabilities", icon: Landmark, hint: "Cards, loans, chits" },
    { href: "/plan?tab=wishlist", label: "Wishlist", icon: Heart, hint: "Buy, wait or save first" },
    { href: "/projection", label: "Future", icon: Sparkles, hint: "Project any date", section: "projections" },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, hint: `${month.unpaid.length} bills left this month` },
    { href: "/reports", label: "Reports", icon: BarChart3, hint: "Spending, net worth, health" },
    { href: "/budgets", label: "Budgets", icon: PiggyBank, hint: `${formatMoney(Math.max(0, month.budgetLimit - month.budgetSpent), ctx)} left this month`, section: "budgets" },
    { href: "/owed", label: "Owed to you", icon: Users, hint: <Money value={positions.totals.receivables} />, section: "reimbursements" },
    { href: "/goals", label: "Chapters", icon: Target, hint: "Goals and the plan to fund them", section: "goals" },
    { href: "/settings?tab=data", label: "Import & export", icon: FileUp, hint: "CSV, Excel, backup" },
    { href: "/settings", label: "Settings", icon: Settings, hint: "Profile, alerts, security" },
    ...(BMC_URL ? [{ href: "/support", label: `Support ${APP_NAME}`, icon: Coffee, hint: "Buy the developer a coffee" }] : []),
  ];
  return (
    <>
      <PageHeader title="More" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.filter((t) => !("section" in t) || !hidden.isHidden(String((t as { section?: string }).section))).map((t) => (
          <Link key={t.href} href={t.href} className="flex min-h-28 flex-col justify-between rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
            <t.icon className="h-6 w-6 text-brand" aria-hidden />
            <span>
              <span className="block text-[15px] font-semibold">{t.label}</span>
              <span className="block text-[12.5px] text-ink-3">{t.hint}</span>
            </span>
          </Link>
        ))}
      </div>
      <button type="button" onClick={() => useUI.getState().setPalette(true)} className="mt-4 w-full rounded-2xl border border-dashed border-line-strong p-4 text-left text-[14px] text-ink-2">
        Search everything, or ask &ldquo;how much will I have by March 2028?&rdquo;
      </button>
    </>
  );
}
