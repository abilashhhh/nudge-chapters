"use client";

import { BarChart3, CalendarDays, Coffee, FileUp, Heart, Landmark, Settings, Sparkles, TrendingUp, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { APP_NAME, BMC_URL } from "@/lib/config";
import { useFinance } from "@/lib/finance";
import { useUI } from "@/lib/ui";

export default function MorePage() {
  const { positions, month } = useFinance();
  const tiles = [
    { href: "/cash-flow", label: "Cash flow", icon: Wallet, hint: "Bills, budgets, transactions" },
    { href: "/assets", label: "Assets", icon: TrendingUp, hint: "Accounts and investments" },
    { href: "/liabilities", label: "Liabilities", icon: Landmark, hint: "Cards, loans, chits" },
    { href: "/plan?tab=wishlist", label: "Wishlist", icon: Heart, hint: "Buy, wait or save first" },
    { href: "/projection", label: "Future", icon: Sparkles, hint: "Project any date" },
    { href: "/calendar", label: "Calendar", icon: CalendarDays, hint: `${month.unpaid.length} bills left this month` },
    { href: "/reports", label: "Reports", icon: BarChart3, hint: "Spending, net worth, health" },
    { href: "/assets?tab=lending", label: "Lending", icon: Users, hint: <Money value={positions.totals.receivables} /> },
    { href: "/settings?tab=data", label: "Import & export", icon: FileUp, hint: "CSV, Excel, backup" },
    { href: "/settings", label: "Settings", icon: Settings, hint: "Profile, alerts, security" },
    ...(BMC_URL ? [{ href: "/support", label: `Support ${APP_NAME}`, icon: Coffee, hint: "Buy the developer a coffee" }] : []),
  ];
  return (
    <>
      <PageHeader title="More" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
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
