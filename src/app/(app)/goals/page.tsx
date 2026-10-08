"use client";

import { Plus, Target } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button, LinkButton } from "@/components/ui/button";
import { AmountInput, Field, NumberInput } from "@/components/ui/form";
import { Badge, EmptyState, KV, Panel, Progress, Segmented, Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { addMonths, formatDate } from "@/lib/dates";
import { firePlan, goalConflicts, monthsToReach, requiredMonthly, retirementPlan, type GoalProgress } from "@/lib/engine/goals";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";

const TABS = ["goals", "emergency", "retirement", "independence"] as const;

export default function GoalsPage() {
  return (
    <Suspense>
      <Goals />
    </Suspense>
  );
}

function Goals() {
  const [tab, setTab] = useTab(TABS, "goals");
  const { advanced } = useFinance();
  return (
    <>
      <PageHeader
        title="Goals"
        description="What you're saving for, whether you're on track, and what it would take."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("goal")}>
            New goal
          </Button>
        }
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        hide={advanced ? [] : ["retirement", "independence"]}
        tabs={[
          { id: "goals", label: "Goals" },
          { id: "emergency", label: "Emergency fund" },
          { id: "retirement", label: "Retirement" },
          { id: "independence", label: "Financial independence" },
        ]}
      />
      {tab === "goals" && <GoalList />}
      {tab === "emergency" && <Emergency />}
      {tab === "retirement" && <RetirementPlanner />}
      {tab === "independence" && <Fire />}
    </>
  );
}

const STATUS_LABEL: Record<GoalProgress["status"], { label: string; tone: "brand" | "future" | "warn" | "neutral" | "danger" }> = {
  done: { label: "Reached", tone: "brand" },
  on_track: { label: "On track", tone: "brand" },
  off_track: { label: "Off track", tone: "warn" },
  no_date: { label: "No deadline", tone: "neutral" },
  not_funded: { label: "Not funded", tone: "danger" },
};

function GoalList() {
  const { goals, norms, ctx } = useFinance();
  const surplus = norms.income - norms.outflow;
  const conflict = goalConflicts(goals, surplus);
  if (!goals.length) {
    return (
      <EmptyState
        icon={Target}
        title="No goals yet"
        body="Emergency fund, a bike, a house down payment, travel, education — set a target and date, and Kosh tells you what to save each month."
        action={<Button variant="primary" onClick={() => useUI.getState().openEditor("goal", undefined, { kind: "emergency", name: "Emergency fund" })}>Start with an emergency fund</Button>}
      />
    );
  }
  const sorted = [...goals].sort((a, b) => a.goal.priority - b.goal.priority);
  return (
    <div className="flex flex-col gap-4">
      {conflict.conflict && (
        <p className="rounded-xl bg-warn-soft px-4 py-3 text-[13.5px] text-warn">
          Your dated goals need about <strong>{formatMoney(conflict.required, ctx)}/month</strong> together, but your plans leave about{" "}
          <strong>{formatMoney(Math.max(0, conflict.surplus), ctx)}/month</strong>. Consider moving a date or lowering a target — high-priority goals first.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sorted.map((g) => (
          <GoalCard key={g.goal.id} g={g} />
        ))}
      </div>
    </div>
  );
}

function GoalCard({ g }: { g: GoalProgress }) {
  const { ds, today, ctx } = useFinance();
  const [whatIf, setWhatIf] = useState(false);
  const [contrib, setContrib] = useState<number | null>(g.goal.monthly_contribution);
  const [delay, setDelay] = useState(0);
  const [rate, setRate] = useState<number>(g.rate);
  const st = STATUS_LABEL[g.status];
  const linked = [
    ...g.goal.linked_account_ids.map((id) => ds.accounts.find((a) => a.id === id)?.name),
    ...g.goal.linked_investment_ids.map((id) => ds.investments.find((i) => i.id === id)?.name),
  ].filter(Boolean);
  const m = whatIf ? monthsToReach(g.goal.target_amount, g.value, contrib ?? 0, rate) : null;
  const newTarget = g.goal.target_date && delay ? addMonths(g.goal.target_date, delay) : g.goal.target_date;
  const reqWhatIf = whatIf && newTarget ? requiredMonthly(g.goal.target_amount, g.value, rate, Math.max(1, (new Date(newTarget).getTime() - new Date(today).getTime()) / (30.44 * 86400000))) : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 text-left" onClick={() => useUI.getState().openEditor("goal", g.goal.id)}>
          <p className="truncate text-[16px] font-semibold hover:underline">{g.goal.name}</p>
          <p className="text-[12.5px] text-ink-3">
            {g.goal.target_date ? `By ${formatDate(g.goal.target_date)}` : "No deadline"} · {["", "High", "Medium", "Low"][g.goal.priority]} priority
          </p>
        </button>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <Money value={g.value} className="display text-[24px] font-semibold" />
        <span className="num text-[13px] text-ink-3">of {formatMoney(g.goal.target_amount, ctx)}</span>
      </div>
      <Progress className="mt-2" value={g.progress} tone={g.status === "off_track" || g.status === "not_funded" ? "warn" : "brand"} label={`${g.goal.name} progress`} />
      <div className="mt-3 divide-y divide-line">
        <KV k="Still needed" v={formatMoney(g.gap, ctx)} />
        <KV k="You put in" v={`${formatMoney(g.goal.monthly_contribution, ctx)}/month`} />
        {g.requiredMonthly != null && g.status !== "done" && <KV k="Needed to hit the date" v={`${formatMoney(g.requiredMonthly, ctx)}/month`} />}
        {g.projectedDate && g.status !== "done" && <KV k="At this pace you'll get there" v={<span className="projected">{formatDate(g.projectedDate)}</span>} />}
        {linked.length > 0 && <KV k="Linked" v={<span className="text-[12.5px]">{linked.join(", ")}</span>} />}
      </div>
      <button type="button" className="mt-3 text-[13px] font-medium text-future-ink hover:underline" onClick={() => setWhatIf(!whatIf)} aria-expanded={whatIf}>
        {whatIf ? "Hide what-if" : "What if…"}
      </button>
      {whatIf && (
        <div className="mt-3 grid gap-3 rounded-xl bg-future-soft/60 p-3 sm:grid-cols-3">
          <Field label="Monthly" htmlFor={`gc-${g.goal.id}`}>
            <AmountInput id={`gc-${g.goal.id}`} value={contrib} onChange={setContrib} />
          </Field>
          <Field label="Delay (months)" htmlFor={`gd-${g.goal.id}`}>
            <NumberInput id={`gd-${g.goal.id}`} value={delay} min={0} onChange={(e) => setDelay(Number(e.target.value) || 0)} />
          </Field>
          <Field label="Return %" htmlFor={`gr-${g.goal.id}`}>
            <NumberInput id={`gr-${g.goal.id}`} value={rate} step="0.5" onChange={(e) => setRate(Number(e.target.value) || 0)} />
          </Field>
          <p className="text-[13px] text-future-ink sm:col-span-3">
            {m == null ? "Never at this pace." : `Reached around ${formatDate(addMonths(today, m))}.`}
            {reqWhatIf != null && newTarget ? ` To hit ${formatDate(newTarget, "short")}: ${formatMoney(reqWhatIf, ctx)}/month.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}

function Emergency() {
  const { ef, ds, norms, positions, today, ctx } = useFinance();
  const updatePrefs = useStore((s) => s.updatePrefs);
  const months = ds.profile.preferences?.emergencyMonths ?? 6;
  const runway = positions.totals.cash + ef.current > 0 && norms.essentialOutflow > 0 ? (positions.totals.cash + (ds.accounts.find((a) => a.is_emergency_fund && !a.include_in_cash) ? ef.current : 0)) / norms.essentialOutflow : null;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Panel title="Emergency fund" description="Money kept aside for job loss, medical bills or urgent repairs — separate from everyday savings.">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Money value={ef.current} className="display text-[34px] font-semibold" />
            <p className="text-[13px] text-ink-3">covers {ef.coverageMonths.toFixed(1)} months of essentials</p>
          </div>
          <Segmented
            size="sm"
            options={[3, 6, 9, 12].map((n) => ({ id: String(n), label: `${n} mo` }))}
            value={String(months)}
            onChange={(v) => updatePrefs({ emergencyMonths: Number(v) })}
          />
        </div>
        <Progress className="mt-4" value={ef.progress} tone={ef.progress >= 1 ? "brand" : "future"} label="Emergency fund progress" />
        <div className="mt-4 divide-y divide-line">
          <KV k="Essential spending each month" v={formatMoney(ef.essentialMonthly, ctx)} />
          <KV k={`Target (${months} months)`} v={formatMoney(ef.target, ctx)} />
          <KV k="Still to set aside" v={formatMoney(Math.max(0, ef.target - ef.current), ctx)} />
          <KV k="Reached" v={ef.progress >= 1 ? "Already there" : ef.reachDate ? <span className="projected">{formatDate(ef.reachDate)}</span> : "Add a monthly contribution to an emergency goal"} />
        </div>
        {ef.sources.length > 0 && (
          <p className="mt-3 text-[12.5px] text-ink-3">
            Counted from: {ef.sources.map((s) => s.name).join(", ")}. Mark an account as your emergency fund in its settings, or link it to an Emergency goal.
          </p>
        )}
        {ef.essentialMonthly === 0 && <p className="mt-3 text-[12.5px] text-warn">Mark recurring expenses as essential (rent, groceries, EMIs…) to calculate a target.</p>}
      </Panel>
      <Panel title="If your salary stopped today">
        <p className="text-[14px] text-ink-2">
          Your available cash{ds.accounts.some((a) => a.is_emergency_fund && !a.include_in_cash) ? " plus your emergency fund" : ""} would cover essential outflows (including EMIs and chits) for about
        </p>
        <p className="display mt-2 text-[34px] font-semibold">{runway == null ? "—" : `${runway.toFixed(1)} months`}</p>
        <p className="mt-2 text-[12.5px] text-ink-3">
          Essentials: {formatMoney(norms.essentialOutflow, ctx)}/month. Try the what-if simulator for a full &ldquo;job loss&rdquo; projection.
        </p>
        <LinkButton className="mt-3" size="sm" href={`/projection?tab=whatif&preset=jobloss&from=${today}`}>
          Simulate 6 months without salary
        </LinkButton>
      </Panel>
    </div>
  );
}

function RetirementPlanner() {
  const { ds, positions, norms, today, ctx } = useFinance();
  const updateProfile = useStore((s) => s.updateProfile);
  const [spend, setSpend] = useState<number | null>(null);
  const [ret, setRet] = useState<number | null>(null);
  const [includeAll, setIncludeAll] = useState(false);
  const plan = useMemo(
    () => retirementPlan(ds, positions, norms, today, { monthlySpend: spend ?? undefined, expectedReturn: ret ?? undefined, includeAllInvestments: includeAll }),
    [ds, positions, norms, today, spend, ret, includeAll],
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Panel title="Your assumptions">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Born in" htmlFor="rp-by">
              <NumberInput id="rp-by" value={ds.profile.birth_year ?? ""} placeholder="1995" onChange={(e) => updateProfile({ birth_year: e.target.value ? Number(e.target.value) : null })} />
            </Field>
            <Field label="Retire at" htmlFor="rp-ra">
              <NumberInput id="rp-ra" value={ds.profile.retirement_age} onChange={(e) => e.target.value && updateProfile({ retirement_age: Number(e.target.value) })} />
            </Field>
            <Field label="Plan until" htmlFor="rp-le">
              <NumberInput id="rp-le" value={ds.profile.life_expectancy} onChange={(e) => e.target.value && updateProfile({ life_expectancy: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="Monthly spending in retirement (today's money)" help={`Defaults to your current spending: ${formatMoney(plan.monthlySpendToday, ctx)}`} htmlFor="rp-sp">
            <AmountInput id="rp-sp" value={spend ?? plan.monthlySpendToday} onChange={setSpend} />
          </Field>
          <Field label="Expected return before retirement" help={`Weighted from your holdings: ${formatPct(plan.expectedReturn)}`} htmlFor="rp-ret">
            <NumberInput id="rp-ret" value={ret ?? plan.expectedReturn} step="0.25" onChange={(e) => setRet(e.target.value === "" ? null : Number(e.target.value))} />
          </Field>
          <Segmented
            size="sm"
            options={[
              { id: "ret", label: "EPF, PPF & NPS only" },
              { id: "all", label: "All investments" },
            ]}
            value={includeAll ? "all" : "ret"}
            onChange={(v) => setIncludeAll(v === "all")}
          />
        </div>
      </Panel>
      <Panel title="Retirement readiness">
        <div className="flex items-end gap-4">
          <p className={cn("display text-[52px] font-semibold leading-none", plan.readiness >= 100 ? "text-ok" : plan.readiness >= 70 ? "text-future-ink" : "text-warn")}>{Math.round(plan.readiness)}%</p>
          <p className="pb-1 text-[13.5px] text-ink-2">of what you&apos;ll need{plan.currentAge != null ? `, retiring in ${plan.yearsToRetire} years` : ""}</p>
        </div>
        <Progress className="mt-3" value={plan.readiness / 100} tone={plan.readiness >= 100 ? "brand" : "future"} label="Retirement readiness" />
        <div className="mt-4 divide-y divide-line">
          <KV k="Saved for retirement today" v={formatMoney(plan.currentCorpus, ctx)} />
          <KV k="Going in each month" v={formatMoney(plan.monthlyContribution, ctx)} />
          <KV k="Projected corpus at retirement" v={<Money value={plan.projectedCorpus} projected />} />
          <KV k="Corpus you'll need" v={<Money value={plan.requiredCorpus} projected />} />
          <KV k="Monthly spending then (inflation-adjusted)" v={<Money value={plan.monthlySpendAtRetirement} projected />} />
          <KV k="Monthly income the corpus could pay" v={<Money value={plan.monthlyIncomeFromCorpus} projected />} />
          {plan.gap > 0 && <KV k="Extra to invest each month to close the gap" v={<span className="text-warn">{formatMoney(plan.requiredExtraMonthly, ctx)}</span>} />}
        </div>
        {plan.currentAge == null && <p className="mt-3 text-[12.5px] text-warn">Add your birth year for an accurate timeline (assuming age 30 for now).</p>}
        <p className="mt-3 text-[12px] text-ink-3">Estimates. Assumes 7% returns after retirement and your inflation setting; pension (EPS) income isn&apos;t included.</p>
      </Panel>
    </div>
  );
}

function Fire() {
  const { ds, positions, norms, today, ctx } = useFinance();
  const [wr, setWr] = useState(4);
  const [ret, setRet] = useState(10);
  const [spend, setSpend] = useState<number | null>(null);
  const plan = useMemo(() => firePlan(ds, positions, norms, today, { withdrawalRate: wr, expectedReturn: ret, annualSpend: spend ?? undefined }), [ds, positions, norms, today, wr, ret, spend]);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Panel title="Inputs" description="Financial independence = investments that can pay for your life without a salary.">
        <div className="flex flex-col gap-3">
          <Field label="Yearly spending" help="Defaults to your planned spending plus EMIs" htmlFor="fi-sp">
            <AmountInput id="fi-sp" value={spend ?? plan.annualSpend} onChange={setSpend} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Safe withdrawal %" htmlFor="fi-wr">
              <NumberInput id="fi-wr" value={wr} step="0.25" min={1} onChange={(e) => setWr(Number(e.target.value) || 4)} />
            </Field>
            <Field label="Return %" htmlFor="fi-ret">
              <NumberInput id="fi-ret" value={ret} step="0.5" onChange={(e) => setRet(Number(e.target.value) || 0)} />
            </Field>
          </div>
        </div>
      </Panel>
      <Panel title="Where you stand">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[12.5px] text-ink-3">FI number</p>
            <Money value={plan.fiNumber} className="display text-[26px] font-semibold" />
          </div>
          <div>
            <p className="text-[12.5px] text-ink-3">FI ratio</p>
            <p className="display text-[26px] font-semibold">{formatPct(plan.fiRatio * 100, 0)}</p>
          </div>
        </div>
        <Progress className="mt-3" value={plan.fiRatio} tone="future" label="Financial independence progress" />
        <div className="mt-4 divide-y divide-line">
          <KV k="Investable assets (cash + investments)" v={formatMoney(plan.investable, ctx)} />
          <KV k="Monthly surplus going towards it" v={formatMoney(plan.monthlySavings, ctx)} />
          <KV k="Savings rate" v={plan.savingsRate == null ? "—" : formatPct(plan.savingsRate, 0)} />
          <KV k="Years to independence" v={plan.yearsToFI == null ? "Not at this pace" : <span className="projected">{plan.yearsToFI.toFixed(1)} years ({formatDate(plan.fiDate)})</span>} />
          <KV k="Savings rate needed by retirement age" v={plan.requiredSavingsRate == null ? "—" : formatPct(plan.requiredSavingsRate, 0)} />
          <KV k="Coast FI number" v={<span>{formatMoney(plan.coastFiNumber, ctx)} {plan.isCoastFI ? <Badge tone="brand">reached</Badge> : null}</span>} />
        </div>
        <p className="mt-3 text-[12px] text-ink-3">Coast FI: invested enough today that growth alone reaches your FI number by your retirement age. Targets grow with inflation.</p>
      </Panel>
    </div>
  );
}

