"use client";

import { Fingerprint, Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { checkPin, readLock, verifyBiometric, writeLock, type LockConfig } from "@/lib/lock";
import { useStore } from "@/lib/store";
import { Brand } from "../brand";
import { Button } from "../ui/button";

/** Hides the app behind a PIN / biometric screen when App lock is on. Locks on open and after inactivity. */
export function AppLock({ children }: { children: ReactNode }) {
  const [cfg, setCfg] = useState<LockConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const last = useRef(Date.now());
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const load = () => {
      const c = readLock();
      setCfg(c);
      return c;
    };
    const c = load();
    setLocked(!!c);
    setReady(true);
    const onChange = () => load();
    window.addEventListener("nudge:lock-changed", onChange);
    return () => window.removeEventListener("nudge:lock-changed", onChange);
  }, []);

  useEffect(() => {
    if (!cfg) return;
    const bump = () => (last.current = Date.now());
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const limit = Math.max(0, cfg.autoLockMin) * 60_000;
    const timer = window.setInterval(() => {
      if (limit > 0 && Date.now() - last.current > limit) setLocked(true);
    }, 5_000);
    const onVis = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else if (hiddenAt.current != null) {
        if (Date.now() - hiddenAt.current >= limit) setLocked(true);
        hiddenAt.current = null;
        last.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [cfg]);

  if (!ready) return null;
  if (cfg && locked)
    return (
      <LockScreen
        cfg={cfg}
        onUnlock={() => {
          last.current = Date.now();
          setLocked(false);
        }}
      />
    );
  return <>{children}</>;
}

function LockScreen({ cfg, onUnlock }: { cfg: LockConfig; onUnlock: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [fails, setFails] = useState(0);
  const [until, setUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const tried = useRef(false);

  const bio = useCallback(async () => {
    if (!cfg.credId) return;
    if (await verifyBiometric(cfg.credId)) onUnlock();
    else setErr("Couldn't verify — use your PIN.");
  }, [cfg.credId, onUnlock]);

  useEffect(() => {
    if (cfg.credId && !tried.current) {
      tried.current = true;
      void bio();
    }
  }, [cfg.credId, bio]);

  const submit = async (value: string) => {
    if (Date.now() < until || busy) return;
    setBusy(true);
    const ok = await checkPin(value, cfg);
    setBusy(false);
    if (ok) return onUnlock();
    const n = fails + 1;
    setFails(n);
    setPin("");
    if (n >= 5) {
      setUntil(Date.now() + 30_000);
      setErr("Too many tries. Wait 30 seconds.");
    } else setErr("Wrong PIN. Try again.");
  };

  const press = (d: string) => {
    if (Date.now() < until) return;
    setErr(null);
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length >= 4) {
      // Try as soon as 4+ digits are in; a wrong partial entry doesn't count as a failed attempt.
      void checkPin(next, cfg).then((ok) => ok && onUnlock());
    }
  };

  const forgot = async () => {
    writeLock(null);
    await useStore.getState().repo?.signOut();
    window.location.reload();
  };

  return (
    <div className="anim-fade fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-paper px-6">
      <Brand size="md" />
      <div className="flex flex-col items-center gap-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-3">
          <Lock className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-[15px] font-semibold">Enter your PIN</p>
        <div className="flex gap-2" aria-label={`${pin.length} digits entered`}>
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span key={i} className={`h-3 w-3 rounded-full transition-colors ${i < pin.length ? "bg-ink" : "bg-line-strong"}`} />
          ))}
        </div>
        <p className="h-5 text-[13px] text-danger" role="alert">
          {err}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="h-16 w-16 rounded-full bg-surface text-[22px] font-semibold shadow-sm transition-transform active:scale-95">
            {d}
          </button>
        ))}
        <button type="button" onClick={() => setPin(pin.slice(0, -1))} className="h-16 w-16 rounded-full text-[13px] text-ink-2">
          Delete
        </button>
        <button type="button" onClick={() => press("0")} className="h-16 w-16 rounded-full bg-surface text-[22px] font-semibold shadow-sm transition-transform active:scale-95">
          0
        </button>
        <button type="button" disabled={pin.length < 4 || busy} onClick={() => submit(pin)} className="h-16 w-16 rounded-full text-[13px] font-semibold text-brand-ink disabled:opacity-40">
          OK
        </button>
      </div>
      {cfg.credId && (
        <Button icon={<Fingerprint className="h-4 w-4" />} onClick={bio}>
          Use Face ID / fingerprint
        </Button>
      )}
      <button type="button" className="text-[12.5px] text-ink-3 underline" onClick={forgot}>
        Forgot PIN? Sign out and reset the lock
      </button>
    </div>
  );
}
