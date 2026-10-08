"use client";

import { ChevronLeft, ChevronRight, Pause, Play, Plus, Repeat, Search, Wallet } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { EventRow, TxRow } from "@/components/event-row";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { DateInput, Input, Select } from "@/components/ui/form";
import { Badge, EmptyState, KV, Panel, Progress, Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { addDays, addMonths, endOfMonth, formatDate, formatMonthLong, monthKey, startOfMonth } from "@/lib/dates";
import { FREQUENCY_LABEL } from "@/lib/engine/defaults";
import { buildEvents, isPending, type FinEvent } from "@/lib/engine/events";
import { classify, isOpening } from "@/lib/engine/ledger";
import { nextOccurrenceAfter, perMonth } from "@/lib/engine/schedule";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";
import type { RecurringRule, TxType } from "@/lib/types";

const TABS = ["overview", "transactions", "bills", "recurring", "reserves", "subscriptions"] as const;
type Tab = (typeof TABS)[number];

export default function CashFlowPage() {
  return (
    <Suspense>
      <CashFlow />
    </Suspense>
  );
}

function CashFlow() {
  const [tab, setTab] = useTab(TABS, "overview");
  const { month, ds } = useFinance();
  return (
    <>
      <PageHeader
        title="Cash flow"
        description="Income, spending, bills and everything that repeats. Planned items become actual when you mark them paid."
        actions={
          <>
            <Button icon={<Repeat className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("rule")}>
              Recurring item
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openTx({ type: "expense" })}>
              Transaction
            </Button>
          </>
        }
      />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "This month" },
          { id: "transactions", label: "Transactions" },
          { id: "bills", label: "Bills", count: month.unpaid.length },
          { id: "recurring", label: "Recurring", count: ds.recurring_rules.filter((r) => r.active).length },
          { id: "reserves", label: "Reserves" },
          { id: "subscriptions", label: "Subscriptions" },
        ]}
      />
      {tab === "overview" && <Overview />}
      {tab === "transactions" && <Transactions />}
      {tab === "bills" && <Bills />}
      {tab === "recurring" && <Recurring />}
      {tab === "reserves" && <Reserves />}
      {tab === "subscriptions" && <Subscriptions />}
    </>
  );
}

// ---------------------------------------------------------------------------

function Overview() {
  const { ds, today, positions, assumptions, ctx } = useFinance();
  const [offset, setOffset] = useState(0);
  const ref = addMonths(startOfMonth(today), offset);
  const from = startOfMonth(ref);
  const to = endOfMonth(ref);
  const isCurrent = offset === 0;
  const isFuture = offset > 0;

  const events = useMemo(
    () => buildEvents(ds, { from, to, today, positions, scenario: assumptions.scenarios.base }).filter((e) => (e.date >= from || (isCurrent && isPending(e))) && e.kind !== "card_statement"),
    [ds, from, to, today, positions, assumptions, isCurrent],
  );
  const actual = useMemo(() => {
    let income = 0;
    let spent = 0;
    let invested = 0;
    let debt = 0;
    for (const t of ds.transactions) {
      if (t.date < from || t.date > to || isOpening(t)) continue;
      const c = classify(t);
      income += c.income;
      spent += c.expense;
      invested += Math.max(0, c.invested);
      debt += c.debtPaid;
    }
    return { income, spent, invested, debt };
  }, [ds.transactions, from, to]);

  const planned = (pred: (e: FinEvent) => boolean) => events.filter((e) => pred(e) && !e.excluded).reduce((s, e) => s + (isPending(e) ? e.remaining : 0), 0);
  const plannedIncome = planned((e) => e.kind === "income");
  const plannedSpend = planned((e) => e.kind === "expense" || e.kind === "card_spend");
  const totalIncome = actual.income + plannedIncome;
  const totalSpend = actual.spent + plannedSpend;

  const groups: { title: string; items: FinEvent[] }[] = [
    { title: "Income", items: events.filter((e) => e.flow === "in") },
    { title: "Bills, EMIs & commitments", items: events.filter((e) => !e.budget && (e.flow === "out" || (e.kind === "emi" && e.flow === "none"))) },
    { title: "On credit cards", items: events.filter((e) => e.kind === "card_spend" && !e.budget && !e.estimated) },
    { title: "Transfers", items: events.filter((e) => e.kind === "transfer") },
  ];
  const budgets = events.filter((e) => e.budget);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" icon={<ChevronLeft className="h-4 w-4" />} onClick={() => setOffset(offset - 1)} aria-label="Previous month" />
        <div className="text-center">
          <p className="display text-[20px] font-semibold">{formatMonthLong(monthKey(ref))}</p>
          <p className="text-[12.5px] text-ink-3">{isCurrent ? "This month" : isFuture ? "Planned" : "Past month"}</p>
        </div>
        <Button size="sm" variant="ghost" icon={<ChevronRight className="h-4 w-4" />} onClick={() => setOffset(offset + 1)} aria-label="Next month" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Income", actual: actual.income, plan: plannedIncome, tone: "text-ok" },
          { label: "Spent", actual: actual.spent, plan: plannedSpend, tone: "" },
          { label: "Invested", actual: actual.invested, plan: planned((e) => e.kind === "sip" || e.kind === "chit"), tone: "" },
          { label: "Debt repaid", actual: actual.debt, plan: planned((e) => e.kind === "emi" || e.kind === "card_bill" || e.kind === "borrow_due"), tone: "" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[12.5px] text-ink-3">{s.label}</p>
            <Money value={s.actual + s.plan} projected={s.plan > 0 && isFuture} className={cn("mt-0.5 block text-[20px] font-semibold", s.tone)} />
            <p className="num mt-0.5 text-[12px] text-ink-3">
              {formatMoney(s.actual, ctx)} actual{s.plan > 0 ? ` · ${formatMoney(s.plan, ctx)} planned` : ""}
            </p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[14px] font-medium">Left over after spending</p>
          <Money value={totalIncome - totalSpend} className={cn("text-[18px] font-semibold", totalIncome - totalSpend < 0 && "text-danger")} />
        </div>
        <p className="mt-1 text-[12.5px] text-ink-3">
          Savings rate {totalIncome > 0 ? `${(((totalIncome - totalSpend) / totalIncome) * 100).toFixed(0)}%` : "—"}. Card bill payments, transfers and investments aren&apos;t counted as spending.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          {groups
            .filter((g) => g.items.length)
            .map((g) => (
              <Panel key={g.title} title={g.title} description={`${g.items.length} item${g.items.length === 1 ? "" : "s"}`}>
                <div className="-mx-2 sm:-mx-3">
                  {g.items.map((e) => (
                    <EventRow key={e.key} e={e} compact />
                  ))}
                </div>
              </Panel>
            ))}
          {groups.every((g) => !g.items.length) && (
            <EmptyState icon={Repeat} title="Nothing planned for this month" body="Add your salary, rent, EMIs and subscriptions as recurring items to plan ahead." action={<Button onClick={() => useUI.getState().openEditor("rule")}>Add a recurring item</Button>} />
          )}
        </div>
        <Panel title="Spending budgets" description="Actual spending in each category against its budget">
          {budgets.length ? (
            <ul className="flex flex-col gap-4">
              {budgets.map((b) => {
                const used = (b.budget?.spent ?? 0) / Math.max(1, b.budget?.limit ?? 1);
                return (
                  <li key={b.key}>
                    <button type="button" className="w-full text-left" onClick={() => useUI.getState().openEvent(b.key)}>
                      <div className="flex items-baseline justify-between gap-2 text-[14px]">
                        <span className="font-medium">{b.title}</span>
                        <span className="num text-[13px] text-ink-2">
                          {formatMoney(b.budget?.spent ?? 0, ctx)} of {formatMoney(b.budget?.limit ?? 0, ctx)}
                        </span>
                      </div>
                      <Progress className="mt-1.5" value={used} tone={used > 1 ? "danger" : used > 0.85 ? "warn" : "brand"} label={`${b.title} used`} />
                      <p className="mt-1 text-[12px] text-ink-3">
                        {used > 1 ? `Over by ${formatMoney((b.budget?.spent ?? 0) - (b.budget?.limit ?? 0), ctx)}` : `${formatMoney(Math.max(0, (b.budget?.limit ?? 0) - (b.budget?.spent ?? 0)), ctx)} left`} · until{" "}
                        {formatDate(b.budget?.periodEnd, "short")}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13.5px] text-ink-2">No budgets for this month. Add a recurring expense and choose &ldquo;spending budget&rdquo;.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const TYPE_FILTERS: { id: string; label: string; types: TxType[] }[] = [
  { id: "all", label: "All types", types: [] },
  { id: "spending", label: "Spending", types: ["expense", "card_spend"] },
  { id: "income", label: "Income", types: ["income"] },
  { id: "transfers", label: "Transfers & card payments", types: ["transfer", "card_payment"] },
  { id: "investments", label: "Investments", types: ["invest_buy", "invest_sell", "chit_installment", "chit_payout"] },
  { id: "debt", label: "EMIs & loans", types: ["loan_emi", "loan_prepayment", "borrow", "borrow_repayment"] },
  { id: "lending", label: "Lending", types: ["lend", "lend_repayment"] },
  { id: "adjustment", label: "Adjustments", types: ["adjustment"] },
];

function Transactions() {
  const { ds, today, ctx } = useFinance();
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [where, setWhere] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState(startOfMonth(addMonths(today, -2)));
  const [to, setTo] = useState(today);
  const [limit, setLimit] = useState(60);

  const filtered = useMemo(() => {
    const types = TYPE_FILTERS.find((t) => t.id === type)?.types ?? [];
    const query = q.trim().toLowerCase();
    return ds.transactions.filter((t) => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      if (types.length && !types.includes(t.type)) return false;
      if (where) {
        const [k, id] = where.split(":");
        if (k === "acct" && t.account_id !== id && t.to_account_id !== id) return false;
        if (k === "card" && t.card_id !== id) return false;
      }
      if (category && t.category !== category) return false;
      if (query) {
        const hay = `${t.description ?? ""} ${t.category ?? ""} ${t.notes ?? ""} ${t.amount}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created_at ?? "").localeCompare(a.created_at ?? "")));
  }, [ds.transactions, q, type, where, category, from, to]);

  const totals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const t of filtered) {
      const c = classify(t);
      inc += c.income;
      exp += c.expense;
    }
    return { inc, exp };
  }, [filtered]);

  const byDate = new Map<string, typeof filtered>();
  for (const t of filtered.slice(0, limit)) byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]);
  const cats = Array.from(new Set(ds.transactions.map((t) => t.category).filter(Boolean) as string[])).sort();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label="Search transactions" placeholder="Search description, category, amount" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPE_FILTERS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Account or card" value={where} onChange={(e) => setWhere(e.target.value)}>
          <option value="">All accounts & cards</option>
          {ds.accounts.map((a) => (
            <option key={a.id} value={`acct:${a.id}`}>
              {a.name}
            </option>
          ))}
          {ds.credit_cards.map((c) => (
            <option key={c.id} value={`card:${c.id}`}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <DateInput aria-label="From date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <DateInput aria-label="To date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-2">
        <span>{filtered.length} transactions</span>
        <span>
          In <Money value={totals.inc} className="font-semibold text-ok" />
        </span>
        <span>
          Spent <Money value={totals.exp} className="font-semibold text-ink" />
        </span>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Wallet} title="No transactions match" body="Try widening the dates or clearing filters." />
      ) : (
        <div className="rounded-2xl border border-line bg-surface">
          {[...byDate.entries()].map(([date, txs]) => {
            const net = txs.reduce((s, t) => s + classify(t).income - classify(t).expense, 0);
            return (
              <section key={date}>
                <header className="sticky top-14 z-10 flex items-baseline justify-between border-b border-line bg-surface-2/95 px-4 py-1.5 text-[12.5px] backdrop-blur">
                  <span className="font-medium text-ink-2">{formatDate(date, "long")}</span>
                  <span className="num text-ink-3">{formatMoney(net, ctx, { sign: true })}</span>
                </header>
                <div className="px-1 py-1 sm:px-2">
                  {txs.map((t) => (
                    <TxRow key={t.id} t={t} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {filtered.length > limit && (
        <Button className="self-center" onClick={() => setLimit(limit + 100)}>
          Show more ({filtered.length - limit} left)
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Bills() {
  const { events, today, ds, positions, assumptions, ctx } = useFinance();
  const [range, setRange] = useState(60);
  const list = useMemo(
    () => (range <= 120 ? events : buildEvents(ds, { from: startOfMonth(addMonths(today, -1)), to: addDays(today, range), today, positions, scenario: assumptions.scenarios.base })),
    [events, range, ds, today, positions, assumptions],
  );
  const bills = list.filter((e) => !e.budget && (e.flow === "out" || (e.kind === "emi" && e.flow === "none")) && e.kind !== "card_statement");
  const overdue = bills.filter((e) => isPending(e) && e.date < today);
  const upcoming = bills.filter((e) => isPending(e) && e.date >= today && e.date <= addDays(today, range));
  const recent = bills.filter((e) => !isPending(e) && e.date >= addDays(today, -30) && e.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));
  const total = upcoming.reduce((s, e) => s + e.remaining, 0);
  return (
    <div className="flex flex-col gap-4">
      {overdue.length > 0 && (
        <Panel title={`Overdue · ${formatMoney(overdue.reduce((s, e) => s + e.remaining, 0), ctx)}`} description="Mark them paid, reschedule or skip." className="border-danger/40">
          <div className="-mx-2 sm:-mx-3">
            {overdue.map((e) => (
              <EventRow key={e.key} e={e} />
            ))}
          </div>
        </Panel>
      )}
      <Panel
        title={`Coming up · ${formatMoney(total, ctx)}`}
        description={`${upcoming.length} bills in the next ${range} days`}
        action={
          <Select aria-label="Range" className="h-9 w-auto text-[13px]" value={String(range)} onChange={(e) => setRange(Number(e.target.value))}>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="120">120 days</option>
            <option value="365">1 year</option>
          </Select>
        }
      >
        {upcoming.length ? (
          <div className="-mx-2 sm:-mx-3">
            {upcoming.map((e) => (
              <EventRow key={e.key} e={e} />
            ))}
          </div>
        ) : (
          <p className="py-4 text-[14px] text-ink-2">No bills in this period.</p>
        )}
      </Panel>
      <Panel title="Paid in the last 30 days">
        {recent.length ? (
          <div className="-mx-2 sm:-mx-3">
            {recent.map((e) => (
              <EventRow key={e.key} e={e} />
            ))}
          </div>
        ) : (
          <p className="py-2 text-[14px] text-ink-2">Nothing marked paid yet.</p>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------

function nextDate(r: RecurringRule, today: string): string | null {
  if (r.frequency === "once") return r.start_date >= today ? r.start_date : null;
  if (r.start_date >= today) return r.start_date;
  const n = nextOccurrenceAfter(r, addDays(today, -1));
  if (n && r.end_date && n > r.end_date) return null;
  return n;
}

function RuleList({ rules, title, description }: { rules: RecurringRule[]; title: string; description?: string }) {
  const { ds, today, ctx } = useFinance();
  if (!rules.length) return null;
  const monthly = rules.reduce((s, r) => s + (r.active && r.frequency !== "once" ? r.amount * perMonth(r.frequency, r.interval_days) : 0), 0);
  return (
    <Panel title={title} description={description ?? (monthly ? `≈ ${formatMoney(monthly, ctx)} a month` : undefined)}>
      <ul className="-mx-2 divide-y divide-line sm:-mx-3">
        {rules.map((r) => {
          const nd = r.active ? nextDate(r, today) : null;
          const where = r.card_id ? ds.credit_cards.find((c) => c.id === r.card_id)?.name : ds.accounts.find((a) => a.id === r.account_id)?.name;
          return (
            <li key={r.id}>
              <button type="button" onClick={() => useUI.getState().openEditor("rule", r.id)} className="flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-surface-2 sm:px-3">
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[14.5px] font-medium", !r.active && "text-ink-3 line-through")}>{r.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                    <span>{r.frequency === "once" ? formatDate(r.start_date) : FREQUENCY_LABEL[r.frequency]}</span>
                    {where && <span>· {where}</span>}
                    {nd && <span>· next {formatDate(nd, "short")}</span>}
                    {r.certainty !== "known" && <Badge tone="future">{r.certainty}</Badge>}
                    {!r.is_fixed && r.kind === "expense" && <Badge>budget</Badge>}
                    {r.is_subscription && <Badge>subscription</Badge>}
                    {!r.active && <Badge tone="warn">paused</Badge>}
                  </p>
                </div>
                <Money value={r.kind === "income" ? r.amount : r.kind === "transfer" ? r.amount : -r.amount} sign={r.kind === "income"} className={cn("text-[15px] font-semibold", r.kind === "income" && "text-ok")} />
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Recurring() {
  const { ds, norms, ctx } = useFinance();
  const rules = [...ds.recurring_rules].sort((a, b) => b.amount * perMonth(b.frequency, b.interval_days) - a.amount * perMonth(a.frequency, a.interval_days));
  const once = rules.filter((r) => r.frequency === "once");
  const rec = rules.filter((r) => r.frequency !== "once");
  const sips = ds.investments.filter((i) => i.sip_active && !i.archived);
  if (!rules.length && !sips.length) {
    return (
      <EmptyState
        icon={Repeat}
        title="Nothing recurring yet"
        body="Add the things that repeat — salary, rent, family support, subscriptions, budgets — once, and they'll appear every month automatically."
        action={<Button variant="primary" onClick={() => useUI.getState().openEditor("rule")}>Add recurring item</Button>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Income / month</p>
          <Money value={norms.income} className="mt-0.5 block text-[18px] font-semibold text-ok" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Fixed bills / month</p>
          <Money value={norms.fixedExpenses} className="mt-0.5 block text-[18px] font-semibold" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Budgets / month</p>
          <Money value={norms.variableBudgets} className="mt-0.5 block text-[18px] font-semibold" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">EMIs, SIPs & chits</p>
          <Money value={norms.emis + norms.sips + norms.chits} className="mt-0.5 block text-[18px] font-semibold" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RuleList title="Income" rules={rec.filter((r) => r.kind === "income")} />
        <RuleList title="Bills & fixed expenses" rules={rec.filter((r) => r.kind === "expense" && r.is_fixed)} />
        <RuleList title="Spending budgets" rules={rec.filter((r) => r.kind === "expense" && !r.is_fixed)} />
        <RuleList title="Transfers" rules={rec.filter((r) => r.kind === "transfer")} />
        <RuleList title="Planned one-time items" rules={once} description="Future one-off income or expenses you've planned for" />
        {sips.length > 0 && (
          <Panel title="SIPs" description={`${formatMoney(norms.sips, ctx)} a month · managed under Assets → Investments`}>
            <div className="divide-y divide-line">
              {sips.map((i) => (
                <KV key={i.id} k={<button type="button" className="text-left hover:underline" onClick={() => useUI.getState().openEditor("investment", i.id)}>{i.name}</button>} v={`${formatMoney(i.sip_amount, ctx)} on day ${i.sip_day ?? "—"}`} />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Reserves() {
  const { ds, positions, month, ctx } = useFinance();
  const patch = useStore((s) => s.patch);
  const total = positions.totals.reserved;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-[12.5px] text-ink-3">Cash in accounts</p>
            <Money value={positions.totals.cash} className="text-[18px] font-semibold" />
          </div>
          <div>
            <p className="text-[12.5px] text-ink-3">Set aside in reserves</p>
            <Money value={total} className="text-[18px] font-semibold" />
          </div>
          <div>
            <p className="text-[12.5px] text-ink-3">Truly spendable this month</p>
            <Money value={month.spendable} className="text-[18px] font-semibold" />
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">Reserves don&apos;t move money between accounts; they just stop you counting it as spendable.</p>
      </div>
      {ds.reserves.length === 0 ? (
        <EmptyState title="No reserves yet" body="Set money aside for annual insurance, school fees, festivals or travel." action={<Button onClick={() => useUI.getState().openEditor("reserve")}>Create a reserve</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {ds.reserves.map((r) => {
            const pct = r.target_amount > 0 ? r.current_amount / r.target_amount : 0;
            return (
              <div key={r.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="text-left" onClick={() => useUI.getState().openEditor("reserve", r.id)}>
                    <p className="text-[15px] font-semibold hover:underline">{r.name}</p>
                    <p className="text-[12.5px] text-ink-3">{r.due_date ? `Needed by ${formatDate(r.due_date)}` : "No deadline"}</p>
                  </button>
                  <p className="num text-right text-[14px]">
                    <Money value={r.current_amount} className="font-semibold" /> <span className="text-ink-3">/ {formatMoney(r.target_amount, ctx)}</span>
                  </p>
                </div>
                <Progress className="mt-3" value={pct} tone={pct >= 1 ? "brand" : "future"} label={`${r.name} funded`} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.monthly_funding > 0 && (
                    <Button size="sm" onClick={() => patch("reserves", r.id, { current_amount: Math.round((r.current_amount + r.monthly_funding) * 100) / 100 })}>
                      Add {formatMoney(r.monthly_funding, ctx)}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => patch("reserves", r.id, { current_amount: 0 })}>
                    Used it — reset
                  </Button>
                </div>
                {r.target_amount > r.current_amount && r.monthly_funding > 0 && (
                  <p className="mt-2 text-[12px] text-ink-3">Fully funded in about {Math.ceil((r.target_amount - r.current_amount) / r.monthly_funding)} months.</p>
                )}
                {r.due_date && r.target_amount > r.current_amount && (r.monthly_funding <= 0 || addMonths(month.from, Math.ceil((r.target_amount - r.current_amount) / Math.max(1, r.monthly_funding))) > r.due_date) && (
                  <p className="mt-1 text-[12px] font-medium text-warn">Underfunded for its due date.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Button className="self-start" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openEditor("reserve")}>
        New reserve
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Subscriptions() {
  const { ds, today, norms, ctx } = useFinance();
  const patch = useStore((s) => s.patch);
  const subs = ds.recurring_rules.filter((r) => r.is_subscription);
  const similar = useMemo(() => {
    const names = subs.map((s) => s.name.toLowerCase().split(/\s|\+|-/)[0]);
    return subs.filter((s, i) => names.indexOf(names[i]) !== i);
  }, [subs]);
  if (!subs.length) {
    return (
      <EmptyState
        title="No subscriptions tracked"
        body="Mark recurring expenses like Netflix, Spotify, cloud storage or gym as subscriptions to see their yearly cost."
        action={<Button onClick={() => useUI.getState().openEditor("rule", undefined, { kind: "expense", is_subscription: true, category: "Subscriptions" })}>Add a subscription</Button>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Per month</p>
          <Money value={norms.subscriptions} className="text-[22px] font-semibold" />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-[12.5px] text-ink-3">Per year</p>
          <Money value={norms.subscriptionsYearly} className="text-[22px] font-semibold" />
        </div>
      </div>
      {similar.length > 0 && <p className="rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">Possible duplicates: {similar.map((s) => s.name).join(", ")}.</p>}
      <div className="rounded-2xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {subs.map((s) => {
            const nd = s.active ? nextDate(s, today) : null;
            const yearly = s.amount * perMonth(s.frequency, s.interval_days) * 12;
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useUI.getState().openEditor("rule", s.id)}>
                  <p className={cn("truncate text-[14.5px] font-medium", !s.active && "text-ink-3 line-through")}>{s.name}</p>
                  <p className="text-[12.5px] text-ink-3">
                    {formatMoney(s.amount, ctx)} {FREQUENCY_LABEL[s.frequency].toLowerCase()} · {formatMoney(yearly, ctx)}/yr{nd ? ` · renews ${formatDate(nd, "short")}` : ""}
                  </p>
                </button>
                <Button size="sm" variant="ghost" icon={s.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} onClick={() => patch("recurring_rules", s.id, { active: !s.active })}>
                  {s.active ? "Pause" : "Resume"}
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="text-[12.5px] text-ink-3">Pausing stops future occurrences from counting in your plans — remember to cancel with the provider too.</p>
    </div>
  );
}

