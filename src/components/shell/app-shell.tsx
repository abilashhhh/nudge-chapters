"use client";

import {
  BarChart3, Bell, CalendarDays, Eye, EyeOff, Home, Landmark, LayoutGrid, LogOut, Moon, Plus, Search, Settings, Sparkles, Sun, Target,
  TrendingUp, Wallet, ListChecks, PieChart, PiggyBank, HandCoins,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { APP_NAME, BMC_URL } from "@/lib/config";
import { Brand } from "../brand";
import { useFinance } from "@/lib/finance";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { useHidden } from "@/lib/visual";
import { AppLock } from "./app-lock";
import { Editors } from "../editors";
import { ChitInstallmentsSheet } from "../chits";
import { AlarmWatcher } from "../alarm";
import { LifeEditorSheet } from "../life";
import { EventSheet } from "../event-sheet";
import { ExplainSheet } from "../explain";
import { BmcFloating, SupportNavLink } from "../support";
import { QuickAddSheet, TransactionSheet } from "../transaction-form";
import { AlertsPanel } from "./alerts-panel";
import { setLocalMode } from "./bootstrap";
import { CommandPalette } from "./command-palette";
import { useViewMode } from "@/lib/view-mode";

/** `section` is the id used by Settings → Sections to hide an entry (data and calculations are unaffected). */
export const NAV: { href: string; label: string; icon: typeof Home; section?: string }[] = [
  { href: "/", label: "Today", icon: Home },
  { href: "/plan", label: "Plan", icon: ListChecks, section: "tasks" },
  { href: "/goals", label: "Chapters", icon: Target, section: "goals" },
  { href: "/money", label: "Money", icon: PieChart, section: "dashboard" },
  { href: "/cash-flow", label: "Cash flow", icon: Wallet, section: "transactions" },
  { href: "/budgets", label: "Budgets", icon: PiggyBank, section: "budgets" },
  { href: "/owed", label: "Owed to you", icon: HandCoins, section: "reimbursements" },
  { href: "/assets", label: "Assets", icon: TrendingUp, section: "investments" },
  { href: "/liabilities", label: "Liabilities", icon: Landmark, section: "credit_cards" },
  { href: "/projection", label: "Future", icon: Sparkles, section: "projections" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, section: "bills" },
  { href: "/reports", label: "Reports", icon: BarChart3, section: "reports" },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Menu entries kept in the Simple look. */
const SIMPLE_NAV = ["/", "/plan", "/goals"];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { alerts, ds } = useFinance();
  const repo = useStore((s) => s.repo);
  const updatePrefs = useStore((s) => s.updatePrefs);
  const masked = !!ds.profile.preferences?.maskValues;
  const critical = alerts.filter((a) => a.priority === "critical" || a.priority === "high").length;
  const ui = useUI();
  const hidden = useHidden();
  const nav = NAV.filter((n) => !n.section || !hidden.isHidden(n.section));
  const visual = ds.profile.preferences?.visual;
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.motion = visual?.motion ?? "full";
    r.dataset.celebrate = visual?.celebrations === false ? "off" : "on";
  }, [visual?.motion, visual?.celebrations]);
  const { simple } = useViewMode();
  // Simple look: just the essentials in the menu. Every other section lives in Settings → All sections.
  const sideNav = simple
    ? [...nav.filter((n) => SIMPLE_NAV.includes(n.href)).map((n) => (n.href === "/" ? { ...n, label: "Home" } : n)), { href: "/more", label: "Menu", icon: LayoutGrid }]
    : nav;
  const mobileNav = simple ? sideNav : [...nav.slice(0, 4), { href: "/more", label: "More", icon: LayoutGrid }];
  const mobileMain = mobileNav.filter((n) => n.href !== "/more");

  // Keyboard: Ctrl/Cmd+K or / = search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useUI.getState().setPalette(true);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "/") {
        e.preventDefault();
        useUI.getState().setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setTheme = (t: "light" | "dark") => {
    try {
      localStorage.setItem("nudge:theme", t);
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = t;
    void updatePrefs({ theme: t });
  };
  const currentDark = typeof document !== "undefined" && (document.documentElement.dataset.theme === "dark" || (!document.documentElement.dataset.theme && window.matchMedia?.("(prefers-color-scheme: dark)").matches));

  const signOut = async () => {
    await repo?.signOut();
    setLocalMode(null);
    useStore.getState().setRepo(null);
    router.replace("/login");
  };

  const title = NAV.find((n) => isActive(pathname, n.href))?.label ?? (pathname.startsWith("/more") ? (simple ? "Menu" : "All sections") : pathname.startsWith("/support") ? "Support" : APP_NAME);

  return (
    <AppLock>
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <Link href="/" className="mb-6 px-3" aria-label={`${APP_NAME} home`}>
          <Brand size="md" />
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
          {sideNav.map((n) => {
            // In the Simple look, "Menu" stays lit on any section it leads to.
            const active = simple && n.href === "/more" ? !mobileMain.some((m) => isActive(pathname, m.href)) : isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-[14.5px] transition-colors",
                  active ? "bg-ink text-paper" : "text-ink-2 hover:bg-surface-3/70 hover:text-ink",
                )}
              >
                <n.icon className="h-[18px] w-[18px]" aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 flex flex-col gap-0.5 border-t border-line pt-4">
          {BMC_URL && <SupportNavLink />}
          <button type="button" onClick={signOut} className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-[14px] text-ink-2 hover:bg-surface-3/70 hover:text-ink">
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
            {repo?.kind === "local" ? "Leave demo" : "Sign out"}
          </button>
          <p className="truncate px-3 pt-2 text-[12px] text-ink-3">{repo?.kind === "local" ? "Stored on this device only" : repo?.userEmail}</p>
        </div>
      </aside>

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="no-print sticky top-0 z-20 border-b border-line/70 bg-paper/85 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-[1240px] items-center gap-1 px-4 sm:gap-2 sm:px-6">
            <Link href="/" className="min-w-0 lg:hidden" aria-label={`${APP_NAME} home`}>
              <Brand size="sm" />
            </Link>
            <span className="hidden text-[15px] font-semibold text-ink lg:inline">{title}</span>
            {!simple && <button
              type="button"
              onClick={() => ui.setPalette(true)}
              className="ml-auto hidden h-9 w-72 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-left text-[13.5px] text-ink-3 hover:border-line-strong md:flex"
            >
              <Search className="h-4 w-4" aria-hidden />
              Search or jump to…
            </button>}
            <div className={cn("ml-auto flex items-center", !simple && "md:ml-2")}>
              <button type="button" aria-label="Search" onClick={() => ui.setPalette(true)} className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3", !simple && "md:hidden")}>
                <Search className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label={masked ? "Show amounts" : "Hide amounts"}
                title={masked ? "Show amounts" : "Hide amounts"}
                onClick={() => updatePrefs({ maskValues: !masked })}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3"
              >
                {masked ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
              <button
                type="button"
                aria-label={currentDark ? "Switch to light theme" : "Switch to dark theme"}
                onClick={() => setTheme(currentDark ? "light" : "dark")}
                className={cn("hidden h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3", !simple && "sm:inline-flex")}
              >
                {currentDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button
                type="button"
                aria-label={`Alerts${alerts.length ? ` (${alerts.length})` : ""}`}
                onClick={() => ui.setAlerts(true)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3"
              >
                <Bell className="h-5 w-5" />
                {alerts.length > 0 && (
                  <span
                    className={cn(
                      "num absolute right-1 top-1 min-w-[18px] rounded-full px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white",
                      critical ? "bg-danger" : "bg-ink-3",
                    )}
                  >
                    {alerts.length > 9 ? "9+" : alerts.length}
                  </span>
                )}
              </button>
              {repo?.kind === "local" && !simple && (
                <span className="ml-1 hidden rounded-full bg-future-soft px-2.5 py-1 text-[12px] font-medium text-future-ink sm:inline">Demo · this device</span>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1240px] px-4 pb-32 pt-4 sm:px-6 sm:pt-6 lg:pb-16">{children}</main>
      </div>

      {/* Global add button */}
      <button
        type="button"
        onClick={() => ui.openQuick()}
        aria-label="Quick add"
        className="no-print fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-panel transition-transform hover:scale-105 lg:bottom-8 lg:right-8 lg:h-auto lg:w-auto lg:gap-2 lg:rounded-xl lg:px-5 lg:py-3"
      >
        <Plus className="h-5 w-5" aria-hidden />
        <span className="hidden text-[14.5px] font-semibold lg:inline">Add</span>
      </button>

      {/* Mobile bottom navigation */}
      <nav className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden" aria-label="Main">
        <div className={cn("mx-auto grid max-w-lg", mobileNav.length >= 5 ? "grid-cols-5" : mobileNav.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {mobileNav.map((n) => {
            const active = n.href === "/more" ? !mobileMain.some((m) => isActive(pathname, m.href)) : isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-medium", active ? "text-ink" : "text-ink-3")}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-surface-3")}>
                  <n.icon className="h-[20px] w-[20px]" aria-hidden />
                </span>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <BmcFloating hidden={simple} />
      <QuickAddSheet />
      <TransactionSheet />
      <EventSheet />
      <ChitInstallmentsSheet />
      <LifeEditorSheet />
      <AlarmWatcher />
      <Editors />
      <CommandPalette />
      <AlertsPanel />
      <ExplainSheet />
    </div>
    </AppLock>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="display text-[28px] font-semibold leading-tight sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[14px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
