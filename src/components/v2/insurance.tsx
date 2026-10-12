"use client";

import { Bell, BellOff, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate, relativeDays } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import {
  INSURANCE_KINDS, PREMIUM_FREQUENCIES, annualPremium, frequencyLabel, insuranceKind, nextPremium, paysPremium,
} from "@/lib/insurance";
import { formatTime } from "@/lib/rhythm";
import type { InsurancePolicy, PremiumFrequency } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { Money } from "../money";
import { Button } from "../ui/button";
import { AmountInput, DateInput, Field, Input, Select, Switch, Textarea } from "../ui/form";
import { EmptyState } from "../ui/misc";
import { ConfirmSheet, Sheet } from "../ui/sheet";
import { deletePolicy, savePolicy } from "../insurance/actions";
import { Cell2, DataTable, Details } from "./data-table";
import { StatTile, StatusText, V2PageHeader } from "./ui";

const LIFE_KINDS = ["life", "term"];

/** Insurance: every policy you hold, what you pay and when, with a reminder before each premium. */
export function InsuranceScreen() {
  const { ds, today, positions, events, ctx } = useFinance();
  const [editing, setEditing] = useState<InsurancePolicy | null | "new">(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [removing, setRemoving] = useState<InsurancePolicy | null>(null);
  const policies = ds.insurance_policies ?? [];

  const rows = useMemo(
    () =>
      policies
        .map((p) => ({ p, next: nextPremium(p, ds, today, positions) }))
        .sort((a, b) => {
          const order = (x: InsurancePolicy) => (x.status === "active" ? 0 : 1);
          if (order(a.p) !== order(b.p)) return order(a.p) - order(b.p);
          const da = a.next?.date ?? "9999";
          const db = b.next?.date ?? "9999";
          return da < db ? -1 : da > db ? 1 : a.p.name.localeCompare(b.p.name);
        }),
    [policies, ds, today, positions],
  );
  const active = policies.filter((p) => p.status === "active");
  const yearly = active.reduce((s, p) => s + annualPremium(p), 0);
  const soonest = rows.find((r) => r.next);
  const cover = (pred: (p: InsurancePolicy) => boolean) => active.filter(pred).reduce((s, p) => s + (p.sum_assured ?? 0), 0);
  const lifeCover = cover((p) => LIFE_KINDS.includes(p.type));
  const healthCover = cover((p) => p.type === "health");
  const paidFrom = (p: InsurancePolicy) =>
    p.card_id ? ds.credit_cards.find((c) => c.id === p.card_id)?.name ?? "Card" : p.account_id ? ds.accounts.find((a) => a.id === p.account_id)?.name ?? "Account" : "Choose when paying";

  const add = (type?: string) => {
    setPreset(type ?? null);
    setEditing("new");
  };

  return (
    <>
      <V2PageHeader
        title="Insurance"
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => add()}>
            <span className="sm:hidden">Add</span>
            <span className="hidden sm:inline">Add policy</span>
          </Button>
        }
      />
      {policies.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No policies yet"
          body="Add any policy — health, life, term, vehicle, home, travel or your own kind. Its premium shows up in To Pay, and you get a reminder before each one."
          action={
            <div className="flex max-w-md flex-wrap justify-center gap-2">
              {INSURANCE_KINDS.slice(0, 6).map((k) => (
                <Button key={k.id} size="sm" onClick={() => add(k.id)}>
                  <span aria-hidden>{k.icon}</span> {k.label}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatTile label="Premiums a year" value={yearly} note={`${active.length} active ${active.length === 1 ? "policy" : "policies"}`} />
            <StatTile
              label="Next premium"
              value={soonest?.next?.remaining ?? 0}
              tone={soonest?.next && soonest.next.date < today ? "danger" : undefined}
              note={soonest?.next ? `${soonest.p.name} · ${relativeDays(today, soonest.next.date)}` : "Nothing due"}
            />
            <StatTile label="Life cover" value={lifeCover} note={lifeCover ? "Life + term" : "No life cover added"} />
            <StatTile label="Health cover" value={healthCover} note={healthCover ? "Across health policies" : "No health cover added"} />
          </div>
          <DataTable
            label="Policies"
            rows={rows}
            rowKey={(r) => r.p.id}
            rowClassName={(r) => (r.p.status !== "active" ? "text-ink-3" : undefined)}
            columns={[
              {
                key: "n",
                header: "Policy",
                cell: ({ p }) => {
                  const k = insuranceKind(p.type);
                  return (
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-[16px] sm:inline-flex" aria-hidden>
                        {k.icon}
                      </span>
                      <Cell2
                        main={
                          <>
                            <span className="sm:hidden" aria-hidden>
                              {k.icon}{" "}
                            </span>
                            {p.name}
                          </>
                        }
                        sub={[k.label, p.insurer, p.status !== "active" ? (p.status === "lapsed" ? "Lapsed" : "Closed") : null].filter(Boolean).join(" · ")}
                      />
                    </span>
                  );
                },
              },
              {
                key: "d",
                header: "Next premium",
                cell: ({ p, next }) =>
                  next ? (
                    <span className="block">
                      <span className="block whitespace-nowrap">{formatDate(next.date, "short")}</span>
                      {next.date < today ? <StatusText status="late" /> : <span className="block text-[12px] text-ink-3">{relativeDays(today, next.date)}</span>}
                    </span>
                  ) : (
                    <span className="text-ink-3">{p.status !== "active" ? "—" : p.frequency === "once" ? "Paid" : "Not set"}</span>
                  ),
              },
              {
                key: "a",
                header: "Premium",
                align: "right",
                cell: ({ p }) => (
                  <span className="block">
                    <Money value={p.premium} className="font-semibold" />
                    <span className="block text-[11.5px] text-ink-3">{p.frequency === "once" ? "single" : frequencyLabel(p.frequency).replace("Every ", "per ").replace("per 3 months", "quarterly").replace("per 6 months", "half-yearly")}</span>
                  </span>
                ),
              },
            ]}
            details={({ p, next }) => {
              const k = insuranceKind(p.type);
              const ev = next ? events.find((e) => e.key === next.key) : null;
              return (
                <Details
                  items={[
                    [k.coverLabel, p.sum_assured ? <Money key="c" value={p.sum_assured} /> : "—"],
                    ["Covers", p.insured || "—"],
                    ["Policy no.", p.policy_number || "—"],
                    ["Nominee", p.nominee || "—"],
                    ["Paid from", paidFrom(p)],
                    ["Repeats", frequencyLabel(p.frequency)],
                    ["Started", p.start_date ? formatDate(p.start_date) : "—"],
                    ["Ends / renews", p.end_date ? formatDate(p.end_date) : "—"],
                    [
                      "Reminder",
                      p.notify ? (
                        <span key="r" className="inline-flex items-center gap-1">
                          <Bell className="h-3.5 w-3.5" aria-hidden /> {formatTime(p.notify_time)}
                          {p.notify_days_before ? `, ${p.notify_days_before}d before` : ", on the day"}
                        </span>
                      ) : (
                        <span key="r" className="inline-flex items-center gap-1 text-ink-3">
                          <BellOff className="h-3.5 w-3.5" aria-hidden /> Off
                        </span>
                      ),
                    ],
                  ]}
                  actions={
                    <>
                      {ev && (
                        <Button size="sm" variant="primary" onClick={() => useUI.getState().openEvent(ev.key, "settle")}>
                          Mark premium paid
                        </Button>
                      )}
                      <Button size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(p)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setRemoving(p)}>
                        Delete
                      </Button>
                    </>
                  }
                >
                  {p.notes && <p className="mt-2 text-[13px] text-ink-2">{p.notes}</p>}
                </Details>
              );
            }}
          />
          <p className="mt-2 hidden text-[12.5px] text-ink-3 lg:block">
            Premiums are listed in To Pay and the calendar like your other bills ({ctx.currency} amounts as you entered them). The reminder moves to the next premium once one is paid.
          </p>
        </>
      )}
      <PolicyEditorSheet open={editing != null} policy={editing === "new" ? null : editing} presetType={preset} onClose={() => setEditing(null)} />
      <ConfirmSheet
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title={removing ? `Delete ${removing.name}?` : ""}
        confirmLabel="Delete policy"
        body="This removes the policy, its upcoming premiums and its reminder. Premiums you've already paid stay in your history. If the policy has simply ended, edit it and mark it Closed instead."
        onConfirm={async () => {
          if (removing) await deletePolicy(removing);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

const DAYS_BEFORE = [0, 1, 3, 7, 15, 30];

function PolicyEditorSheet({ open, onClose, policy, presetType }: { open: boolean; onClose: () => void; policy: InsurancePolicy | null; presetType: string | null }) {
  const { ds, today, ctx } = useFinance();
  const [type, setType] = useState("health");
  const [customType, setCustomType] = useState("");
  const [name, setName] = useState("");
  const [insurer, setInsurer] = useState("");
  const [policyNo, setPolicyNo] = useState("");
  const [insured, setInsured] = useState("");
  const [nominee, setNominee] = useState("");
  const [cover, setCover] = useState<number | null>(null);
  const [premium, setPremium] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<PremiumFrequency>("yearly");
  const [due, setDue] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [payFrom, setPayFrom] = useState("");
  const [notify, setNotify] = useState(true);
  const [time, setTime] = useState("09:00");
  const [before, setBefore] = useState(3);
  const [status, setStatus] = useState<InsurancePolicy["status"]>("active");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const p = policy;
    const preset = INSURANCE_KINDS.some((k) => k.id === p?.type) ? p!.type : p ? "custom" : presetType ?? "health";
    setType(preset);
    setCustomType(preset === "custom" ? p!.type : "");
    setName(p?.name ?? "");
    setInsurer(p?.insurer ?? "");
    setPolicyNo(p?.policy_number ?? "");
    setInsured(p?.insured ?? "");
    setNominee(p?.nominee ?? "");
    setCover(p?.sum_assured ?? null);
    setPremium(p?.premium ?? null);
    setFrequency(p?.frequency ?? "yearly");
    setDue(p?.premium_due_date ?? "");
    setStart(p?.start_date ?? "");
    setEnd(p?.end_date ?? "");
    setPayFrom(p?.card_id ? `card:${p.card_id}` : p?.account_id ? `acct:${p.account_id}` : "");
    setNotify(p?.notify ?? true);
    setTime(p?.notify_time ?? "09:00");
    setBefore(p?.notify_days_before ?? 3);
    setStatus(p?.status ?? "active");
    setNotes(p?.notes ?? "");
    setError(null);
  }, [open, policy, presetType]);

  const kind = insuranceKind(type === "custom" ? customType : type);
  const accounts = ds.accounts.filter((a) => !a.archived);
  const cards = ds.credit_cards.filter((c) => !c.archived);

  async function save() {
    const t = type === "custom" ? customType.trim() : type;
    if (!name.trim()) return setError("Give the policy a name.");
    if (!t) return setError("Say what kind of insurance it is.");
    if ((premium ?? 0) > 0 && !due && status === "active") return setError("Add the date the next premium is due — that's when you'll be reminded.");
    if (start && end && end < start) return setError("The end date is before the start date.");
    setBusy(true);
    try {
      await savePolicy(
        {
          name: name.trim(),
          type: t,
          insurer: insurer.trim() || null,
          policy_number: policyNo.trim() || null,
          insured: insured.trim() || null,
          nominee: nominee.trim() || null,
          sum_assured: cover ?? null,
          premium: premium ?? 0,
          frequency,
          premium_due_date: due || null,
          start_date: start || null,
          end_date: end || null,
          account_id: payFrom.startsWith("acct:") ? payFrom.slice(5) : null,
          card_id: payFrom.startsWith("card:") ? payFrom.slice(5) : null,
          notify,
          notify_time: time || "09:00",
          notify_days_before: before,
          status,
          notes: notes.trim() || null,
        },
        policy,
      );
      onClose();
    } catch {
      /* the store already showed why */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={policy ? `Edit ${policy.name}` : "Add a policy"}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={save}>
            {policy ? "Save" : "Add policy"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Kind of insurance">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of insurance">
            {[...INSURANCE_KINDS.filter((k) => k.id !== "other"), { id: "custom", label: "Other…", icon: "✏️" }].map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={type === k.id}
                onClick={() => setType(k.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
                  type === k.id ? "border-inverse bg-inverse text-on-inverse" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                )}
              >
                <span aria-hidden>{k.icon}</span>
                {k.label}
              </button>
            ))}
          </div>
          {type === "custom" && (
            <Input className="mt-2" aria-label="Your kind of insurance" value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="e.g. Pet, Gadget, Cancer care, Fire" maxLength={40} />
          )}
        </Field>
        <Field label="Policy name" htmlFor="ins-name" error={error}>
          <Input id="ins-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${kind.id === "vehicle" ? "Car insurance" : kind.id === "term" ? "Term plan" : `${kind.label} insurance`}`} maxLength={80} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Insurer" optional htmlFor="ins-insurer">
            <Input id="ins-insurer" value={insurer} onChange={(e) => setInsurer(e.target.value)} placeholder="e.g. Star Health, LIC" maxLength={60} />
          </Field>
          <Field label="Policy number" optional htmlFor="ins-no">
            <Input id="ins-no" value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} maxLength={60} />
          </Field>
          <Field label={kind.id === "vehicle" ? "Vehicle" : "Who's covered"} optional htmlFor="ins-insured">
            <Input id="ins-insured" value={insured} onChange={(e) => setInsured(e.target.value)} placeholder={kind.id === "vehicle" ? "e.g. KA 01 AB 1234" : "e.g. Me, spouse, parents"} maxLength={80} />
          </Field>
          <Field label="Nominee" optional htmlFor="ins-nominee">
            <Input id="ins-nominee" value={nominee} onChange={(e) => setNominee(e.target.value)} maxLength={60} />
          </Field>
        </div>
        <Field label={kind.coverLabel} optional htmlFor="ins-cover">
          <AmountInput id="ins-cover" value={cover} onChange={setCover} currency={ctx.currency} locale={ctx.locale} />
        </Field>

        <div className="rounded-xl border border-line p-3">
          <p className="mb-3 text-[14px] font-semibold">Premium</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Amount" htmlFor="ins-premium">
              <AmountInput id="ins-premium" value={premium} onChange={setPremium} currency={ctx.currency} locale={ctx.locale} />
            </Field>
            <Field label="How often" htmlFor="ins-freq">
              <Select id="ins-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as PremiumFrequency)}>
                {PREMIUM_FREQUENCIES.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Next premium due" htmlFor="ins-due" help={frequency === "once" ? undefined : "Later ones follow from how often you pay."}>
              <DateInput id="ins-due" value={due} min={policy ? undefined : today} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Field label="Paid from" optional htmlFor="ins-from">
              <Select id="ins-from" value={payFrom} onChange={(e) => setPayFrom(e.target.value)}>
                <option value="">Choose when paying</option>
                {accounts.length > 0 && (
                  <optgroup label="Bank accounts">
                    {accounts.map((a) => (
                      <option key={a.id} value={`acct:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {cards.length > 0 && (
                  <optgroup label="Credit cards">
                    {cards.map((c) => (
                      <option key={c.id} value={`card:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>
          </div>
        </div>

        <div className="rounded-xl border border-line p-3">
          <Switch checked={notify} onChange={setNotify} label="Remind me about the premium" help="Rings on this device at the time below, and on your phone even when the app is closed if alarms are on." />
          {notify && (
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="At" htmlFor="ins-time">
                <Input id="ins-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" />
              </Field>
              <Field label="When" htmlFor="ins-before">
                <Select id="ins-before" value={String(before)} onChange={(e) => setBefore(Number(e.target.value))}>
                  {DAYS_BEFORE.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? "On the due date" : `${d} day${d === 1 ? "" : "s"} before`}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Policy started" optional htmlFor="ins-start">
            <DateInput id="ins-start" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Ends / renews on" optional htmlFor="ins-end" help="Premiums stop after this date.">
            <DateInput id="ins-end" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {policy && (
          <Field label="Status" htmlFor="ins-status" help={status !== "active" ? "No more premiums or reminders; past payments stay." : undefined}>
            <Select id="ins-status" value={status} onChange={(e) => setStatus(e.target.value as InsurancePolicy["status"])}>
              <option value="active">Active</option>
              <option value="lapsed">Lapsed</option>
              <option value="closed">Closed / ended</option>
            </Select>
          </Field>
        )}
        <Field label="Notes" optional htmlFor="ins-notes">
          <Textarea id="ins-notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" placeholder="Agent's number, claim helpline, what's not covered…" />
        </Field>
        {paysPremium({ ...(policy ?? ({} as InsurancePolicy)), status, premium: premium ?? 0, premium_due_date: due || null }) && (
          <p className="text-[12.5px] text-ink-3">The premium will show in To Pay and the calendar like your other bills.</p>
        )}
      </div>
    </Sheet>
  );
}
