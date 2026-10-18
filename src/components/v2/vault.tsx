"use client";

import {
  AlertTriangle, ArrowLeft, Check, Copy, CreditCard, Eye, EyeOff, ExternalLink, KeyRound, Lock, LockKeyhole, Pencil, Plus, RefreshCw, Search, ShieldCheck, Star, StickyNote, Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { generatePassword, strength } from "@/lib/vault/crypto";
import { HIDDEN_LOCK_MS, IDLE_LOCK_MS, useVault, type VaultEntry, type VaultItem, type VaultKind } from "@/lib/vault/store";
import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/form";
import { EmptyState } from "../ui/misc";
import { ConfirmSheet } from "../ui/sheet";
import { V2PageHeader } from "./ui";

const KIND: Record<VaultKind, { label: string; icon: typeof KeyRound }> = {
  login: { label: "Login", icon: KeyRound },
  card: { label: "Card", icon: CreditCard },
  note: { label: "Secure note", icon: StickyNote },
};

const STRENGTH_CLS = ["bg-danger", "bg-danger", "bg-warn", "bg-ok", "bg-ok"];
const STRENGTH_TEXT = ["text-danger", "text-danger", "text-warn", "text-ok", "text-ok"];

/** Copy, then clear the clipboard after 30 s (if it still holds what we put there). */
async function copySecret(value: string, what: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${what} copied — clears in 30 seconds`);
    window.setTimeout(async () => {
      try {
        const now = await navigator.clipboard.readText().catch(() => value);
        if (now === value) await navigator.clipboard.writeText("");
      } catch {
        /* the page may be in the background; nothing more we can do */
      }
    }, 30_000);
  } catch {
    toast.error("Couldn't copy — your browser blocked the clipboard");
  }
}

function StrengthBar({ password }: { password: string }) {
  const s = strength(password);
  if (!password) return null;
  return (
    <div className="mt-1.5">
      <div className="flex gap-1" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < Math.max(1, s.score) ? STRENGTH_CLS[s.score] : "bg-surface-3")} />
        ))}
      </div>
      <p className={cn("mt-1 text-[12px] font-medium", STRENGTH_TEXT[s.score])}>
        {s.label}
        {s.hint ? <span className="font-normal text-ink-3"> · {s.hint}</span> : null}
      </p>
    </div>
  );
}

function SecretInput({ id, value, onChange, placeholder, autoFocus, autoComplete = "off", onEnter }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; autoComplete?: string; onEnter?: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="h-11 pr-11 font-mono"
      />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide" : "Show"} className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-3 hover:text-ink">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function VaultScreen() {
  const status = useVault((s) => s.status);
  const error = useVault((s) => s.error);
  const lock = useVault((s) => s.lock);

  useEffect(() => {
    void useVault.getState().load();
  }, []);

  // Auto-lock: idle for 5 minutes, in the background for a minute, or leaving this page.
  useEffect(() => {
    if (status !== "unlocked") return;
    let idle = window.setTimeout(lock, IDLE_LOCK_MS);
    let hiddenAt = 0;
    const bump = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(lock, IDLE_LOCK_MS);
    };
    const vis = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > HIDDEN_LOCK_MS) lock();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearTimeout(idle);
      events.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", vis);
    };
  }, [status, lock]);
  useEffect(() => {
    return () => useVault.getState().lock();
  }, []);

  return (
    <>
      <V2PageHeader
        title="Passwords"
        actions={
          status === "unlocked" ? (
            <Button icon={<Lock className="h-4 w-4" />} onClick={lock}>
              Lock
            </Button>
          ) : undefined
        }
      />
      {status === "loading" && <div className="skeleton-shimmer mx-auto h-64 max-w-md rounded-2xl" />}
      {status === "error" && (
        <div className="mx-auto max-w-md rounded-2xl border border-warn/40 bg-warn-soft p-5 text-[14px]" role="alert">
          <p className="font-semibold">The vault couldn&apos;t open</p>
          <p className="mt-1 text-ink-2">{error}</p>
          <Button className="mt-3" onClick={() => void useVault.getState().load()}>Try again</Button>
        </div>
      )}
      {status === "none" && <SetupVault />}
      {status === "locked" && <UnlockVault />}
      {status === "unlocked" && <VaultHome />}
    </>
  );
}

function SecurityPoints() {
  const where = useVault((s) => s.where);
  return (
    <ul className="flex flex-col gap-2 text-[13px] text-ink-2">
      {[
        "Encrypted on this device with AES-256 before anything is saved. Only scrambled data reaches the server.",
        "Your master password never leaves this device and is never stored — not even by us.",
        `Stored ${where === "cloud" ? "in your account, so it works on all your devices" : "in this browser only (you're not signed in)"}. Left out of backups and exports.`,
        "Locks by itself after 5 minutes idle, a minute in the background, or when you leave this page. Copied passwords clear from the clipboard after 30 seconds.",
      ].map((t) => (
        <li key={t} className="flex gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
          {t}
        </li>
      ))}
    </ul>
  );
}

function SetupVault() {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = strength(pw);
  const create = async () => {
    if (pw.length < 10) return setErr("Use at least 10 characters.");
    if (s.score < 3) return setErr("Make it stronger — a few unrelated words with a number and a symbol works well.");
    if (pw !== again) return setErr("The two passwords don't match.");
    if (!ack) return setErr("Tick the box to confirm you understand it can't be recovered.");
    setBusy(true);
    try {
      await useVault.getState().setup(pw);
      toast.success("Vault created and unlocked");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create the vault");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4">
      <section className="anim-rise rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-inverse text-on-inverse">
          <LockKeyhole className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="display mt-3 text-[22px] font-semibold">Create your password vault</h2>
        <p className="mt-1 text-[14px] text-ink-2">Choose a master password. It unlocks the vault and is the only way in.</p>
        <div className="mt-4 flex flex-col gap-3">
          <Field label="Master password" htmlFor="vault-new">
            <SecretInput id="vault-new" value={pw} onChange={(v) => ((setPw(v)), setErr(null))} autoFocus autoComplete="new-password" />
            <StrengthBar password={pw} />
          </Field>
          <Field label="Type it again" htmlFor="vault-again">
            <SecretInput id="vault-again" value={again} onChange={(v) => ((setAgain(v)), setErr(null))} autoComplete="new-password" onEnter={create} />
          </Field>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-warn-soft p-3 text-[13px]">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--warn)]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>
              <b>I understand it can&apos;t be recovered.</b> If I forget the master password, nobody — including Nudge Chapters — can open the vault. I&apos;ll write it down somewhere safe.
            </span>
          </label>
          {err && <p className="text-[13px] text-danger" role="alert">{err}</p>}
          <Button variant="primary" size="lg" loading={busy} onClick={create} icon={<LockKeyhole className="h-4 w-4" />}>
            {busy ? "Securing…" : "Create vault"}
          </Button>
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="mb-2 text-[14px] font-semibold">How it&apos;s protected</h3>
        <SecurityPoints />
      </section>
    </div>
  );
}

function UnlockVault() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const failures = useVault((s) => s.failures);
  const retryAt = useVault((s) => s.retryAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (retryAt <= now) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [retryAt, now]);
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const unlock = async () => {
    if (!pw || busy || wait) return;
    setBusy(true);
    setErr(null);
    try {
      const ok = await useVault.getState().unlock(pw);
      if (!ok) {
        setErr("That's not the master password.");
        setNow(Date.now());
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't open the vault");
    } finally {
      setBusy(false);
      setPw("");
    }
  };
  return (
    <section className="anim-rise mx-auto max-w-md rounded-2xl border border-line bg-surface p-5 text-center sm:p-7">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-inverse text-on-inverse">
        <Lock className="h-7 w-7" aria-hidden />
      </span>
      <h2 className="display mt-3 text-[22px] font-semibold">Vault locked</h2>
      <p className="mt-1 text-[13.5px] text-ink-3">Enter your master password to open it.</p>
      <div className="mt-4 text-left">
        <SecretInput id="vault-unlock" value={pw} onChange={(v) => ((setPw(v)), setErr(null))} autoFocus autoComplete="current-password" placeholder="Master password" onEnter={unlock} />
      </div>
      {err && <p className="mt-2 text-[13px] text-danger" role="alert">{err}{failures >= 3 && !wait ? ` (${failures} wrong tries)` : ""}</p>}
      {wait > 0 && <p className="mt-2 text-[13px] text-warn">Too many wrong tries. Try again in {wait}s.</p>}
      <Button variant="primary" size="lg" className="mt-4 w-full" loading={busy} disabled={!pw || wait > 0} onClick={unlock}>
        {busy ? "Unlocking…" : "Unlock"}
      </Button>
      <p className="mt-3 text-[12px] text-ink-3">Forgotten it? It can&apos;t be reset — that&apos;s what keeps the vault safe.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------

type Filter = "all" | VaultKind | "fav" | "weak";

function VaultHome() {
  const items = useVault((s) => s.items);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; kind: VaultKind } | null>(null);

  const reused = useMemo(() => {
    const count = new Map<string, number>();
    for (const i of items) if (i.entry.password) count.set(i.entry.password, (count.get(i.entry.password) ?? 0) + 1);
    return new Set(items.filter((i) => i.entry.password && count.get(i.entry.password)! > 1).map((i) => i.id));
  }, [items]);
  const weak = useMemo(() => new Set(items.filter((i) => i.entry.password && strength(i.entry.password).score < 2).map((i) => i.id)), [items]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...items]
      .filter((i) => (filter === "all" ? true : filter === "fav" ? i.entry.favorite : filter === "weak" ? weak.has(i.id) || reused.has(i.id) : i.entry.kind === filter))
      .filter((i) => !needle || [i.entry.title, i.entry.username, i.entry.url, i.entry.notes].some((x) => x?.toLowerCase().includes(needle)))
      .sort((a, b) => Number(!!b.entry.favorite) - Number(!!a.entry.favorite) || a.entry.title.localeCompare(b.entry.title));
  }, [items, q, filter, weak, reused]);

  if (editing) return <EntryEditor id={editing.id} kind={editing.kind} onDone={(id) => ((setEditing(null)), setOpen(id))} />;
  const current = open ? items.find((i) => i.id === open) : null;
  const atRisk = new Set([...weak, ...reused]).size;

  return (
    <div className="flex flex-col gap-4">
      {atRisk > 0 && (
        <button type="button" onClick={() => setFilter("weak")} className="flex items-center gap-3 rounded-2xl border border-warn/40 bg-warn-soft p-3.5 text-left text-[13.5px]">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warn" aria-hidden />
          <span className="flex-1"><b>{atRisk} password{atRisk === 1 ? "" : "s"} to improve</b> — {weak.size} weak, {reused.size} reused. Tap to see them.</span>
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: null, kind: "login" })}>
          Add
        </Button>
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search the vault" placeholder="Search" className="h-10 pl-9" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="radiogroup" aria-label="Show">
        {([["all", `All · ${items.length}`], ["login", "Logins"], ["card", "Cards"], ["note", "Notes"], ["fav", "Favourites"], ["weak", "Needs attention"]] as [Filter, string][]).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={filter === id} onClick={() => setFilter(id)} className={cn("h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium", filter === id ? "bg-inverse text-on-inverse" : "bg-surface-3/70 text-ink-2 hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={LockKeyhole} title="Your vault is empty" body="Add logins, card details and private notes. Everything is encrypted on this device before it's saved." action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: null, kind: "login" })}>Add the first one</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ul className={cn("flex flex-col divide-y divide-line/70 overflow-hidden rounded-2xl border border-line bg-surface", current && "hidden lg:flex")} aria-label="Vault entries">
            {list.length === 0 && <li className="p-4 text-[13.5px] text-ink-3">Nothing matches.</li>}
            {list.map((i) => {
              const K = KIND[i.entry.kind].icon;
              return (
                <li key={i.id}>
                  <button type="button" onClick={() => setOpen(i.id)} aria-current={open === i.id} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2", open === i.id && "bg-surface-2")}>
                    <span className="display flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[16px] font-semibold text-brand-strong">{i.entry.title.trim()[0]?.toUpperCase() ?? <K className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate text-[14.5px] font-medium">
                        {i.entry.title}
                        {i.entry.favorite && <Star className="h-3.5 w-3.5 shrink-0 fill-warn text-warn" aria-label="Favourite" />}
                      </span>
                      <span className="block truncate text-[12.5px] text-ink-3">{i.entry.kind === "card" ? (i.entry.number ? `•••• ${i.entry.number.replace(/\s/g, "").slice(-4)}` : "Card") : i.entry.kind === "note" ? "Secure note" : i.entry.username || i.entry.url || "Login"}</span>
                    </span>
                    {(weak.has(i.id) || reused.has(i.id)) && <AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-label={reused.has(i.id) ? "Reused password" : "Weak password"} />}
                  </button>
                </li>
              );
            })}
          </ul>
          {current ? (
            <EntryDetail item={current} weak={weak.has(current.id)} reused={reused.has(current.id)} onBack={() => setOpen(null)} onEdit={() => setEditing({ id: current.id, kind: current.entry.kind })} />
          ) : (
            <div className="hidden items-center justify-center rounded-2xl border border-dashed border-line-strong p-8 text-center text-[13.5px] text-ink-3 lg:flex">Pick an entry to see it.</div>
          )}
        </div>
      )}

      <details className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <summary className="cursor-pointer list-none text-[14.5px] font-semibold">Security & master password</summary>
        <div className="mt-3 grid gap-5 lg:grid-cols-2">
          <SecurityPoints />
          <ChangeMaster />
        </div>
      </details>
    </div>
  );
}

function Row({ label, value, secret, mono, copy, children }: { label: string; value?: string; secret?: boolean; mono?: boolean; copy?: boolean; children?: ReactNode }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => setShow(false), 20_000);
    return () => window.clearTimeout(t);
  }, [show]);
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 border-t border-line/70 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-ink-3">{label}</p>
        <p className={cn("break-all text-[15px]", (mono || secret) && "font-mono", secret && !show && "tracking-widest")}>{secret && !show ? "•".repeat(Math.min(16, value.length)) : value}</p>
        {children}
      </div>
      {secret && (
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? `Hide ${label}` : `Show ${label}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      )}
      {copy && (
        <button type="button" onClick={() => void copySecret(value, label)} aria-label={`Copy ${label}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3">
          <Copy className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function EntryDetail({ item, weak, reused, onBack, onEdit }: { item: VaultItem; weak: boolean; reused: boolean; onBack: () => void; onEdit: () => void }) {
  const e = item.entry;
  const [confirm, setConfirm] = useState(false);
  const url = e.url && /^https?:\/\//i.test(e.url) ? e.url : e.url ? `https://${e.url}` : null;
  return (
    <article className="anim-fade rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line p-3 sm:px-5">
        <button type="button" onClick={onBack} aria-label="Back to the list" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3 lg:hidden">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="display flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[16px] font-semibold text-brand-strong">{e.title.trim()[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[17px] font-semibold">{e.title}</h2>
          <p className="text-[12px] text-ink-3">{KIND[e.kind].label} · updated {formatDate(item.updated_at.slice(0, 10), "medium")}</p>
        </div>
        <button
          type="button"
          aria-pressed={!!e.favorite}
          aria-label={e.favorite ? "Remove from favourites" : "Add to favourites"}
          onClick={() => void useVault.getState().save({ ...e, favorite: !e.favorite }, item.id)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-surface-3"
        >
          <Star className={cn("h-[18px] w-[18px]", e.favorite ? "fill-warn text-warn" : "text-ink-3")} />
        </button>
        <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit}>
          Edit
        </Button>
      </div>
      <div className="px-4 py-2 sm:px-5">
        {(weak || reused) && (
          <p className="my-2 flex items-center gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[13px]">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-hidden />
            {reused ? "This password is used for more than one entry. If one site leaks it, the others are exposed." : "This password is weak."} Edit it and use Generate.
          </p>
        )}
        <Row label="Username" value={e.username} copy />
        <Row label="Password" value={e.password} secret copy>
          {e.password && <StrengthBar password={e.password} />}
        </Row>
        {url && (
          <div className="flex items-center gap-2 border-t border-line/70 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-ink-3">Website</p>
              <p className="truncate text-[15px]">{e.url}</p>
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open website" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}
        <Row label="Card number" value={e.number} secret mono copy />
        <Row label="Expiry" value={e.expiry} mono />
        <Row label="CVV" value={e.cvv} secret mono copy />
        {e.notes && (
          <div className="border-t border-line/70 py-3">
            <p className="text-[12px] text-ink-3">Notes</p>
            <p className="whitespace-pre-wrap text-[14.5px]">{e.notes}</p>
          </div>
        )}
      </div>
      <div className="flex justify-end border-t border-line p-3 sm:px-5">
        <Button variant="ghost" className="text-danger hover:text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>
          Delete
        </Button>
      </div>
      <ConfirmSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Delete "${e.title}"?`}
        body="It's removed from the vault on every device. This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await useVault.getState().remove(item.id);
          toast.success("Deleted");
          onBack();
        }}
      />
    </article>
  );
}

function EntryEditor({ id, kind: startKind, onDone }: { id: string | null; kind: VaultKind; onDone: (id: string | null) => void }) {
  const existing = useVault((s) => (id ? s.items.find((i) => i.id === id) : undefined));
  const [e, setE] = useState<VaultEntry>(() => existing?.entry ?? { kind: startKind, title: "" });
  const [len, setLen] = useState(20);
  const [symbols, setSymbols] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<VaultEntry>) => ((setE((x) => ({ ...x, ...p }))), setErr(null));
  const gen = useCallback(() => set({ password: generatePassword(len, { symbols }) }), [len, symbols]);
  const first = useRef(true);
  useEffect(() => {
    // Regenerate when the length or symbols change, but never overwrite a password you typed on open.
    if (first.current) {
      first.current = false;
      return;
    }
    if (e.password !== undefined) gen();
  }, [len, symbols]);

  const save = async () => {
    if (!e.title.trim()) return setErr("Give it a name, like the website or bank.");
    setBusy(true);
    try {
      const changed = existing?.entry.password !== e.password;
      const entry: VaultEntry = { ...e, title: e.title.trim(), password_changed_at: changed && e.password ? new Date().toISOString() : e.password_changed_at };
      const saved = await useVault.getState().save(entry, id ?? undefined);
      toast.success(id ? "Saved" : "Added to your vault");
      onDone(saved);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="anim-fade mx-auto flex max-w-2xl flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onDone(id)} aria-label="Cancel" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-3">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-[18px] font-semibold">{id ? "Edit entry" : "Add to vault"}</h2>
      </div>
      {!id && (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type">
          {(Object.keys(KIND) as VaultKind[]).map((k) => {
            const K = KIND[k].icon;
            return (
              <button key={k} type="button" role="radio" aria-checked={e.kind === k} onClick={() => set({ kind: k })} className={cn("flex flex-col items-center gap-1 rounded-xl border p-3 text-[13px] font-medium", e.kind === k ? "border-future bg-future-soft/60 ring-2 ring-future/25" : "border-line hover:border-line-strong")}>
                <K className="h-5 w-5" aria-hidden />
                {KIND[k].label}
              </button>
            );
          })}
        </div>
      )}
      <Field label="Name" htmlFor="v-title" error={err}>
        <Input id="v-title" value={e.title} onChange={(x) => set({ title: x.target.value })} placeholder={e.kind === "card" ? "e.g. HDFC Millennia" : e.kind === "note" ? "e.g. Locker PIN, Wi-Fi" : "e.g. Netbanking, Gmail"} autoComplete="off" autoFocus={!id} />
      </Field>
      {e.kind === "login" && (
        <>
          <Field label="Username or email" htmlFor="v-user" optional>
            <Input id="v-user" value={e.username ?? ""} onChange={(x) => set({ username: x.target.value })} autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </Field>
          <Field label="Password" htmlFor="v-pass" optional>
            <SecretInput id="v-pass" value={e.password ?? ""} onChange={(v) => set({ password: v })} autoComplete="new-password" />
            <StrengthBar password={e.password ?? ""} />
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-2.5 text-[13px]">
              <Button size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={gen}>
                Generate
              </Button>
              <label className="flex items-center gap-2">
                Length <span className="num w-6 font-semibold">{len}</span>
                <input type="range" min={8} max={64} value={len} onChange={(x) => setLen(Number(x.target.value))} className="w-28 accent-[var(--brand)]" aria-label="Password length" />
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={symbols} onChange={(x) => setSymbols(x.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
                Symbols
              </label>
            </div>
          </Field>
          <Field label="Website" htmlFor="v-url" optional>
            <Input id="v-url" inputMode="url" value={e.url ?? ""} onChange={(x) => set({ url: x.target.value.trim() })} placeholder="netbanking.hdfcbank.com" autoComplete="off" autoCapitalize="off" />
          </Field>
        </>
      )}
      {e.kind === "card" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="Card number" htmlFor="v-num" optional>
            <Input id="v-num" inputMode="numeric" value={e.number ?? ""} onChange={(x) => set({ number: x.target.value.replace(/[^\d ]/g, "").slice(0, 23) })} autoComplete="off" className="font-mono" />
          </Field>
          <Field label="Expiry" htmlFor="v-exp" optional>
            <Input id="v-exp" value={e.expiry ?? ""} onChange={(x) => set({ expiry: x.target.value.slice(0, 7) })} placeholder="MM/YY" autoComplete="off" className="font-mono" />
          </Field>
          <Field label="CVV" htmlFor="v-cvv" optional>
            <SecretInput id="v-cvv" value={e.cvv ?? ""} onChange={(v) => set({ cvv: v.replace(/\D/g, "").slice(0, 4) })} />
          </Field>
        </div>
      )}
      <Field label={e.kind === "note" ? "Note" : "Notes"} htmlFor="v-notes" optional={e.kind !== "note"}>
        <Textarea id="v-notes" rows={e.kind === "note" ? 8 : 3} value={e.notes ?? ""} onChange={(x) => set({ notes: x.target.value })} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button onClick={() => onDone(id)} disabled={busy}>Cancel</Button>
        <Button variant="primary" loading={busy} icon={<Check className="h-4 w-4" />} onClick={save}>
          {id ? "Save" : "Add"}
        </Button>
      </div>
      <p className="text-[12px] text-ink-3">Encrypted on this device before it&apos;s saved.</p>
    </section>
  );
}

function ChangeMaster() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const change = async () => {
    if (strength(next).score < 3 || next.length < 10) return setMsg({ ok: false, text: "Choose a stronger new password (10+ characters, rated Strong)." });
    if (next !== again) return setMsg({ ok: false, text: "The new passwords don't match." });
    setBusy(true);
    try {
      const ok = await useVault.getState().changePassword(cur, next);
      setMsg(ok ? { ok: true, text: "Master password changed. Use the new one from now on." } : { ok: false, text: "The current master password isn't right." });
      if (ok) ((setCur("")), setNext(""), setAgain(""));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't change it" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-[14px] font-semibold">Change master password</h3>
      <SecretInput id="vm-cur" value={cur} onChange={setCur} placeholder="Current master password" autoComplete="current-password" />
      <SecretInput id="vm-new" value={next} onChange={setNext} placeholder="New master password" autoComplete="new-password" />
      <StrengthBar password={next} />
      <SecretInput id="vm-again" value={again} onChange={setAgain} placeholder="New master password again" autoComplete="new-password" onEnter={change} />
      {msg && <p className={cn("text-[13px]", msg.ok ? "text-ok" : "text-danger")}>{msg.text}</p>}
      <Button loading={busy} disabled={!cur || !next || !again} onClick={change} className="self-start">
        Change it
      </Button>
    </div>
  );
}
