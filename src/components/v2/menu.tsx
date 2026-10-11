"use client";

import { Bell, Briefcase, CalendarDays, CheckSquare, HelpCircle, LayoutGrid, PiggyBank, Search, Settings, Sparkles, StickyNote, Heart } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { addDays } from "@/lib/dates";
import { agenda } from "@/lib/engine/life";
import { useAppVersion } from "@/lib/app-version";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useUI } from "@/lib/ui";
import { useRouter } from "next/navigation";
import { V2PageHeader } from "./ui";

type Tile = { href?: string; onClick?: () => void; label: string; icon: typeof Bell; hint: ReactNode };

export function MenuScreen() {
  const { ds, today, month, goals, ctx } = useFinance();
  const { setVersion } = useAppVersion();
  const router = useRouter();
  const open = ds.life_items.filter((i) => i.status === "open");
  const ag = agenda(open.filter((i) => i.kind === "task" || i.kind === "checklist"), today);
  const remindersSoon = open.filter((i) => i.kind === "reminder" && i.due_date && i.due_date <= addDays(today, 7)).length;
  const incomeCount = ds.recurring_rules.filter((r) => r.kind === "income" && r.active).length;
  const budgetLeft = Math.max(0, month.budgetLimit - month.budgetSpent);
  const activeGoals = goals.filter((g) => g.status !== "done").length;
  const n = (k: string, c: number, none: string) => (c ? `${c} ${k}${c === 1 ? "" : "s"}` : none);

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: "Money plans",
      tiles: [
        { href: "/menu/income", label: "My jobs & income", icon: Briefcase, hint: n("source", incomeCount, "Add your salary") },
        { href: "/menu/budgets", label: "Budgets & spending plans", icon: PiggyBank, hint: month.budgetLimit ? `${formatMoney(budgetLeft, ctx)} left this month` : "Set a monthly limit" },
        { href: "/menu/calendar", label: "Calendar", icon: CalendarDays, hint: `${month.unpaid.length} payment${month.unpaid.length === 1 ? "" : "s"} left this month` },
        { href: "/menu/future", label: "Future", icon: Sparkles, hint: activeGoals ? `${activeGoals} goal${activeGoals === 1 ? "" : "s"} · Can I afford it?` : "Your money on any date" },
      ],
    },
    {
      title: "App",
      tiles: [
        { href: "/menu/settings", label: "Settings", icon: Settings, hint: "Profile, import & export, security, look" },
        { href: "/menu/help", label: "Help & support", icon: HelpCircle, hint: "Questions and answers" },
        {
          onClick: async () => {
            await setVersion(1);
            router.push("/");
          },
          label: "Version 1 (all tools)",
          icon: LayoutGrid,
          hint: "Reports, what-if and every screen",
        },
      ],
    },
  ];

  const cls = "group flex min-h-24 flex-col justify-between gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong";
  return (
    <>
      <V2PageHeader title="Menu" meaning="Planning tools and settings" />
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
      <button type="button" onClick={() => useUI.getState().setPalette(true)} className="mt-6 flex w-full items-center gap-2 rounded-2xl border border-dashed border-line-strong p-4 text-left text-[14px] text-ink-2">
        <Search className="h-4 w-4" aria-hidden /> Search everything — accounts, cards, loans, notes, entries
      </button>
    </>
  );
}
