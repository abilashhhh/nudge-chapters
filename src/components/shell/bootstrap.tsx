"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { todayISO } from "@/lib/dates";
import { computePositions } from "@/lib/engine/ledger";
import { LocalRepo } from "@/lib/data/localRepo";
import { getSupabase, supabaseConfigured } from "@/lib/data/supabase";
import { SupabaseRepo } from "@/lib/data/supabaseRepo";
import { newId } from "@/lib/data/repo";
import { useStore } from "@/lib/store";
import { IS_DEV } from "@/lib/config";
import { Brand } from "../brand";
import { Button } from "../ui/button";

export const MODE_KEY = "nudge:mode";

export function getLocalMode(): string | null {
  try {
    return localStorage.getItem(MODE_KEY);
  } catch {
    return null;
  }
}

export function setLocalMode(mode: "local" | null) {
  try {
    if (mode) localStorage.setItem(MODE_KEY, mode);
    else localStorage.removeItem(MODE_KEY);
  } catch {
    /* ignore */
  }
}

/** Chooses the storage backend (Supabase session or local device), loads data, and routes to login/onboarding. */
export function Bootstrap({ children, requireOnboarded = true }: { children: ReactNode; requireOnboarded?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const repo = useStore((s) => s.repo);
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const ds = useStore((s) => s.ds);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || useStore.getState().repo) return;
    started.current = true;
    const { setRepo, load } = useStore.getState();
    const local = getLocalMode() === "local";
    if (local || !supabaseConfigured) {
      if (!local && !LocalRepo.hasData()) {
        router.replace(!pathname || pathname === "/" ? "/welcome" : "/login");
        return;
      }
      setRepo(new LocalRepo("existing"));
      void load();
      return;
    }
    const sb = getSupabase();
    void (async () => {
      const { data } = await sb.auth.getSession();
      const session = data.session;
      if (!session) {
        // Signed-out visitors (and search engines) arriving at the home page get the public landing page.
        router.replace(!pathname || pathname === "/" ? "/welcome" : `/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      const aal = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data && aal.data.nextLevel === "aal2" && aal.data.currentLevel !== "aal2") {
        router.replace("/login?mfa=1");
        return;
      }
      setRepo(new SupabaseRepo(sb, session.user.id, session.user.email));
      void load();
    })();
    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        useStore.getState().setRepo(null);
        router.replace("/login");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, pathname]);

  // Refresh when the tab comes back into focus (keeps phone and laptop in sync).
  useEffect(() => {
    if (!repo || repo.kind !== "supabase") return;
    let last = Date.now();
    const onVis = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 60_000) {
        last = Date.now();
        void useStore.getState().load();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [repo]);

  // Onboarding gate
  useEffect(() => {
    if (status !== "ready" || !ds) return;
    if (requireOnboarded && !ds.profile.onboarding_done) router.replace("/onboarding");
  }, [status, ds, requireOnboarded, router]);

  // Record today's net worth once per day (history for the net-worth chart).
  const snapped = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "ready" || !ds || !repo || !ds.profile.onboarding_done) return;
    const today = todayISO(ds.profile.timezone);
    if (snapped.current === today) return;
    snapped.current = today;
    const t = computePositions(ds, today).totals;
    const snap = {
      id: newId(),
      date: today,
      cash: t.allAccounts,
      investments: t.investments,
      other_assets: t.physical + t.receivables + t.chitAssets,
      liabilities: t.totalLiabilities,
      net_worth: t.netWorth,
      breakdown: { cards: t.cardDebt, loans: t.loanDebt, borrowed: t.borrowed, chits: t.chitLiability, retirement: t.retirement },
    };
    const existing = ds.net_worth_snapshots.find((s) => s.date === today);
    if (existing && Math.abs(existing.net_worth - snap.net_worth) < 1) return;
    repo
      .upsertSnapshot(snap)
      .then(() => {
        const cur = useStore.getState().ds;
        if (!cur) return;
        const others = cur.net_worth_snapshots.filter((s) => s.date !== today);
        useStore.setState({ ds: { ...cur, net_worth_snapshots: [...others, { ...existing, ...snap, id: existing?.id ?? snap.id }] } });
      })
      .catch(() => undefined);
  }, [status, ds, repo]);

  if (status === "error") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="display text-2xl font-semibold">Unable to load your information right now</h1>
        <p className="text-ink-2">{error}</p>
        {IS_DEV && <p className="text-[13px] text-ink-3">Developer note: if you just set up Supabase, check the tables exist (see README).</p>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => useStore.getState().load()}>
            Try again
          </Button>
          <Button
            onClick={async () => {
              await useStore.getState().repo?.signOut();
              setLocalMode(null);
              useStore.getState().setRepo(null);
              router.replace("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  if (status !== "ready" || !ds || (requireOnboarded && !ds.profile.onboarding_done)) {
    return <LoadingScreen />;
  }
  return <>{children}</>;
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <Brand size="lg" />
        <div className="h-1 w-28 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full w-1/3 animate-[loading_1.1s_ease-in-out_infinite] rounded-full bg-future" />
        </div>
        <span className="sr-only">Loading your finances</span>
      </div>
      <style>{`@keyframes loading{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
