"use client";

import {
  Bell, Eye, EyeOff, Home, LogOut, Moon, Plus, Search, Sun, 
  TrendingUp, Wallet, Menu as MenuIcon, Receipt, CalendarCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { APP_NAME, BMC_URL } from "@/lib/config";
import { Brand } from "../brand";
import { useFinance } from "@/lib/finance";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";

import { AppLock } from "./app-lock";
import { Editors } from "../editors";
import { ChitInstallmentsSheet } from "../chits";
import { AlarmWatcher } from "../alarm";
import { InsuranceReminderSync } from "../insurance/actions";
import { PriceRefresher } from "../price-refresher";
import { RhythmReminders } from "../rhythm/reminders";
import { ViewportFix } from "./viewport-fix";
import { LifeEditorSheet } from "../life";
import { EventSheet } from "../event-sheet";
import { ExplainSheet } from "../explain";
import { BmcFloating, SupportNavLink } from "../support";
import { QuickAddSheet, TransactionSheet } from "../transaction-form";
import { AlertsPanel } from "./alerts-panel";
import { setLocalMode } from "./bootstrap";
import { CommandPalette } from "./command-palette";


import { V2_NAV, isActiveV2, toV2Href, v2Title } from "@/lib/v2/routes";
import { V2QuickAddSheet } from "../v2/quick-add";
import { SmsSync } from "../v2/sms";
import { useGridRange } from "../v2/month-grid";
import { closeAllSheets } from "../ui/sheet";
import { useMonth } from "../ui/month-picker";

/** Version 2: the same five entries on the phone bottom bar and the desktop sidebar. */
const V2_ICONS: Record<string, typeof Home> = { "/": Home, "/my-money": Wallet, "/to-pay": Receipt, "/trading": TrendingUp, "/daily": CalendarCheck, "/menu": MenuIcon };


export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  // Every page opens on the current month (month tables open on the first month that still has something to pay).
  useEffect(() => {
    useMonth.getState().set(null);
    useGridRange.getState().setOffset(0);
    useGridRange.getState().setListMonth(null);
  }, [pathname]);
  const router = useRouter();
  const { alerts, ds } = useFinance();
  const repo = useStore((s) => s.repo);
  const updatePrefs = useStore((s) => s.updatePrefs);
  const masked = !!ds.profile.preferences?.maskValues;
  const critical = alerts.filter((a) => a.priority === "critical" || a.priority === "high").length;
  const ui = useUI();
  const visual = ds.profile.preferences?.visual;
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.motion = visual?.motion ?? "full";
    r.dataset.celebrate = visual?.celebrations === false ? "off" : "on";
  }, [visual?.motion, visual?.celebrations]);
  // One version of the app: the five sections. Old (Version 1) addresses go to their new place, so bookmarks,
  // alarms and links in shared sheets keep working.
  const v2 = true;
  const simple = true;
  const fullNav = false;
  useEffect(() => {
    const target = toV2Href(pathname, typeof window !== "undefined" ? window.location.search : "");
    if (target) router.replace(target);
  }, [pathname, router]);
  // Full-width pages (sheets) stop above the phone's bottom bar, so you can still switch sections.
  useEffect(() => {
    document.documentElement.dataset.bottomBar = "";
    return () => {
      delete document.documentElement.dataset.bottomBar;
    };
  }, []);
  const sideNav = V2_NAV.map((n) => ({ href: n.href, label: n.label, icon: V2_ICONS[n.href] }));
  const sideNavGroups = [{ title: null as string | null, items: sideNav }];
  const mobileNav = sideNav.filter((n) => !V2_NAV.find((v) => v.href === n.href)?.desktopOnly);

  // Long sidebar on a short screen: keep the current page's item in view.
  // (A callback ref too, because the sidebar can mount after this effect — e.g. once the app lock opens.)
  const navEl = useRef<HTMLElement | null>(null);
  const showActive = (n: HTMLElement | null) => n?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  const sideRef = useCallback((n: HTMLElement | null) => {
    navEl.current = n;
    showActive(n);
  }, []);
  useEffect(() => {
    showActive(navEl.current);
  }, [pathname, v2, simple]);

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

  const title = v2Title(pathname) ?? APP_NAME;

  // overflow-x-clip: nothing inside can ever widen the page sideways on phones (sticky headers still work).
  return (
    <AppLock>
    <div className="min-h-dvh overflow-x-clip">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface py-5 lg:flex">
        <Link href="/" onClick={closeAllSheets} className="mb-5 shrink-0 px-6" aria-label={`${APP_NAME} home`}>
          <Brand size="md" />
        </Link>
        {/* The list scrolls on short screens; the bottom links stay put. */}
        <nav ref={sideRef} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin]" aria-label="Main">
          {(fullNav ? sideNavGroups : [{ title: null, items: sideNav }]).map((g, gi) => (
            <div key={gi} className={cn("flex flex-col gap-0.5", gi > 0 && fullNav && "mt-3")}>
              {g.title && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{g.title}</p>}
          {g.items.map((n) => {
            // In the Simple look, "Menu" stays lit on any section it leads to.
            const active = isActiveV2(pathname, n.href);
            const link = (
              <Link
                key={n.href}
                href={n.href}
                onClick={closeAllSheets}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-xl px-3 transition-colors",
                  fullNav ? "py-1.5 text-[14px]" : "py-2 text-[14.5px]",
                  active ? "bg-inverse text-on-inverse" : "text-ink-2 hover:bg-surface-3/70 hover:text-ink",
                )}
              >
                <n.icon className="h-[18px] w-[18px]" aria-hidden />
                {n.label}
              </Link>
            );
            return link;
          })}
            </div>
          ))}
        </nav>
        <div className="mx-3 mt-3 flex shrink-0 flex-col gap-0.5 border-t border-line pt-3">
          {BMC_URL && <SupportNavLink />}
          <button type="button" onClick={signOut} className={cn("flex items-center gap-3 rounded-xl px-3 text-left text-[14px] text-ink-2 hover:bg-surface-3/70 hover:text-ink", fullNav ? "py-1.5" : "py-2")}>
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
            <Link href="/" onClick={closeAllSheets} className="min-w-0 lg:hidden" aria-label={`${APP_NAME} home`}>
              <Brand size="sm" />
            </Link>
            {!v2 && <span className="hidden text-[15px] font-semibold text-ink lg:inline">{title}</span>}
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
                className={cn("hidden h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3", (!simple || v2) && "sm:inline-flex")}
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

        <main className="mx-auto max-w-[1240px] px-4 pb-32 pt-4 sm:px-6 sm:pt-6 lg:pb-16">
          {children}
        </main>
      </div>

      {/* Global add button (not over Trading Training, Paper Trading or Passwords, which have their own controls there) */}
      {!isActiveV2(pathname, "/trading/training") && !isActiveV2(pathname, "/trading/paper") && !isActiveV2(pathname, "/menu/vault") && <button
        type="button"
        onClick={() => ui.openQuick()}
        aria-label="Quick add"
        className="vv-pin no-print fixed bottom-[calc(80px+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand text-on-brand shadow-panel transition-transform hover:scale-105 lg:bottom-8 lg:right-8 lg:h-auto lg:w-auto lg:gap-2 lg:rounded-xl lg:px-5 lg:py-3"
      >
        <Plus className="h-5 w-5" aria-hidden />
        <span className="hidden text-[14.5px] font-semibold lg:inline">Add</span>
      </button>}

      {/* Mobile bottom navigation */}
      <nav className="vv-pin no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden" aria-label="Main">
        <div className={cn("mx-auto grid max-w-lg", mobileNav.length >= 6 ? "grid-cols-6" : mobileNav.length === 5 ? "grid-cols-5" : mobileNav.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {mobileNav.map((n) => {
            // Sections left off the bar are opened from Menu, so Menu stays lit there.
            const active = isActiveV2(pathname, n.href) || (n.href === "/menu" && V2_NAV.some((v) => v.desktopOnly && isActiveV2(pathname, v.href)));
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={closeAllSheets}
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

      <BmcFloating hidden={simple || v2} />
      {v2 ? <V2QuickAddSheet /> : <QuickAddSheet />}
      <TransactionSheet />
      <EventSheet />
      <SmsSync />
      <ChitInstallmentsSheet />
      <LifeEditorSheet />
      <AlarmWatcher />
      <InsuranceReminderSync />
      <PriceRefresher />
      <RhythmReminders />
      <ViewportFix />
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
