"use client";

import { Archive, ArchiveRestore, Download, FileJson, FileSpreadsheet, FileUp, KeyRound, LogOut, ShieldCheck, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Importer } from "@/components/importer";
import { PageHeader } from "@/components/shell/app-shell";
import { setLocalMode } from "@/components/shell/bootstrap";
import { BmcButton } from "@/components/support";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Input, NumberInput, Select, Switch } from "@/components/ui/form";
import { Badge, EmptyState, Panel, Segmented, Tabs } from "@/components/ui/misc";
import { ConfirmSheet, Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { BMC_URL } from "@/lib/config";
import { downloadCSV, downloadExcel, downloadJSON, makeBackup, restoreBackup, type Backup } from "@/lib/data/io";
import { LocalRepo } from "@/lib/data/localRepo";
import { getSupabase } from "@/lib/data/supabase";
import { CURRENCIES } from "@/lib/forms";
import { useFinance } from "@/lib/finance";
import { useStore } from "@/lib/store";
import { useTab } from "@/lib/use-tab";
import type { AlertModule, AuditEvent, Category } from "@/lib/types";

const TABS = ["profile", "categories", "notifications", "data", "security", "activity", "appearance"] as const;

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const [tab, setTab] = useTab(TABS, "profile");
  return (
    <>
      <PageHeader title="Settings" description="Your profile, categories, alerts, data and security." />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "profile", label: "Profile" },
          { id: "categories", label: "Categories" },
          { id: "notifications", label: "Alerts" },
          { id: "data", label: "Import & export" },
          { id: "security", label: "Security" },
          { id: "activity", label: "Activity log" },
          { id: "appearance", label: "Appearance" },
        ]}
      />
      {tab === "profile" && <Profile />}
      {tab === "categories" && <Categories />}
      {tab === "notifications" && <Notifications />}
      {tab === "data" && <Data />}
      {tab === "security" && <Security />}
      {tab === "activity" && <Activity />}
      {tab === "appearance" && <Appearance />}
    </>
  );
}

// ---------------------------------------------------------------------------

function Profile() {
  const { ds } = useFinance();
  const updateProfile = useStore((s) => s.updateProfile);
  const p = ds.profile;
  const [name, setName] = useState(p.name ?? "");
  const usedCurrencies = Array.from(new Set([...ds.accounts.map((a) => a.currency), ...ds.investments.map((i) => i.currency)])).filter((c) => c !== p.currency);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="You">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" htmlFor="pf-name" className="col-span-2">
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== p.name && updateProfile({ name })} />
          </Field>
          <Field label="Country" htmlFor="pf-country">
            <Select id="pf-country" value={p.country} onChange={(e) => updateProfile({ country: e.target.value })}>
              {[["IN", "India"], ["US", "United States"], ["GB", "United Kingdom"], ["AE", "UAE"], ["SG", "Singapore"], ["AU", "Australia"], ["CA", "Canada"], ["DE", "Germany"], ["OTHER", "Other"]].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Main currency" htmlFor="pf-cur" help="Totals are shown in this currency">
            <Select id="pf-cur" value={p.currency} onChange={(e) => updateProfile({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Number format" htmlFor="pf-loc">
            <Select id="pf-loc" value={p.locale} onChange={(e) => updateProfile({ locale: e.target.value })}>
              <option value="en-IN">1,00,000 (Indian)</option>
              <option value="en-US">100,000 (International)</option>
              <option value="en-GB">100,000 (UK)</option>
              <option value="de-DE">100.000 (European)</option>
            </Select>
          </Field>
          <Field label="Time zone" htmlFor="pf-tz">
            <Select id="pf-tz" value={p.timezone} onChange={(e) => updateProfile({ timezone: e.target.value })}>
              {["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "UTC"].map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Birth year" htmlFor="pf-by">
            <NumberInput id="pf-by" value={p.birth_year ?? ""} placeholder="1995" onChange={(e) => updateProfile({ birth_year: e.target.value ? Number(e.target.value) : null })} />
          </Field>
          <Field label="Retirement age" htmlFor="pf-ra">
            <NumberInput id="pf-ra" value={p.retirement_age} onChange={(e) => e.target.value && updateProfile({ retirement_age: Number(e.target.value) })} />
          </Field>
        </div>
      </Panel>
      <div className="flex flex-col gap-4">
        <Panel title="Exchange rates" description={`How many ${p.currency} one unit of each foreign currency is worth. Update them when rates move.`}>
          {usedCurrencies.length === 0 && !Object.keys(p.fx_rates ?? {}).length ? (
            <p className="text-[13.5px] text-ink-3">All your accounts use {p.currency}. Add a foreign-currency account to set a rate.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {Array.from(new Set([...usedCurrencies, ...Object.keys(p.fx_rates ?? {})])).map((c) => (
                <Field key={c} label={`1 ${c} =`} htmlFor={`fx-${c}`}>
                  <NumberInput id={`fx-${c}`} step="0.01" value={p.fx_rates?.[c] ?? ""} onChange={(e) => updateProfile({ fx_rates: { ...(p.fx_rates ?? {}), [c]: Number(e.target.value) } })} />
                </Field>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Projection assumptions" description="Salary growth, inflation and expected returns for each scenario.">
          <LinkButton href="/projection?tab=assumptions">Edit assumptions</LinkButton>
        </Panel>
        <Panel title="Setup">
          <p className="text-[13.5px] text-ink-2">Run through the guided setup again to add anything you skipped.</p>
          <LinkButton className="mt-3" href="/onboarding">
            Open guided setup
          </LinkButton>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Categories() {
  const { ds } = useFinance();
  const add = useStore((s) => s.add);
  const [kind, setKind] = useState<Category["kind"]>("expense");
  const [name, setName] = useState("");
  const list = ds.categories.filter((c) => c.kind === kind).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  const exists = ds.categories.some((c) => c.kind === kind && c.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <Panel title="Categories" description="Fixed categories feed the fixed-vs-variable report; essential ones size your emergency fund.">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented
          options={[
            { id: "expense", label: "Expenses" },
            { id: "income", label: "Income" },
          ]}
          value={kind}
          onChange={setKind}
        />
        <form
          className="flex flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || exists) return;
            await add("categories", { name: name.trim(), kind, is_fixed: false, is_essential: false, archived: false });
            setName("");
          }}
        >
          <Input aria-label="New category" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim() || exists}>
            Add
          </Button>
        </form>
      </div>
      <ul className="mt-4 divide-y divide-line">
        {list.map((c) => (
          <CategoryRow key={c.id} c={c} />
        ))}
      </ul>
      {!list.length && <p className="py-4 text-[13.5px] text-ink-3">No categories yet.</p>}
    </Panel>
  );
}

function CategoryRow({ c }: { c: Category }) {
  const patch = useStore((s) => s.patch);
  const used = useFinance().ds.transactions.filter((t) => t.category === c.name).length;
  return (
    <li className={cn("flex flex-wrap items-center gap-3 py-2.5", c.archived && "opacity-60")}>
      <input type="color" aria-label={`Colour for ${c.name}`} className="h-7 w-7 cursor-pointer rounded-md border border-line bg-transparent" value={c.color ?? "#94a3b8"} onChange={(e) => patch("categories", c.id, { color: e.target.value })} />
      <span className="min-w-32 flex-1 text-[14.5px]">
        {c.name} <span className="text-[12px] text-ink-3">· {used} transactions</span>
      </span>
      {c.kind === "expense" && (
        <>
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={c.is_fixed} onChange={(e) => patch("categories", c.id, { is_fixed: e.target.checked })} /> Fixed
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={c.is_essential} onChange={(e) => patch("categories", c.id, { is_essential: e.target.checked })} /> Essential
          </label>
        </>
      )}
      <button type="button" aria-label={c.archived ? "Restore" : "Archive"} title={c.archived ? "Restore" : "Archive"} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-3" onClick={() => patch("categories", c.id, { archived: !c.archived })}>
        {c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------

const MODULES: { id: AlertModule; label: string }[] = [
  { id: "balance", label: "Projected low or negative balance" },
  { id: "bills", label: "Bills due and overdue" },
  { id: "cards", label: "Credit-card statements and due dates" },
  { id: "loans", label: "EMIs" },
  { id: "sip", label: "SIPs" },
  { id: "chits", label: "Chit installments and payouts" },
  { id: "income", label: "Salary and expected income" },
  { id: "lending", label: "Repayments owed to you or by you" },
  { id: "goals", label: "Goals going off track" },
  { id: "spending", label: "Unusually large expenses" },
];

function Notifications() {
  const { ds } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const n = ds.profile.preferences?.notifications ?? {};
  const modules = n.modules ?? {};
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => {
    if (typeof Notification !== "undefined") setPerm(Notification.permission);
  }, []);
  const setN = (patch: Partial<typeof n>) => updatePrefs({ notifications: { ...n, ...patch } });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="What to alert me about" description="Alerts appear in the bell and on the dashboard.">
        {MODULES.map((m) => (
          <Switch key={m.id} checked={modules[m.id] !== false} onChange={(v) => setN({ modules: { ...modules, [m.id]: v } })} label={m.label} />
        ))}
        {Object.keys(ds.profile.preferences?.dismissedAlerts ?? {}).length > 0 && (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => updatePrefs({ dismissedAlerts: {} })}>
            Show {Object.keys(ds.profile.preferences?.dismissedAlerts ?? {}).length} dismissed alerts again
          </Button>
        )}
      </Panel>
      <Panel title="On this device" description="Browser notifications for urgent items, at most once a day when you open Nudge Chapters.">
        {typeof Notification === "undefined" ? (
          <p className="text-[13.5px] text-ink-3">This browser doesn&apos;t support notifications.</p>
        ) : (
          <>
            <Switch
              checked={!!n.browser && perm === "granted"}
              onChange={async (v) => {
                if (v) {
                  const p = await Notification.requestPermission();
                  setPerm(p);
                  if (p !== "granted") return toast.error("Notifications are blocked for this site in your browser settings.");
                }
                await setN({ browser: v });
              }}
              label="Notify me about critical and high-priority alerts"
            />
            <Switch checked={n.digest !== false} onChange={(v) => setN({ digest: v })} label="Bundle them into one daily digest" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Quiet from" htmlFor="qh-s">
                <Input id="qh-s" type="time" value={n.quietStart ?? "22:00"} onChange={(e) => setN({ quietStart: e.target.value })} />
              </Field>
              <Field label="Until" htmlFor="qh-e">
                <Input id="qh-e" type="time" value={n.quietEnd ?? "07:00"} onChange={(e) => setN({ quietEnd: e.target.value })} />
              </Field>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Data() {
  const { ds, today } = useFinance();
  const repo = useStore((s) => s.repo);
  const load = useStore((s) => s.load);
  const [importer, setImporter] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const counts = { transactions: ds.transactions.length, accounts: ds.accounts.length, rules: ds.recurring_rules.length, investments: ds.investments.length };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Export" description="Your data is yours. Download all of it any time.">
        <div className="flex flex-col gap-2">
          <Button icon={<FileJson className="h-4 w-4" />} onClick={() => downloadJSON(makeBackup(ds), `nudge-chapters-backup-${today}.json`)}>
            Full backup (JSON — can be restored)
          </Button>
          <Button
            icon={<FileSpreadsheet className="h-4 w-4" />}
            onClick={async () => {
              try {
                await downloadExcel(ds, `nudge-chapters-data-${today}.xlsx`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              }
            }}
          >
            Everything in Excel (a sheet per table)
          </Button>
          <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadCSV(ds.transactions as unknown as Record<string, unknown>[], `nudge-chapters-transactions-${today}.csv`)}>
            Transactions (CSV)
          </Button>
          <LinkButton href="/reports" variant="ghost">
            Printable reports & PDF summary
          </LinkButton>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">
          {counts.transactions} transactions, {counts.accounts} accounts, {counts.rules} recurring items, {counts.investments} investments.
        </p>
      </Panel>
      <Panel title="Import" description="Bring in bank statements or restore a backup.">
        <div className="flex flex-col gap-2">
          <Button variant="primary" icon={<FileUp className="h-4 w-4" />} onClick={() => setImporter(true)}>
            Import transactions from CSV or Excel
          </Button>
          <Button icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()} loading={!!restoring}>
            Restore a Nudge Chapters backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f || !repo) return;
              try {
                const backup = JSON.parse(await f.text()) as Backup;
                setRestoring("Starting…");
                const report = await restoreBackup(repo, backup, setRestoring, ds);
                await load();
                const count = Object.values(report.restored).reduce((a, n) => a + (n ?? 0), 0);
                const skipped = Object.entries(report.ignored).map(([t, f]) => `${t.replace(/_/g, " ")}: ${f!.join(", ")}`);
                toast.success(`Backup restored — ${count} records`, skipped.length ? { description: `Ignored fields this app doesn't use (${skipped.join("; ")}).` } : undefined);
              } catch (err) {
                toast.error(`Couldn't restore: ${err instanceof SyntaxError ? "the file isn't valid JSON." : err instanceof Error ? err.message : String(err)}`);
              } finally {
                setRestoring(null);
              }
            }}
          />
          {restoring && <p className="text-[12.5px] text-ink-3">{restoring}</p>}
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">Restoring adds the backup&apos;s records to what&apos;s here. To replace everything, delete your data first.</p>
      </Panel>
      <Panel title="Delete my data" description="Removes every account, transaction and plan. Your login stays." className="border-danger/30 lg:col-span-2">
        <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setWipe(true)}>
          Delete all my financial data
        </Button>
      </Panel>
      <Importer open={importer} onClose={() => setImporter(false)} />
      <Sheet
        open={wipe}
        onClose={() => setWipe(false)}
        title="Delete all your data?"
        description="This can't be undone. Download a backup first if you might want it back."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setWipe(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={confirmText !== "DELETE"}
              onClick={async () => {
                try {
                  await repo?.wipe();
                  await load();
                  setWipe(false);
                  toast.success("All data deleted");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                }
              }}
            >
              Delete everything
            </Button>
          </div>
        }
      >
        <Field label='Type "DELETE" to confirm' htmlFor="wipe-confirm">
          <Input id="wipe-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </Field>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Security() {
  const repo = useStore((s) => s.repo);
  const router = useRouter();
  const [del, setDel] = useState(false);
  if (repo?.kind === "local") {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Stored on this device">
          <p className="text-[14px] text-ink-2">
            You&apos;re using Nudge Chapters without an account, so your data lives only in this browser. Clearing site data removes it, and it won&apos;t sync to your phone or laptop.
          </p>
          <p className="mt-3 text-[13.5px] text-ink-2">To move to the cloud: download a backup (Import & export), sign in, then restore it.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              icon={<LogOut className="h-4 w-4" />}
              onClick={() => {
                setLocalMode(null);
                useStore.getState().setRepo(null);
                router.replace("/login");
              }}
            >
              Go to sign in
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>
              Erase this device&apos;s data
            </Button>
          </div>
        </Panel>
        <ConfirmSheet
          open={del}
          onClose={() => setDel(false)}
          title="Erase everything on this device?"
          body="All Nudge Chapters data stored in this browser is deleted permanently."
          confirmLabel="Erase"
          danger
          onConfirm={async () => {
            LocalRepo.clear();
            setLocalMode(null);
            useStore.getState().setRepo(null);
            router.replace("/login");
          }}
        />
      </div>
    );
  }
  return <CloudSecurity />;
}

function CloudSecurity() {
  const repo = useStore((s) => s.repo);
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [factors, setFactors] = useState<{ id: string; status: string; friendly_name?: string }[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [del, setDel] = useState(false);

  const refresh = async () => {
    const { data } = await getSupabase().auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as never);
  };
  useEffect(() => {
    void refresh();
  }, []);

  const verified = factors.filter((f) => f.status === "verified");
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Account">
        <p className="text-[14px] text-ink-2">
          Signed in as <strong className="text-ink">{repo?.userEmail}</strong>
        </p>
        <form
          className="mt-4 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.length < 8) return toast.error("Use at least 8 characters.");
            setBusy("pw");
            const { error } = await getSupabase().auth.updateUser({ password: pw });
            setBusy(null);
            if (error) toast.error(error.message);
            else {
              setPw("");
              toast.success("Password changed");
            }
          }}
        >
          <Input type="password" autoComplete="new-password" aria-label="New password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button type="submit" loading={busy === "pw"} icon={<KeyRound className="h-4 w-4" />}>
            Change
          </Button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            icon={<LogOut className="h-4 w-4" />}
            onClick={async () => {
              await getSupabase().auth.signOut({ scope: "global" });
              useStore.getState().setRepo(null);
              router.replace("/login");
            }}
          >
            Sign out on all devices
          </Button>
        </div>
      </Panel>
      <Panel title="Two-step verification" description="Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy…) when signing in.">
        {verified.length ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="brand">
              <ShieldCheck className="h-3.5 w-3.5" /> On
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                for (const f of verified) await getSupabase().auth.mfa.unenroll({ factorId: f.id });
                await refresh();
                toast.success("Two-step verification turned off");
              }}
            >
              Turn off
            </Button>
          </div>
        ) : enroll ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13.5px] text-ink-2">Scan this with your authenticator app, then enter the 6-digit code.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qr} alt="QR code for your authenticator app" className="h-44 w-44 rounded-xl bg-white p-2" />
            <p className="break-all text-[12px] text-ink-3">Or enter this key: {enroll.secret}</p>
            <div className="flex gap-2">
              <Input inputMode="numeric" aria-label="Code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <Button
                variant="primary"
                loading={busy === "verify"}
                onClick={async () => {
                  setBusy("verify");
                  const { error } = await getSupabase().auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
                  setBusy(null);
                  if (error) return toast.error("That code didn't work.");
                  setEnroll(null);
                  setCode("");
                  await refresh();
                  toast.success("Two-step verification is on");
                }}
              >
                Verify
              </Button>
            </div>
          </div>
        ) : (
          <Button
            icon={<ShieldCheck className="h-4 w-4" />}
            loading={busy === "enroll"}
            onClick={async () => {
              setBusy("enroll");
              for (const f of factors.filter((x) => x.status !== "verified")) await getSupabase().auth.mfa.unenroll({ factorId: f.id });
              const { data, error } = await getSupabase().auth.mfa.enroll({ factorType: "totp", friendlyName: `Nudge Chapters ${new Date().toISOString().slice(0, 10)}` });
              setBusy(null);
              if (error || !data) return toast.error(error?.message ?? "Couldn't start setup");
              setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
            }}
          >
            Set up two-step verification
          </Button>
        )}
      </Panel>
      <Panel title="How your data is protected" className="lg:col-span-2">
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-ink-2">
          <li>Nudge Chapters never asks for or stores bank passwords. Everything is entered by you or imported from files you choose.</li>
          <li>Your data is encrypted in transit (HTTPS) and at rest.</li>
          <li>Only you can read and change your records.</li>
          <li>Use the eye icon in the top bar to hide amounts on screen in public.</li>
        </ul>
      </Panel>
      <Panel title="Delete my account" className="border-danger/30 lg:col-span-2">
        <p className="text-[13.5px] text-ink-2">Permanently deletes your login and all your financial data.</p>
        <Button className="mt-3" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDel(true)}>
          Delete account
        </Button>
      </Panel>
      <ConfirmSheet
        open={del}
        onClose={() => setDel(false)}
        title="Delete your account permanently?"
        body="Your login and every record are erased immediately. Download a backup first if you might need it."
        confirmLabel="Delete account"
        danger
        onConfirm={async () => {
          try {
            await repo?.deleteAccount();
            useStore.getState().setRepo(null);
            router.replace("/login");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function describe(e: AuditEvent): string {
  const d = (e.new_data ?? e.old_data ?? {}) as Record<string, unknown>;
  const name = (d.name ?? d.description ?? d.person ?? d.category ?? "") as string;
  const amount = d.amount ?? d.total_due ?? d.target_amount;
  return [name, amount != null ? `₹${Number(amount).toLocaleString("en-IN")}` : ""].filter(Boolean).join(" · ");
}

function changedFields(e: AuditEvent): string {
  if (e.action !== "update" || !e.old_data || !e.new_data) return "";
  const keys = Object.keys(e.new_data).filter((k) => !["updated_at", "created_at"].includes(k) && JSON.stringify(e.new_data![k]) !== JSON.stringify(e.old_data![k]));
  return keys.length ? `changed ${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""}` : "";
}

function Activity() {
  const repo = useStore((s) => s.repo);
  const [list, setList] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    repo
      ?.audit(300)
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo]);
  if (error) return <p className="text-[13.5px] text-danger">{error}</p>;
  if (!list) return <p className="text-[13.5px] text-ink-3">Loading…</p>;
  if (!list.length) return <EmptyState title="No activity yet" body="Every change to your accounts, transactions and plans will be listed here." />;
  return (
    <Panel title="Activity log" description="The last 300 changes to your financial records." flush>
      <ul className="divide-y divide-line">
        {list.map((e) => (
          <li key={String(e.id)} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-[13.5px]">
            <span className="num w-36 shrink-0 text-[12.5px] text-ink-3">{new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            <Badge tone={e.action === "delete" ? "danger" : e.action === "insert" ? "brand" : "neutral"}>{e.action === "insert" ? "Added" : e.action === "update" ? "Changed" : "Deleted"}</Badge>
            <span className="text-ink-2">{e.table_name.replace(/_/g, " ")}</span>
            <span className="min-w-0 flex-1 truncate">{describe(e)}</span>
            <span className="text-[12px] text-ink-3">{changedFields(e)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function Appearance() {
  const { ds } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const updateProfile = useStore((s) => s.updateProfile);
  const theme = ds.profile.preferences?.theme ?? "system";
  const setTheme = (t: "system" | "light" | "dark") => {
    try {
      if (t === "system") localStorage.removeItem("nudge:theme");
      else localStorage.setItem("nudge:theme", t);
    } catch {
      /* ignore */
    }
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    void updatePrefs({ theme: t });
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Look">
        <Field label="Theme" htmlFor="ap-theme">
          <Segmented
            options={[
              { id: "system", label: "Match device" },
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
            ]}
            value={theme}
            onChange={setTheme}
          />
        </Field>
        <div className="mt-4">
          <Switch checked={!!ds.profile.preferences?.maskValues} onChange={(v) => updatePrefs({ maskValues: v })} label="Hide amounts" help="Blurs every amount until you turn it off (also in the top bar)." />
        </div>
      </Panel>
      <Panel title="How much to show">
        <Segmented
          options={[
            { id: "simple", label: "Simple" },
            { id: "advanced", label: "Advanced" },
          ]}
          value={ds.profile.mode}
          onChange={(m) => updateProfile({ mode: m })}
        />
        <p className="mt-3 text-[13.5px] text-ink-2">
          Simple keeps to the essentials: dashboard, cash flow, accounts, bills and goals. Advanced adds scenario comparison, what-if planning, retirement and independence planners, the debt
          planner and detailed reports.
        </p>
        <Button size="sm" variant="ghost" className="mt-3" onClick={() => updatePrefs({ dashboard: {} })}>
          Reset dashboard layouts
        </Button>
      </Panel>
      {BMC_URL && (
        <Panel title="Enjoying Nudge Chapters?" className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px] text-ink-2">Nudge Chapters is free. If it helps you, you can support the developer.</p>
            <div className="flex gap-2">
              <BmcButton />
              <LinkButton href="/support" variant="ghost">
                More
              </LinkButton>
            </div>
          </div>
        </Panel>
      )}
      <p className="text-[12.5px] text-ink-3 lg:col-span-2">
        Keyboard: <kbd className="rounded border border-line px-1">Ctrl</kbd>+<kbd className="rounded border border-line px-1">K</kbd> search, <kbd className="rounded border border-line px-1">N</kbd> new transaction. <Link className="underline" href="/support">About & support</Link>
      </p>
    </div>
  );
}
