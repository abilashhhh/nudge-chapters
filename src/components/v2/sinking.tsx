"use client";

import { Check, PiggyBank, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addMonths, diffDays, formatDate } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { annualPremium } from "@/lib/insurance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { newId } from "@/lib/data/repo";
import type { SinkingFund } from "@/lib/types";
import { Money } from "../money";
import { Button } from "../ui/button";
import { AmountInput, DateInput, Field, Input, Select } from "../ui/form";
import { Sheet } from "../ui/sheet";
import { EmptyState } from "../ui/misc";
import { V2PageHeader } from "./ui";

/** Whole months from today until the due date (at least 1, so the last month still asks for the rest). */
function monthsLeft(today: string, due: string): number {
  return Math.max(1, Math.ceil(diffDays(today, due) / 30.44));
}

/** What to put aside this month so the money's ready by the due date. */
export function monthlyNeed(f: SinkingFund, today: string): number {
  const left = Math.max(0, f.amount - f.saved);
  if (left <= 0) return 0;
  if (f.due <= today) return left;
  return Math.ceil(left / monthsLeft(today, f.due));
}

const EVERY: { v: number; label: string }[] = [
  { v: 12, label: "Every year" },
  { v: 6, label: "Every 6 months" },
  { v: 3, label: "Every 3 months" },
  { v: 0, label: "Just once" },
];

function useFunds() {
  const { ds } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const funds = ds.profile.preferences?.sinkingFunds ?? [];
  const save = (next: SinkingFund[]) => updatePrefs({ sinkingFunds: next });
  return { funds, save };
}

/** Costs your data already knows come once or a few times a year. */
function useSuggestions(existing: SinkingFund[]) {
  const { ds, today } = useFinance();
  return useMemo(() => {
    const have = new Set(existing.map((f) => f.source).filter(Boolean));
    const out: Omit<SinkingFund, "id" | "saved">[] = [];
    for (const p of ds.insurance_policies ?? []) {
      if (p.status !== "active" || !["yearly", "half_yearly", "quarterly"].includes(p.frequency) || have.has(`policy:${p.id}`)) continue;
      const per = annualPremium(p) / (p.frequency === "yearly" ? 1 : p.frequency === "half_yearly" ? 2 : 4);
      out.push({ name: `${p.name} premium`, amount: Math.round(per), due: p.premium_due_date && p.premium_due_date >= today ? p.premium_due_date : addMonths(today, 12), everyMonths: p.frequency === "yearly" ? 12 : p.frequency === "half_yearly" ? 6 : 3, source: `policy:${p.id}` });
    }
    for (const c of ds.credit_cards) {
      if (c.archived || !(c.annual_fee > 0) || have.has(`card:${c.id}`)) continue;
      let due = c.opening_date;
      while (due < today) due = addMonths(due, 12);
      out.push({ name: `${c.name} annual fee`, amount: Math.round(c.annual_fee * 1.18), due, everyMonths: 12, source: `card:${c.id}` });
    }
    for (const r of ds.recurring_rules) {
      if (!r.active || r.kind !== "expense" || !["yearly", "half_yearly"].includes(r.frequency) || have.has(`rule:${r.id}`)) continue;
      let due = r.start_date;
      while (due < today) due = addMonths(due, r.frequency === "yearly" ? 12 : 6);
      out.push({ name: r.name, amount: Math.round(r.amount), due, everyMonths: r.frequency === "yearly" ? 12 : 6, source: `rule:${r.id}` });
    }
    return out;
  }, [ds, today, existing]);
}

const IDEAS = ["School fees", "Festival spending", "Vehicle insurance", "Birthdays & gifts", "Vehicle service", "Holiday trip"];

export function SinkingScreen() {
  const { today, ctx } = useFinance();
  const { funds, save } = useFunds();
  const ideas = useSuggestions(funds);
  const [edit, setEdit] = useState<Partial<SinkingFund> | null>(null);
  const sorted = [...funds].sort((a, b) => (a.due < b.due ? -1 : 1));
  const thisMonth = funds.reduce((s, f) => s + monthlyNeed(f, today), 0);
  const savedAll = funds.reduce((s, f) => s + Math.min(f.saved, f.amount), 0);
  const m = (n: number) => formatMoney(n, ctx);

  const putAside = async (f: SinkingFund, amt: number) => {
    await save(funds.map((x) => (x.id === f.id ? { ...x, saved: Math.round((x.saved + amt) * 100) / 100 } : x)));
    toast.success(`${m(amt)} put aside for ${f.name}`);
  };
  const paid = async (f: SinkingFund) => {
    if (!f.everyMonths) await save(funds.filter((x) => x.id !== f.id));
    else await save(funds.map((x) => (x.id === f.id ? { ...x, saved: Math.max(0, x.saved - x.amount), due: addMonths(x.due, x.everyMonths) } : x)));
    toast.success(f.everyMonths ? `Done — next one ${formatDate(addMonths(f.due, f.everyMonths), "short")}` : "Done");
  };

  return (
    <>
      <V2PageHeader
        title="Sinking funds"
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setEdit({ everyMonths: 12, saved: 0, due: addMonths(today, 6) })}>
            New
          </Button>
        }
      />
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <p className="text-[13.5px] text-ink-2">Costs that come once or a few times a year — insurance, school fees, festivals. Put a little aside every month so the money&apos;s ready when they come.</p>
        {funds.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-inverse px-4 py-3 text-on-inverse">
              <p className="text-[12.5px] opacity-75">Put aside this month</p>
              <Money value={thisMonth} className="text-[22px] font-semibold text-inherit" />
            </div>
            <div className="rounded-2xl border border-line bg-surface px-4 py-3">
              <p className="text-[12.5px] text-ink-3">Saved so far</p>
              <Money value={savedAll} className="text-[22px] font-semibold" />
            </div>
          </div>
        )}

        {funds.length === 0 ? (
          <EmptyState icon={PiggyBank} title="No sinking funds yet" body="Add one for each big cost that comes once a year, or pick one your data already knows below." />
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((f) => {
              const need = monthlyNeed(f, today);
              const pct = f.amount > 0 ? Math.min(100, (f.saved / f.amount) * 100) : 0;
              const ready = f.saved >= f.amount - 0.5;
              return (
                <li key={f.id} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" onClick={() => setEdit(f)} className="min-w-0 text-left">
                      <p className="truncate text-[15px] font-semibold">{f.name}</p>
                      <p className="text-[12.5px] text-ink-3">
                        {m(f.amount)} due {formatDate(f.due, "short")} · {EVERY.find((e) => e.v === f.everyMonths)?.label ?? `Every ${f.everyMonths} months`}
                      </p>
                    </button>
                    <div className="shrink-0 text-right">
                      <Money value={f.saved} className="text-[15px] font-semibold" />
                      <p className="text-[12px] text-ink-3">of {m(f.amount)}</p>
                    </div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                    <div className={ready ? "h-full rounded-full bg-ok" : "h-full rounded-full bg-brand"} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {ready ? (
                      <span className="inline-flex items-center gap-1 text-[13px] font-medium text-ok">
                        <Check className="h-4 w-4" aria-hidden /> Ready
                      </span>
                    ) : (
                      <Button size="sm" variant="primary" onClick={() => void putAside(f, need)}>
                        Put aside {m(need)}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void paid(f)}>
                      Paid it
                    </Button>
                    {!ready && <span className="text-[12px] text-ink-3">{m(need)} a month gets you there</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {(ideas.length > 0 || funds.length < 3) && (
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-[14px] font-semibold">Ideas</h2>
            {ideas.length > 0 && (
              <ul className="mt-2 divide-y divide-line/70">
                {ideas.map((i) => (
                  <li key={i.source} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px]">{i.name}</span>
                      <span className="block text-[12px] text-ink-3">
                        {m(i.amount)} · next {formatDate(i.due, "short")}
                      </span>
                    </span>
                    <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => void save([...funds, { ...i, id: newId(), saved: 0 }]).then(() => toast.success(`${i.name} added`))}>
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {IDEAS.filter((n) => !funds.some((f) => f.name === n)).map((n) => (
                <button key={n} type="button" onClick={() => setEdit({ name: n, everyMonths: 12, saved: 0, due: addMonths(today, 6) })} className="inline-flex items-center gap-1 rounded-full bg-surface-3/70 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 hover:text-ink">
                  <Plus className="h-3.5 w-3.5" aria-hidden /> {n}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      {edit && <FundSheet value={edit} onClose={() => setEdit(null)} funds={funds} save={save} />}
    </>
  );
}

function FundSheet({ value, onClose, funds, save }: { value: Partial<SinkingFund>; onClose: () => void; funds: SinkingFund[]; save: (f: SinkingFund[]) => Promise<void> }) {
  const { ctx } = useFinance();
  const [v, setV] = useState<Partial<SinkingFund>>(value);
  const [busy, setBusy] = useState(false);
  const existing = !!value.id;
  const ok = !!v.name?.trim() && (v.amount ?? 0) > 0 && !!v.due;
  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const f: SinkingFund = { id: v.id ?? newId(), name: v.name!.trim(), amount: v.amount!, due: v.due!, everyMonths: v.everyMonths ?? 12, saved: v.saved ?? 0, source: v.source ?? null };
      await save(existing ? funds.map((x) => (x.id === f.id ? f : x)) : [...funds, f]);
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      size="sm"
      title={existing ? `Edit ${value.name}` : "New sinking fund"}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          {existing ? (
            <Button variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => void save(funds.filter((x) => x.id !== value.id)).then(onClose)}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!ok} onClick={() => void submit()}>
              Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="What for" htmlFor="sf-name">
          <Input id="sf-name" value={v.name ?? ""} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. School fees" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="It costs" htmlFor="sf-amt">
            <AmountInput id="sf-amt" value={v.amount ?? null} onChange={(n) => setV({ ...v, amount: n ?? undefined })} currency={ctx.currency} />
          </Field>
          <Field label="Next due" htmlFor="sf-due">
            <DateInput id="sf-due" value={v.due ?? ""} onChange={(e) => setV({ ...v, due: e.target.value })} />
          </Field>
          <Field label="Comes" htmlFor="sf-every">
            <Select id="sf-every" value={String(v.everyMonths ?? 12)} onChange={(e) => setV({ ...v, everyMonths: Number(e.target.value) })}>
              {EVERY.map((e) => (
                <option key={e.v} value={e.v}>
                  {e.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Saved already" htmlFor="sf-saved" optional>
            <AmountInput id="sf-saved" value={v.saved ?? 0} onChange={(n) => setV({ ...v, saved: n ?? 0 })} currency={ctx.currency} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
