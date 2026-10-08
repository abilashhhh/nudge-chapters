"use client";

import { ArrowLeft, ArrowRight, Check, Pencil, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Field, Input, NumberInput, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { Brand } from "@/components/brand";
import { APP_NAME } from "@/lib/config";
import { buildDemoDataset } from "@/lib/data/demo";
import { makeBackup, restoreBackup } from "@/lib/data/io";
import { formatDate } from "@/lib/dates";
import { DEFAULT_CATEGORIES, FREQUENCY_LABEL, INVESTMENT_TYPE_LABEL, LOAN_TYPE_LABEL, resolveAssumptions } from "@/lib/engine/defaults";
import { project } from "@/lib/engine/projection";
import { useFinance } from "@/lib/finance";
import { CURRENCIES } from "@/lib/forms";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI, type EditorKind } from "@/lib/ui";

interface Step {
  id: string;
  title: string;
  why: string;
}

const STEPS: Step[] = [
  { id: "profile", title: "About you", why: "Sets your currency, number format and time zone so dates and amounts look right." },
  { id: "income", title: "Income", why: "Salary and other regular income — the start of every projection." },
  { id: "accounts", title: "Bank accounts & cash", why: "Today's balances. Everything else is calculated forward from here." },
  { id: "recurring", title: "Monthly expenses", why: "Rent, family support, bills, subscriptions and spending budgets. Enter them once; they repeat automatically." },
  { id: "cards", title: "Credit cards", why: "Statement and due dates let Nudge Chapters predict every card bill." },
  { id: "loans", title: "Loans & EMIs", why: "Nudge Chapters builds the full repayment schedule and plans each EMI." },
  { id: "chits", title: "Chits", why: "Installments, payout and what you owe afterwards." },
  { id: "investments", title: "Investments", why: "Mutual funds, stocks, FDs, gold. SIPs are planned every month." },
  { id: "retirement", title: "EPF & retirement", why: "Your EPF passbook balance and monthly contributions, plus PPF or NPS." },
  { id: "lending", title: "Money lent or borrowed", why: "Money someone owes you is an asset; money you owe is a debt." },
  { id: "goals", title: "Goals", why: "What you're saving for, so Nudge Chapters can tell you if you're on track." },
  { id: "assumptions", title: "Assumptions", why: "How fast your salary, expenses and investments are likely to grow." },
  { id: "review", title: "Your first projection", why: "Here's where you stand and where you're heading." },
];

export default function OnboardingPage() {
  const { ds } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const updateProfile = useStore((s) => s.updateProfile);
  const addMany = useStore((s) => s.addMany);
  const router = useRouter();
  const [step, setStep] = useState(Math.min(ds.profile.preferences?.onboardingStep ?? 0, STEPS.length - 1));
  const seeded = useRef(false);

  // Default categories on first run.
  useEffect(() => {
    if (seeded.current || ds.categories.length) return;
    seeded.current = true;
    void addMany("categories", DEFAULT_CATEGORIES.map((c) => ({ ...c, archived: false })));
  }, [ds.categories.length, addMany]);

  const go = (n: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, n));
    setStep(next);
    void updatePrefs({ onboardingStep: next });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const finish = async () => {
    await updateProfile({ onboarding_done: true, preferences: { ...ds.profile.preferences, onboardingStep: 0 } });
    router.replace("/");
  };
  const s = STEPS[step];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Brand size="sm" />
          <button type="button" className="text-[13.5px] text-ink-2 hover:text-ink" onClick={finish}>
            Skip setup
          </button>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <ol className="flex gap-1" aria-label="Setup progress">
            {STEPS.map((x, i) => (
              <li key={x.id} className="flex-1">
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Step ${i + 1}: ${x.title}${i < step ? " (done)" : ""}`}
                  aria-current={i === step ? "step" : undefined}
                  className={cn("h-1.5 w-full rounded-full", i < step ? "bg-brand" : i === step ? "bg-future" : "bg-line")}
                />
              </li>
            ))}
          </ol>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6">
        <p className="text-[13px] font-medium text-ink-3">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="display mt-1 text-[30px] font-semibold leading-tight sm:text-[36px]">{s.title}</h1>
        <p className="mt-1 max-w-xl text-[14.5px] text-ink-2">{s.why}</p>
        <div className="mt-6">
          <StepBody id={s.id} onFinish={finish} />
        </div>
      </main>
      <footer className="pb-safe fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => go(step - 1)} disabled={step === 0}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <div className="flex gap-2">
              {step > 0 && (
                <Button variant="ghost" onClick={() => go(step + 1)}>
                  Skip
                </Button>
              )}
              <Button variant="primary" onClick={() => go(step + 1)}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={finish}>
              Go to my dashboard
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function StepBody({ id, onFinish }: { id: string; onFinish: () => void }) {
  switch (id) {
    case "profile":
      return <ProfileStep onFinish={onFinish} />;
    case "income":
      return (
        <ListStep
          kind="rule"
          items={(ds) => ds.recurring_rules.filter((r) => r.kind === "income").map((r) => ({ id: r.id, title: r.name, sub: `${formatMoney(r.amount, ds.ctx)} · ${FREQUENCY_LABEL[r.frequency]}` }))}
          addLabel="Add income"
          preset={{ kind: "income", name: "Salary", category: "Salary", day_of_month: 1 }}
          quick={[
            { label: "Salary", preset: { kind: "income", name: "Salary", category: "Salary", day_of_month: 1 } },
            { label: "Freelance / side income", preset: { kind: "income", name: "Freelance", category: "Freelance", certainty: "expected", is_fixed: false } },
            { label: "Rental income", preset: { kind: "income", name: "Rent received", category: "Rental income" } },
            { label: "Yearly bonus", preset: { kind: "income", name: "Annual bonus", category: "Bonus", frequency: "yearly", certainty: "uncertain" } },
          ]}
        />
      );
    case "accounts":
      return (
        <ListStep
          kind="account"
          items={(ds) => ds.accounts.map((a) => ({ id: a.id, title: a.name, sub: `${formatMoney(ds.positions.accounts.get(a.id)?.balance ?? a.opening_balance, ds.ctx)} · ${a.type}` }))}
          addLabel="Add account"
          quick={[
            { label: "Savings account", preset: { type: "savings", name: "Savings account" } },
            { label: "Salary account", preset: { type: "savings", name: "Salary account" } },
            { label: "Cash in wallet", preset: { type: "cash", name: "Cash" } },
            { label: "UPI wallet", preset: { type: "wallet", name: "Wallet" } },
            { label: "Emergency fund account", preset: { type: "savings", name: "Emergency fund", include_in_cash: false, is_emergency_fund: true } },
          ]}
        />
      );
    case "recurring":
      return (
        <ListStep
          kind="rule"
          items={(ds) => ds.recurring_rules.filter((r) => r.kind !== "income").map((r) => ({ id: r.id, title: r.name, sub: `${formatMoney(r.amount, ds.ctx)} · ${FREQUENCY_LABEL[r.frequency]}${!r.is_fixed && r.kind === "expense" ? " · budget" : ""}` }))}
          addLabel="Add expense"
          preset={{ kind: "expense" }}
          quick={[
            { label: "Rent", preset: { kind: "expense", name: "Rent", category: "Rent", is_essential: true, day_of_month: 5 } },
            { label: "Family support", preset: { kind: "expense", name: "Family support", category: "Family support", is_essential: true } },
            { label: "Groceries budget", preset: { kind: "expense", name: "Groceries", category: "Groceries", is_fixed: false, is_essential: true, day_of_month: 1 } },
            { label: "Food & dining budget", preset: { kind: "expense", name: "Eating out", category: "Food & dining", is_fixed: false, day_of_month: 1 } },
            { label: "Fuel budget", preset: { kind: "expense", name: "Fuel", category: "Fuel", is_fixed: false, is_essential: true, day_of_month: 1 } },
            { label: "Electricity", preset: { kind: "expense", name: "Electricity", category: "Utilities", is_essential: true } },
            { label: "Mobile & internet", preset: { kind: "expense", name: "Mobile & internet", category: "Mobile & internet", is_essential: true, is_subscription: true } },
            { label: "Streaming subscription", preset: { kind: "expense", name: "Netflix", category: "Subscriptions", is_subscription: true } },
            { label: "Insurance premium", preset: { kind: "expense", name: "Health insurance", category: "Insurance", frequency: "yearly", is_essential: true } },
            { label: "Move to savings", preset: { kind: "transfer", name: "Monthly savings transfer" } },
          ]}
        />
      );
    case "cards":
      return (
        <ListStep
          kind="card"
          items={(ds) => ds.credit_cards.map((c) => ({ id: c.id, title: c.name, sub: `Statement on ${c.statement_day}, due on ${c.due_day} · ${formatMoney(ds.positions.cards.get(c.id)?.outstanding ?? 0, ds.ctx)} owed` }))}
          addLabel="Add credit card"
        />
      );
    case "loans":
      return (
        <ListStep
          kind="loan"
          items={(ds) => ds.loans.map((l) => ({ id: l.id, title: l.name, sub: `${LOAN_TYPE_LABEL[l.type]} · ${formatMoney(ds.positions.loans.get(l.id)?.state.emi ?? 0, ds.ctx)}/month · ${formatMoney(ds.positions.loans.get(l.id)?.state.outstanding ?? 0, ds.ctx)} left` }))}
          addLabel="Add loan or EMI"
          quick={[
            { label: "Home loan", preset: { type: "home", name: "Home loan", interest_rate: 8.6, tenure_months: 240 } },
            { label: "Vehicle loan", preset: { type: "vehicle", name: "Vehicle loan", interest_rate: 9.5, tenure_months: 60 } },
            { label: "Personal loan", preset: { type: "personal", name: "Personal loan", interest_rate: 12, tenure_months: 36 } },
            { label: "Education loan", preset: { type: "education", name: "Education loan", interest_rate: 9, tenure_months: 84 } },
            { label: "Card EMI / no-cost EMI", preset: { type: "card_emi", name: "Card EMI", interest_rate: 0, tenure_months: 6 } },
          ]}
        />
      );
    case "chits":
      return <ListStep kind="chit" items={(ds) => ds.chits.map((c) => ({ id: c.id, title: c.name, sub: `${formatMoney(c.chit_value, ds.ctx)} · ${formatMoney(c.monthly_contribution, ds.ctx)} × ${c.installments}` }))} addLabel="Add chit" />;
    case "investments":
      return (
        <ListStep
          kind="investment"
          items={(ds) => ds.investments.filter((i) => !["epf", "ppf", "nps"].includes(i.type)).map((i) => ({ id: i.id, title: i.name, sub: `${INVESTMENT_TYPE_LABEL[i.type]} · ${formatMoney(ds.positions.investments.get(i.id)?.value ?? 0, ds.ctx)}${i.sip_active ? ` · SIP ${formatMoney(i.sip_amount, ds.ctx)}` : ""}` }))}
          addLabel="Add investment"
          quick={[
            { label: "Mutual fund / SIP", preset: { type: "mutual_fund", asset_class: "equity" } },
            { label: "Stocks", preset: { type: "stock", asset_class: "equity" } },
            { label: "Fixed deposit", preset: { type: "fd", asset_class: "debt" } },
            { label: "Gold / SGB", preset: { type: "gold", asset_class: "gold" } },
            { label: "Property", preset: { type: "real_estate", asset_class: "real_estate" } },
            { label: "Vehicle", preset: { type: "vehicle", asset_class: "other", expected_return: -12 } },
          ]}
        />
      );
    case "retirement":
      return (
        <ListStep
          kind="investment"
          items={(ds) => ds.investments.filter((i) => ["epf", "ppf", "nps"].includes(i.type)).map((i) => ({ id: i.id, title: i.name, sub: `${INVESTMENT_TYPE_LABEL[i.type]} · ${formatMoney(ds.positions.investments.get(i.id)?.value ?? 0, ds.ctx)}` }))}
          addLabel="Add EPF"
          preset={{ type: "epf", asset_class: "debt", name: "EPF" }}
          quick={[
            { label: "EPF", preset: { type: "epf", asset_class: "debt", name: "EPF" } },
            { label: "PPF", preset: { type: "ppf", asset_class: "debt", name: "PPF", interest_rate: 7.1 } },
            { label: "NPS", preset: { type: "nps", asset_class: "hybrid", name: "NPS" } },
          ]}
          note="Find your EPF balance in the EPFO passbook or UMANG app. Nudge Chapters never fetches it automatically."
        />
      );
    case "lending":
      return (
        <ListStep
          kind="lending"
          items={(ds) => ds.lendings.map((l) => ({ id: l.id, title: l.person, sub: `${l.direction === "lent" ? "Owes you" : "You owe"} ${formatMoney(ds.positions.lendings.get(l.id)?.outstanding ?? l.amount, ds.ctx)}` }))}
          addLabel="Add"
          quick={[
            { label: "I lent money", preset: { direction: "lent" } },
            { label: "I borrowed money", preset: { direction: "borrowed" } },
          ]}
        />
      );
    case "goals":
      return (
        <ListStep
          kind="goal"
          items={(ds) => ds.goals.map((g) => ({ id: g.id, title: g.name, sub: `${formatMoney(g.target_amount, ds.ctx)}${g.target_date ? ` by ${formatDate(g.target_date)}` : ""}` }))}
          addLabel="Add goal"
          quick={[
            { label: "Emergency fund", preset: { kind: "emergency", name: "Emergency fund", priority: 1 } },
            { label: "House down payment", preset: { kind: "house", name: "House down payment" } },
            { label: "Vehicle", preset: { kind: "vehicle", name: "New vehicle" } },
            { label: "Travel", preset: { kind: "travel", name: "Holiday" } },
            { label: "Education", preset: { kind: "education", name: "Education" } },
            { label: "Retirement", preset: { kind: "retirement", name: "Retirement", priority: 1 } },
          ]}
        />
      );
    case "assumptions":
      return <AssumptionsStep />;
    case "review":
      return <ReviewStep />;
    default:
      return null;
  }
}

function ProfileStep({ onFinish }: { onFinish: () => void }) {
  const { ds } = useFinance();
  const updateProfile = useStore((s) => s.updateProfile);
  const repo = useStore((s) => s.repo);
  const load = useStore((s) => s.load);
  const p = ds.profile;
  const [name, setName] = useState(p.name ?? "");
  const [busy, setBusy] = useState(false);
  const empty = ds.accounts.length === 0 && ds.transactions.length === 0;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface p-5">
        <Field label="Your name" htmlFor="ob-name" className="col-span-2">
          <Input id="ob-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => updateProfile({ name })} autoFocus />
        </Field>
        <Field label="Currency" htmlFor="ob-cur">
          <Select id="ob-cur" value={p.currency} onChange={(e) => updateProfile({ currency: e.target.value, locale: e.target.value === "INR" ? "en-IN" : p.locale === "en-IN" ? "en-US" : p.locale })}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Time zone" htmlFor="ob-tz">
          <Select id="ob-tz" value={p.timezone} onChange={(e) => updateProfile({ timezone: e.target.value })}>
            {["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"].map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Birth year" htmlFor="ob-by" optional help="For retirement planning">
          <NumberInput id="ob-by" value={p.birth_year ?? ""} placeholder="1995" onChange={(e) => updateProfile({ birth_year: e.target.value ? Number(e.target.value) : null })} />
        </Field>
        <Field label="Retire at" htmlFor="ob-ra">
          <NumberInput id="ob-ra" value={p.retirement_age} onChange={(e) => e.target.value && updateProfile({ retirement_age: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-[15px] font-semibold">How much do you want to see?</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["simple", "Simple", "Dashboard, cash flow, accounts, bills and goals."],
              ["advanced", "Advanced", "Adds scenarios, what-ifs, retirement and debt planning, detailed reports."],
            ] as const
          ).map(([id, label, body]) => (
            <button
              key={id}
              type="button"
              onClick={() => updateProfile({ mode: id })}
              aria-pressed={p.mode === id}
              className={cn("rounded-xl border p-4 text-left", p.mode === id ? "border-future bg-future-soft" : "border-line hover:border-line-strong")}
            >
              <p className="font-semibold">{label}</p>
              <p className="mt-0.5 text-[13px] text-ink-2">{body}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">You can switch any time in Settings.</p>
      </div>
      {empty && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-future/50 bg-future-soft/50 p-5">
          <div>
            <p className="font-semibold">Just exploring?</p>
            <p className="text-[13.5px] text-ink-2">Fill {APP_NAME} with a realistic sample profile. You can delete it later in Settings.</p>
          </div>
          <Button
            icon={<Sparkles className="h-4 w-4 text-future" />}
            loading={busy}
            onClick={async () => {
              if (!repo) return;
              setBusy(true);
              try {
                const demo = buildDemoDataset();
                const backup = makeBackup(demo);
                backup.profile = { ...backup.profile, name: p.name || demo.profile.name };
                await restoreBackup(repo, backup, undefined, ds);
                await load();
                toast.success("Sample data added");
                onFinish();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Use sample data
          </Button>
        </div>
      )}
    </div>
  );
}

type Ctx = ReturnType<typeof useFinance>["ds"] & { ctx: ReturnType<typeof useFinance>["ctx"]; positions: ReturnType<typeof useFinance>["positions"] };

function ListStep({
  kind,
  items,
  addLabel,
  preset,
  quick,
  note,
}: {
  kind: EditorKind;
  items: (ds: Ctx) => { id: string; title: string; sub: string }[];
  addLabel: string;
  preset?: Record<string, unknown>;
  quick?: { label: string; preset: Record<string, unknown> }[];
  note?: ReactNode;
}) {
  const f = useFinance();
  const list = items({ ...f.ds, ctx: f.ctx, positions: f.positions });
  const open = (id?: string, p?: Record<string, unknown>) => useUI.getState().openEditor(kind, id, p);
  return (
    <div className="flex flex-col gap-4">
      {list.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {list.map((it) => (
            <li key={it.id}>
              <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2" onClick={() => open(it.id)}>
                <Check className="h-4 w-4 shrink-0 text-ok" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">{it.title}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">{it.sub}</span>
                </span>
                <Pencil className="h-4 w-4 text-ink-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {quick && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">{list.length ? "Add another" : "Quick start"}</p>
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => (
              <button key={q.label} type="button" onClick={() => open(undefined, q.preset)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-[13.5px] hover:border-line-strong">
                <Plus className="h-3.5 w-3.5 text-brand" aria-hidden />
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <Button className="self-start" variant={list.length ? "secondary" : "primary"} icon={<Plus className="h-4 w-4" />} onClick={() => open(undefined, preset)}>
        {addLabel}
      </Button>
      {note && <p className="text-[12.5px] text-ink-3">{note}</p>}
      {!list.length && <p className="text-[13px] text-ink-3">Nothing to add? Skip this step — you can always add it later.</p>}
    </div>
  );
}

function AssumptionsStep() {
  const { ds } = useFinance();
  const updateProfile = useStore((s) => s.updateProfile);
  const a = resolveAssumptions(ds.profile);
  const base = a.scenarios.base;
  const set = (patch: Partial<typeof base>) => updateProfile({ assumptions: { ...a, scenarios: { ...a.scenarios, base: { ...base, ...patch } } } });
  return (
    <div className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-surface p-5 md:grid-cols-3">
      <Field label="Salary growth %/yr" htmlFor="as1">
        <NumberInput id="as1" value={base.salaryGrowth} step="0.5" onChange={(e) => set({ salaryGrowth: Number(e.target.value) || 0 })} />
      </Field>
      <Field label="Expense growth %/yr" htmlFor="as2">
        <NumberInput id="as2" value={base.expenseGrowth} step="0.5" onChange={(e) => set({ expenseGrowth: Number(e.target.value) || 0 })} />
      </Field>
      <Field label="Inflation %" htmlFor="as3">
        <NumberInput id="as3" value={a.inflation} step="0.5" onChange={(e) => updateProfile({ assumptions: { ...a, inflation: Number(e.target.value) || 0 } })} />
      </Field>
      <Field label="Equity returns %" htmlFor="as4">
        <NumberInput id="as4" value={base.returns.equity} step="0.5" onChange={(e) => set({ returns: { ...base.returns, equity: Number(e.target.value) || 0 } })} />
      </Field>
      <Field label="Debt / FD returns %" htmlFor="as5">
        <NumberInput id="as5" value={base.returns.debt} step="0.5" onChange={(e) => set({ returns: { ...base.returns, debt: Number(e.target.value) || 0 } })} />
      </Field>
      <Field label="EPF interest %" htmlFor="as6">
        <NumberInput id="as6" value={base.returns.epf} step="0.05" onChange={(e) => set({ returns: { ...base.returns, epf: Number(e.target.value) || 0 } })} />
      </Field>
      <p className="col-span-full text-[12.5px] text-ink-3">These are your base case. Conservative and optimistic scenarios are set around them — fine-tune later under Future → Assumptions.</p>
    </div>
  );
}

function ReviewStep() {
  const { ds, today, positions, assumptions, month } = useFinance();
  const yearEnd = `${Number(today.slice(0, 4)) + (today.slice(5, 7) >= "10" ? 1 : 0)}-12-31`;
  const res = useMemo(() => project(ds, { today, to: yearEnd, positions, assumptions }), [ds, today, yearEnd, positions, assumptions]);
  const t = positions.totals;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-[13px] text-ink-3">Safe to spend this month</p>
        <Money value={month.spendable} className="display text-[34px] font-semibold" />
        <p className="mt-1 text-[13px] text-ink-2">after {formatMoney(month.committedPending, { currency: ds.profile.currency, locale: ds.profile.locale })} of bills still due</p>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="text-[13px] text-ink-3">Net worth today</p>
        <Money value={t.netWorth} className="display text-[34px] font-semibold" />
        <p className="mt-1 text-[13px] text-ink-2">
          <Money value={t.totalAssets} /> owned · <Money value={t.totalLiabilities} /> owed
        </p>
      </div>
      <div className="rounded-2xl border border-future/40 bg-future-soft/50 p-5 sm:col-span-2">
        <p className="text-[13px] text-future-ink">On {formatDate(yearEnd, "long")} (estimate)</p>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[12.5px] text-ink-3">Cash</p>
            <Money value={res.end.cash} projected className="text-[20px] font-semibold" />
          </div>
          <div>
            <p className="text-[12.5px] text-ink-3">Investments</p>
            <Money value={res.end.investments} projected className="text-[20px] font-semibold" />
          </div>
          <div>
            <p className="text-[12.5px] text-ink-3">Still owed</p>
            <Money value={res.end.liabilities} projected className="text-[20px] font-semibold" />
          </div>
          <div>
            <p className="text-[12.5px] text-ink-3">Net worth</p>
            <Money value={res.end.netWorth} projected className="text-[20px] font-semibold" />
          </div>
        </div>
        {res.negativeOn && <p className="mt-3 text-[13.5px] text-danger">Heads up: cash is projected to go below zero on {formatDate(res.negativeOn)}.</p>}
      </div>
      <p className="text-[13px] text-ink-3 sm:col-span-2">
        Everything updates as you mark bills paid and add transactions. Missing something? Use the Back button or add it any time with the + button.
      </p>
    </div>
  );
}
