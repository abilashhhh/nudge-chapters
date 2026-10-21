"use client";

import {
  ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, CalendarClock, CreditCard as CardIcon, Pencil, Plus, Receipt, RefreshCw, Search, Undo2, Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/cn";
import { addDays, addMonths, formatDate, formatMonth, monthKey } from "@/lib/dates";
import { cashDeltas } from "@/lib/engine/ledger";
import { dueDateFor, statementDateOnOrAfter } from "@/lib/engine/events";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/money";
import type { Transaction } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { holdingColors } from "@/lib/v2/card-skins";
import { Money } from "../money";
import { Button } from "../ui/button";
import { EmptyState, Segmented } from "../ui/misc";
import { useHoldingHistory } from "../price-refresher";
import { initials } from "./entity-icon";
import { AccountVisual } from "./card-visual";
import { FlipCard, useCardBillsAhead } from "./card-flip";

const tick = { fill: "var(--ink-3)", fontSize: 11.5 };

function Back({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13.5px] font-medium text-ink-2 hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {label}
    </Link>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: ReactNode; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className={cn("num anim-count mt-0.5 truncate text-[19px] font-semibold leading-tight sm:text-[21px]", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</p>
      {note && <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{note}</p>}
    </div>
  );
}

/** A ring showing how much of something is used. */
function Ring({ value, label, sub }: { value: number; label: string; sub?: string }) {
  const v = Math.max(0, Math.min(1, value));
  const r = 42;
  const c = 2 * Math.PI * r;
  const tone = v > 0.7 ? "var(--danger)" : v > 0.3 ? "var(--warn)" : "var(--ok)";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0 -rotate-90" role="img" aria-label={`${label}: ${Math.round(v * 100)}%`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} className="transition-[stroke-dasharray] duration-700" />
      </svg>
      <div className="min-w-0">
        <p className="num text-[22px] font-semibold leading-none">{Math.round(v * 100)}%</p>
        <p className="mt-1 text-[12.5px] font-medium">{label}</p>
        {sub && <p className="text-[11.5px] text-ink-3">{sub}</p>}
      </div>
    </div>
  );
}

function Tip({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] shadow-panel">
      <p className="mb-0.5 font-semibold">{title}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4 text-ink-2">
          <span>{k}</span>
          <span className="num font-medium text-ink">{v}</span>
        </p>
      ))}
    </div>
  );
}

/** Monthly bars for the last six months; the current month is highlighted. Tap a bar to filter the list to it. */
function MonthBars({ rows, value, color, onPick, picked, label }: { rows: { month: string; amount: number }[]; value: (n: number) => string; color: string; onPick: (m: string | null) => void; picked: string | null; label: string }) {
  return (
    <div className="h-44" role="img" aria-label={`${label} by month`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} onClick={(e) => { const m = (e as { activeLabel?: string } | null)?.activeLabel; if (m) onPick(picked === m ? null : m); }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="month" tickFormatter={(m) => formatMonth(m, false)} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} />
          <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
          <Tooltip cursor={{ fill: "var(--surface-3)", opacity: 0.6 }} content={({ active, payload }) => (active && payload?.[0] ? <Tip title={formatMonth(String(payload[0].payload.month))} rows={[[label, value(Number(payload[0].value))]]} /> : null)} />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]} isAnimationActive className="cursor-pointer">
            {rows.map((r) => (
              <Cell key={r.month} fill={color} opacity={picked && picked !== r.month ? 0.35 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CategoryBars({ items, value }: { items: { name: string; amount: number }[]; value: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  if (!items.length) return <p className="text-[13px] text-ink-3">Nothing spent in this period.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((i) => (
        <li key={i.name} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
          <span className="truncate text-ink-2">{i.name}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-surface-3">
            <span className="block h-full rounded-full bg-future transition-[width] duration-700" style={{ width: `${(i.amount / max) * 100}%` }} />
          </span>
          <span className="num font-medium">{value(i.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

type Kind = "in" | "out" | "move";

/** The transaction list: filters, search, month, grouped by day. Every row opens the entry to edit. */
function TxList({ txs, sign, filters, month, setMonth, accountId }: { txs: Transaction[]; sign: (t: Transaction) => number; filters: { id: string; label: string; test: (t: Transaction) => boolean }[]; month: string | null; setMonth: (m: string | null) => void; accountId?: string }) {
  const { ds, ctx } = useFinance();
  const [f, setF] = useState(filters[0].id);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);
  const needle = q.trim().toLowerCase();
  const shown = txs
    .filter(filters.find((x) => x.id === f)!.test)
    .filter((t) => !month || t.date.startsWith(month))
    .filter((t) => !needle || `${t.description ?? ""} ${t.category ?? ""} ${t.notes ?? ""} ${t.amount}`.toLowerCase().includes(needle));
  const days = new Map<string, Transaction[]>();
  for (const t of shown.slice(0, limit)) days.set(t.date, [...(days.get(t.date) ?? []), t]);
  const kind = (t: Transaction): Kind => (t.type === "transfer" ? "move" : sign(t) >= 0 ? "in" : "out");
  const Icon = { in: ArrowDownLeft, out: ArrowUpRight, move: ArrowLeftRight };
  const total = shown.reduce((s, t) => s + sign(t), 0);
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:px-4">
        <h2 className="mr-auto text-[15px] font-semibold">Transactions</h2>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search transactions" className="h-9 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-[13.5px] outline-none focus:border-future" />
        </div>
      </div>
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 pt-3 sm:px-4" role="radiogroup" aria-label="Show">
        {filters.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={f === x.id} onClick={() => setF(x.id)} className={cn("h-8 shrink-0 rounded-full px-3 text-[12.5px] font-medium", f === x.id ? "bg-inverse text-on-inverse" : "bg-surface-3/70 text-ink-2 hover:text-ink")}>
            {x.label}
          </button>
        ))}
        {month && (
          <button type="button" onClick={() => setMonth(null)} className="h-8 shrink-0 rounded-full bg-future-soft px-3 text-[12.5px] font-medium text-future-ink">
            {formatMonth(month)} ×
          </button>
        )}
      </div>
      <p className="px-3 pt-2 text-[12px] text-ink-3 sm:px-4">
        {shown.length} entr{shown.length === 1 ? "y" : "ies"} · net <span className={cn("num font-medium", total >= 0 ? "text-ok" : "text-ink")}>{formatMoney(total, ctx, { sign: true })}</span> · tap one to edit
      </p>
      {shown.length === 0 ? (
        <p className="p-4 text-[13.5px] text-ink-3">Nothing here.</p>
      ) : (
        <div className="px-1 pb-2 sm:px-2">
          {[...days.entries()].map(([d, list]) => (
            <div key={d}>
              <p className="sticky top-14 z-[1] bg-surface/95 px-2 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3 backdrop-blur sm:px-3">{formatDate(d, "medium")}</p>
              {list.map((t) => {
                const k = kind(t);
                const I = Icon[k];
                const v = sign(t);
                const other = t.type === "transfer" ? ds.accounts.find((a) => a.id === (t.account_id === accountId ? t.to_account_id : t.account_id))?.name : null;
                return (
                  <button key={t.id} type="button" onClick={() => useUI.getState().openTx(null, t)} className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-surface-2 sm:px-3">
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", k === "in" ? "bg-ok-soft text-ok" : k === "move" ? "bg-future-soft text-future-ink" : "bg-surface-3 text-ink-2")}>
                      <I className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{t.description || t.category || "Entry"}</span>
                      <span className="block truncate text-[12px] text-ink-3">{[other ? `${v >= 0 ? "From" : "To"} ${other}` : null, t.category, t.type === "adjustment" ? "Balance correction" : null, t.notes?.includes("From bank SMS") ? "from SMS" : null].filter(Boolean).join(" · ") || " "}</span>
                    </span>
                    <span className={cn("num shrink-0 text-[14.5px] font-semibold", v > 0 ? "text-ok" : "text-ink")}>{formatMoney(v, ctx, { sign: true, decimals: true })}</span>
                    <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </button>
                );
              })}
            </div>
          ))}
          {shown.length > limit && (
            <Button variant="ghost" className="mx-2 my-2" onClick={() => setLimit(limit + 40)}>
              Show more ({shown.length - limit} left)
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function lastMonths(today: string, n: number) {
  return Array.from({ length: n }, (_, i) => monthKey(addMonths(today, i - n + 1)));
}

// ---------------------------------------------------------------------------
// Credit card
// ---------------------------------------------------------------------------

export function CardDetailScreen() {
  const id = useSearchParams().get("id");
  const { ds, positions, today, ctx } = useFinance();
  const ui = useUI.getState();
  const [month, setMonth] = useState<string | null>(null);
  const card = ds.credit_cards.find((c) => c.id === id);
  const cp = card ? positions.cards.get(card.id) : undefined;
  const txs = useMemo(() => (card ? ds.transactions.filter((t) => t.card_id === card.id) : []), [ds.transactions, card]);
  const ahead = useCardBillsAhead();
  const m = (n: number) => formatMoney(n, ctx);
  if (!card || !cp)
    return (
      <>
        <Back href="/to-pay?tab=cards" label="Credit cards" />
        <EmptyState icon={CardIcon} title="Card not found" body="It may have been deleted." />
      </>
    );
  const sign = (t: Transaction) => (t.type === "card_spend" ? -t.amount : t.type === "card_payment" ? t.amount : t.type === "adjustment" ? -t.amount : -t.amount);
  const group = card.shared_limit_group?.trim().toLowerCase();
  const mates = group ? ds.credit_cards.filter((c) => !c.archived && c.id !== card.id && c.shared_limit_group?.trim().toLowerCase() === group) : [];
  const limit = mates.length ? Math.max(card.credit_limit, ...mates.map((x) => x.credit_limit)) : card.credit_limit;
  const nextS = statementDateOnOrAfter(card, today);
  const lastSt = [...cp.statements].reverse().find((s) => s.remaining > 0);
  const spends = txs.filter((t) => t.type === "card_spend");
  const months = lastMonths(today, 6).map((mo) => ({ month: mo, amount: Math.round(spends.filter((t) => t.date.startsWith(mo)).reduce((s, t) => s + t.amount, 0)) }));
  const period = month ?? monthKey(today);
  const cats = new Map<string, number>();
  for (const t of spends.filter((x) => x.date.startsWith(period))) cats.set(t.category || t.description || "Other", (cats.get(t.category || t.description || "Other") ?? 0) + t.amount);
  const topCats = [...cats.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 6);
  const emis = ds.loans.filter((l) => l.card_id === card.id && l.status === "active");
  const thisMonth = months.at(-1)!.amount;

  const prevMonth = months.at(-2)!.amount;
  return (
    <>
      <Back href="/to-pay?tab=cards" label="Credit cards" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <FlipCard
            bills={ahead.get(card.id) ?? []}
            owed={cp.outstanding}
            onOpen={() => ui.openEditor("card", card.id)}
            card={card} used={cp.utilization} usedLabel={mates.length ? `Shared limit used · ${Math.round(cp.utilization * 100)}%` : undefined} due={lastSt ? `${m(lastSt.remaining)} due ${formatDate(lastSt.statement.due_date, "short")}` : "No bill due"} dueTone={lastSt ? (lastSt.statement.due_date < today ? "late" : lastSt.statement.due_date <= addDays(today, 7) ? "soon" : null) : "paid"} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Receipt className="h-4 w-4" />} onClick={() => ui.openTx({ type: "card_payment", card_id: card.id })}>Pay bill</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => ui.openTx({ type: "card_spend", card_id: card.id })}>Add spend</Button>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => ui.openEditor("card", card.id)}>Edit card</Button>
            <Button variant="ghost" onClick={() => ui.openEditor("statement", undefined, { card_id: card.id })}>Add bill</Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <Stat label="You owe now" value={m(Math.max(0, cp.outstanding))} note={`${m(cp.billedUnpaid)} billed · ${m(cp.unbilled)} new`} />
            <Stat label={mates.length ? "Available (shared)" : "Available"} value={limit > 0 ? m(cp.available) : "Set a limit"} note={limit > 0 ? `of ${m(limit)}${mates.length ? ` with ${mates.map((x) => x.name).join(", ")}` : ""}` : "Edit the card to add its limit"} tone={limit > 0 && cp.utilization > 0.7 ? "danger" : undefined} />
            <Stat label="Bill due" value={lastSt ? m(lastSt.remaining) : "Nothing"} note={lastSt ? `by ${formatDate(lastSt.statement.due_date, "medium")}` : `Next bill ${formatDate(nextS, "short")}, due ${formatDate(dueDateFor(card, nextS), "short")}`} tone={lastSt && lastSt.statement.due_date < today ? "danger" : lastSt ? "warn" : "ok"} />
            <Stat label="Spent this month" value={m(thisMonth)} note={prevMonth ? `${thisMonth >= prevMonth ? "▲" : "▼"} ${formatPct(prevMonth ? ((thisMonth - prevMonth) / prevMonth) * 100 : 0, 0)} vs last month` : undefined} />
            <Stat label="Bill date" value={`${card.statement_day}${["th", "st", "nd", "rd"][card.statement_day % 10 > 3 || [11, 12, 13].includes(card.statement_day) ? 0 : card.statement_day % 10]}`} note={`Due on the ${card.due_day}${["th", "st", "nd", "rd"][card.due_day % 10 > 3 || [11, 12, 13].includes(card.due_day) ? 0 : card.due_day % 10]}`} />
            {limit > 0 ? <Ring value={cp.utilization} label={mates.length ? "Shared limit used" : "Limit used"} sub={cp.utilization > 0.3 ? "Under 30% is healthiest for your score" : "Healthy"} /> : <Stat label="Limit" value="—" note="Not set" />}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-1 text-[15px] font-semibold">Spends by month</h2>
          <p className="mb-2 text-[12px] text-ink-3">Tap a month to see just its transactions.</p>
          <MonthBars rows={months} value={m} color="var(--future)" onPick={setMonth} picked={month} label="Spent" />
        </section>
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 text-[15px] font-semibold">Where it went · {formatMonth(period)}</h2>
          <CategoryBars items={topCats} value={m} />
          {emis.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-[13.5px] font-semibold"><CalendarClock className="h-4 w-4 text-future" aria-hidden />EMIs on this card</h3>
              <ul className="flex flex-col gap-1.5">
                {emis.map((l) => {
                  const st = positions.loans.get(l.id)?.state;
                  return (
                    <li key={l.id}>
                      <button type="button" onClick={() => ui.openEditor("loan", l.id)} className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
                        <span className="truncate">{l.name}</span>
                        <span className="num shrink-0 text-ink-2">{m(st?.schedule[st.paidCount]?.emi ?? l.emi_amount ?? 0)}/mo{st ? ` · ${m(st.outstanding)} left` : ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="mt-4">
        <TxList
          txs={txs}
          sign={sign}
          month={month}
          setMonth={setMonth}
          filters={[
            { id: "all", label: "All", test: () => true },
            { id: "spend", label: "Spends", test: (t) => t.type === "card_spend" },
            { id: "pay", label: "Payments", test: (t) => t.type === "card_payment" && !t.tags?.includes("refund") },
            { id: "refund", label: "Refunds", test: (t) => t.type === "card_payment" && !!t.tags?.includes("refund") },
          ]}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Bank account / wallet
// ---------------------------------------------------------------------------

export function AccountDetailScreen() {
  const id = useSearchParams().get("id");
  const { ds, positions, today, ctx } = useFinance();
  const ui = useUI.getState();
  const [month, setMonth] = useState<string | null>(null);
  const a = ds.accounts.find((x) => x.id === id);
  const bal = a ? positions.accounts.get(a.id)?.balance ?? 0 : 0;
  const txs = useMemo(() => (a ? ds.transactions.filter((t) => t.account_id === a.id || t.to_account_id === a.id) : []), [ds.transactions, a]);
  const c = { ...ctx, currency: a?.currency ?? ctx.currency };
  const m = (n: number) => formatMoney(n, c);
  const delta = (t: Transaction) => (a ? cashDeltas(t).reduce((s, [acc, d]) => s + (acc === a.id ? d : 0), 0) : 0);
  // Balance over the last 90 days, walking back from today's balance.
  const series = useMemo(() => {
    if (!a) return [];
    const out: { date: string; balance: number }[] = [];
    let b = bal;
    const byDay = new Map<string, number>();
    for (const t of txs) byDay.set(t.date, (byDay.get(t.date) ?? 0) + delta(t));
    for (let d = today, i = 0; i < 90; i++, d = addDays(d, -1)) {
      out.push({ date: d, balance: Math.round(b * 100) / 100 });
      b -= byDay.get(d) ?? 0;
    }
    return out.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, bal, today, a?.id]);
  if (!a)
    return (
      <>
        <Back href="/my-money?tab=accounts" label="Bank accounts" />
        <EmptyState icon={Wallet} title="Account not found" body="It may have been deleted." />
      </>
    );
  const months = lastMonths(today, 6).map((mo) => {
    const xs = txs.filter((t) => t.date.startsWith(mo) && t.type !== "adjustment");
    return { month: mo, in: xs.reduce((s, t) => s + Math.max(0, delta(t)), 0), out: xs.reduce((s, t) => s + Math.max(0, -delta(t)), 0) };
  });
  const cur = months.at(-1)!;
  return (
    <>
      <Back href="/my-money?tab=accounts" label="Bank accounts" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <AccountVisual account={a} balance={<Money value={bal} decimals currency={a.currency} className="text-inherit" />} onClick={() => ui.openEditor("account", a.id)} />
          <p className="-mt-1 text-[12px] text-ink-3">Tap the card to edit the account.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openTx({ type: "expense", account_id: a.id })}>Add entry</Button>
            <Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => ui.openTx({ type: "adjustment", account_id: a.id, description: "Balance matched with bank" })}>Fix balance</Button>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => ui.openEditor("account", a.id)}>Edit account</Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Balance" value={m(bal)} note={a.last_verified_at ? `Checked ${formatDate(a.last_verified_at, "short")}` : "Not checked yet"} tone={bal < 0 ? "danger" : undefined} />
            <Stat label="In this month" value={m(cur.in)} tone="ok" />
            <Stat label="Out this month" value={m(cur.out)} />
            <Stat label="Net this month" value={formatMoney(cur.in - cur.out, c, { sign: true })} tone={cur.in - cur.out >= 0 ? "ok" : "danger"} />
          </div>
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-2 text-[15px] font-semibold">Balance · last 90 days</h2>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="balfill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, "short")} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={40} />
                  <YAxis tick={tick} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
                  <Tooltip content={({ active, payload }) => (active && payload?.[0] ? <Tip title={formatDate(String(payload[0].payload.date), "long")} rows={[["Balance", m(Number(payload[0].value))]]} /> : null)} />
                  <Area type="stepAfter" dataKey="balance" stroke="var(--brand)" strokeWidth={2} fill="url(#balfill)" isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </div>
      <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-1 text-[15px] font-semibold">Money out by month</h2>
        <p className="mb-2 text-[12px] text-ink-3">Tap a month to see just its transactions.</p>
        <MonthBars rows={months.map((x) => ({ month: x.month, amount: Math.round(x.out) }))} value={m} color="var(--chart-out)" onPick={setMonth} picked={month} label="Out" />
      </section>
      <div className="mt-4">
        <TxList
          txs={txs}
          sign={delta}
          month={month}
          setMonth={setMonth}
          accountId={a.id}
          filters={[
            { id: "all", label: "All", test: () => true },
            { id: "in", label: "Money in", test: (t) => t.type !== "transfer" && delta(t) > 0 },
            { id: "out", label: "Money out", test: (t) => t.type !== "transfer" && delta(t) < 0 },
            { id: "move", label: "Transfers", test: (t) => t.type === "transfer" },
            { id: "fix", label: "Corrections", test: (t) => t.type === "adjustment" },
          ]}
        />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mutual fund / stock
// ---------------------------------------------------------------------------

/** Price points to chart for a holding: a year of market prices when available, else the values you recorded. */
function useHoldingSeries(id: string): { pts: [string, number][]; kind: "price" | "value" } {
  const { ds } = useFinance();
  const hist = useHoldingHistory(id);
  if (hist.length >= 2) return { pts: hist, kind: "price" };
  const vals = ds.investment_valuations.filter((v) => v.investment_id === id).sort((x, y) => (x.date < y.date ? -1 : 1));
  return { pts: vals.map((v) => [v.date, v.value] as [string, number]), kind: "value" };
}

/** "Bought at → now" on one track, for holdings with no price history yet. */
function CostTrack({ cost, now, fmt }: { cost: number; now: number; fmt: (n: number) => string }) {
  const lo = Math.min(cost, now);
  const hi = Math.max(cost, now);
  const pad = (hi - lo) * 0.25 || Math.max(1, hi * 0.05);
  const pos = (v: number) => ((v - (lo - pad)) / (hi + pad - (lo - pad))) * 100;
  const up = now >= cost;
  return (
    <span className="relative block pb-5 pt-1" aria-hidden>
      <span className="relative block h-1.5 rounded-full bg-white/20">
        <span className={cn("absolute inset-y-0 rounded-full", up ? "bg-[#86efac]" : "bg-[#fca5a5]")} style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }} />
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 bg-transparent" style={{ left: `${pos(cost)}%` }} />
        <span className={cn("absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow", up ? "bg-[#22c55e]" : "bg-[#ef4444]")} style={{ left: `${pos(now)}%` }} />
      </span>
      <span className="absolute top-4 whitespace-nowrap text-[10px] opacity-80" style={{ left: `${pos(cost)}%`, transform: `translateX(${up ? "-90%" : "-10%"})` }}>Bought {fmt(cost)}</span>
      <span className="absolute top-4 whitespace-nowrap text-[10px] font-semibold" style={{ left: `${pos(now)}%`, transform: `translateX(${up ? "-10%" : "-90%"})` }}>Now {fmt(now)}</span>
    </span>
  );
}

export function HoldingTile({ id, onClick, index = 0 }: { id: string; onClick?: () => void; index?: number }) {
  const { positions, ctx } = useFinance();
  const series = useHoldingSeries(id);
  const gid = useId().replace(/:/g, "");
  const p = positions.investments.get(id);
  if (!p) return null;
  const i = p.investment;
  const c = { ...ctx, currency: i.currency };
  const [a, b] = holdingColors(i.name, i.type);
  const up = p.gain >= 0;
  const pts = series.pts.map(([, v]) => v);
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const xy = pts.map((v, k) => [(k / Math.max(1, pts.length - 1)) * 100, 34 - ((v - lo) / (hi - lo || 1)) * 30] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const change = pts.length >= 2 && pts[0] > 0 ? ((pts.at(-1)! - pts[0]) / pts[0]) * 100 : null;
  const chUp = (change ?? 0) >= 0;
  const cost = i.avg_cost ?? (p.units ? p.invested / p.units : null);
  return (
    <button
      type="button"
      onClick={onClick}
      className="credit-card anim-rise group relative isolate flex w-full flex-col justify-between gap-3 overflow-hidden rounded-[18px] p-4 text-left text-white shadow-[0_18px_36px_-16px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(255,255,255,0.1)]"
      style={{ background: `linear-gradient(140deg, ${a} 0%, ${b} 100%)`, animationDelay: `${index * 70}ms` }}
      aria-label={`${i.name}: ${formatMoney(p.value, c)}`}
    >
      <span className="credit-card-sheen pointer-events-none absolute inset-0" aria-hidden />
      <span className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full bg-white/[0.07]" aria-hidden />
      <span className="relative flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[30%] bg-white/15 text-[12px] font-bold ring-1 ring-inset ring-white/25 backdrop-blur-sm">{initials(i.name)}</span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{i.name}</span>
          <span className="block truncate text-[10.5px] font-semibold uppercase tracking-[0.14em] opacity-75">{i.type === "mutual_fund" ? "Mutual fund" : i.type === "etf" ? "ETF" : "Stock"}{i.institution ? ` · ${i.institution}` : ""}</span>
        </span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold shadow-sm", up ? "bg-[#16a34a]" : "bg-[#dc2626]")}>
          {up ? "▲" : "▼"} {formatPct(Math.abs(p.gainPct))}
        </span>
      </span>
      <span className="relative block">
        {pts.length >= 2 ? (
          <>
            <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="block h-14 w-full" aria-hidden>
              <defs>
                <linearGradient id={`${gid}f`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={chUp ? "#86efac" : "#fca5a5"} stopOpacity="0.45" />
                  <stop offset="1" stopColor={chUp ? "#86efac" : "#fca5a5"} stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={`0,36 ${line} 100,36`} fill={`url(#${gid}f)`} />
              <polyline points={line} fill="none" stroke={chUp ? "#bbf7d0" : "#fecaca"} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <circle cx={xy.at(-1)![0]} cy={xy.at(-1)![1]} r="1.6" fill="#fff" />
            </svg>
            {change != null && (
              <span className="absolute right-0 top-0 rounded-full bg-black/25 px-1.5 py-0.5 text-[10.5px] font-semibold backdrop-blur-sm">
                {series.kind === "price" ? "1Y" : "Since first"} {chUp ? "+" : ""}{formatPct(change)}
              </span>
            )}
          </>
        ) : cost != null && p.price != null ? (
          <CostTrack cost={cost} now={p.price} fmt={(n) => formatMoney(n, c, { decimals: n < 100 })} />
        ) : (
          <span className="block h-14" />
        )}
      </span>
      <span className="relative flex items-end justify-between gap-2">
        <span>
          <span className="block text-[10px] uppercase tracking-wider opacity-75">Value</span>
          <span className="num block text-[20px] font-semibold leading-tight">{formatMoney(p.value, c)}</span>
        </span>
        <span className="text-right text-[12px]">
          <span className="block opacity-75">{up ? "Profit" : "Loss"}</span>
          <span className="num block font-semibold">{formatMoney(p.gain, c, { sign: true })}</span>
        </span>
      </span>
    </button>
  );
}

/** Price (or value) history with a range picker and your average buying price as a line. */
function HoldingChart({ id, cost, fmt }: { id: string; cost: number | null; fmt: (n: number) => string }) {
  const { today } = useFinance();
  const series = useHoldingSeries(id);
  const [range, setRange] = useState<"1m" | "3m" | "6m" | "1y">("6m");
  const from = addDays(today, range === "1m" ? -31 : range === "3m" ? -92 : range === "6m" ? -183 : -366);
  const data = series.pts.filter(([d]) => d >= from).map(([date, v]) => ({ date, v }));
  if (series.pts.length < 2)
    return (
      <section className="mt-4 rounded-2xl border border-dashed border-line-strong p-4 text-[13.5px] text-ink-2">
        The price chart appears once prices load (signed-in accounts get a year of daily prices automatically).
      </section>
    );
  const first = data[0]?.v ?? 0;
  const last = data.at(-1)?.v ?? 0;
  const ch = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = ch >= 0;
  const color = up ? "var(--ok)" : "var(--danger)";
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">{series.kind === "price" ? "Price" : "Value"} over time</h2>
          <p className={cn("num text-[13px] font-semibold", up ? "text-ok" : "text-danger")}>
            {up ? "▲" : "▼"} {formatPct(Math.abs(ch))} in {range === "1m" ? "1 month" : range === "3m" ? "3 months" : range === "6m" ? "6 months" : "1 year"}
          </p>
        </div>
        <Segmented size="sm" value={range} onChange={setRange} options={[{ id: "1m", label: "1M" }, { id: "3m", label: "3M" }, { id: "6m", label: "6M" }, { id: "1y", label: "1Y" }]} />
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="hfill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d) => formatDate(d, "short")} tick={tick} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={40} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v >= 100 ? String(Math.round(v)) : Number(v).toFixed(1))} />
            {cost != null && series.kind === "price" && <ReferenceLine y={cost} stroke="var(--ink-3)" strokeDasharray="4 4" label={{ value: `You bought at ${fmt(cost)}`, position: "insideTopLeft", fill: "var(--ink-3)", fontSize: 11 }} />}
            <Tooltip content={({ active, payload }) => (active && payload?.[0] ? <Tip title={formatDate(String(payload[0].payload.date), "long")} rows={[[series.kind === "price" ? "Price" : "Value", fmt(Number(payload[0].value))]]} /> : null)} />
            <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill="url(#hfill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function HoldingDetailScreen() {
  const id = useSearchParams().get("id");
  const { ds, positions, ctx } = useFinance();
  const ui = useUI.getState();
  const router = useRouter();
  const p = id ? positions.investments.get(id) : undefined;
  const txs = useMemo(() => (id ? ds.transactions.filter((t) => t.investment_id === id) : []), [ds.transactions, id]);
  const [month, setMonth] = useState<string | null>(null);
  if (!p)
    return (
      <>
        <Back href="/my-money" label="My Money" />
        <EmptyState icon={Wallet} title="Not found" body="It may have been deleted." />
      </>
    );
  const i = p.investment;
  const c = { ...ctx, currency: i.currency };
  const m = (n: number) => formatMoney(n, c, { decimals: true });
  const back = i.type === "mutual_fund" ? "/my-money?tab=funds" : "/my-money?tab=stocks";
  return (
    <>
      <Back href={back} label={i.type === "mutual_fund" ? "Mutual funds" : "Stocks"} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <HoldingTile id={i.id} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openTx({ type: "invest_buy", investment_id: i.id })}>Add purchase</Button>
            <Button icon={<Undo2 className="h-4 w-4" />} onClick={() => ui.openTx({ type: "invest_sell", investment_id: i.id })}>Record a sale</Button>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => ui.openEditor("investment", i.id)}>Edit</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 content-start gap-3 xl:grid-cols-3">
          <Stat label="Value today" value={m(p.value)} note={i.value_as_of ? `As of ${formatDate(i.value_as_of, "short")}` : undefined} />
          <Stat label="Money put in" value={m(p.invested)} />
          <Stat label={p.gain >= 0 ? "Profit" : "Loss"} value={formatMoney(p.gain, c, { sign: true, decimals: true })} note={formatPct(p.gainPct)} tone={p.gain >= 0 ? "ok" : "danger"} />
          {p.units != null && <Stat label="Units / shares" value={p.units.toLocaleString("en-IN", { maximumFractionDigits: 4 })} />}
          {i.avg_cost != null && <Stat label="Bought at (average)" value={m(i.avg_cost)} />}
          {p.price != null && <Stat label="Price now" value={m(p.price)} tone={i.avg_cost != null ? (p.price >= i.avg_cost ? "ok" : "danger") : undefined} />}
          <Stat label="Yearly return (XIRR)" value={p.xirr != null ? formatPct(p.xirr) : "—"} note={p.xirr == null ? "Needs more history" : undefined} tone={p.xirr != null ? (p.xirr >= 0 ? "ok" : "danger") : undefined} />
          {i.sip_active && i.sip_amount > 0 && <Stat label="Monthly SIP" value={m(i.sip_amount)} note={`on the ${i.sip_day ?? "—"}`} />}
        </div>
      </div>
      <HoldingChart id={i.id} cost={i.avg_cost ?? (p.units ? p.invested / p.units : null)} fmt={m} />
      <div className="mt-4">
        {i.invested_amount > 0 && (
          <section className="mb-4 rounded-2xl border border-line bg-surface p-3 sm:px-4">
            <h2 className="mb-1 px-1 text-[15px] font-semibold">Your investment</h2>
            <button type="button" onClick={() => ui.openEditor("investment", i.id)} className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-surface-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Plus className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium">{i.start_date ? "Initial investment" : "Invested before tracking began"}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {[
                    i.start_date ? formatDate(i.start_date, "medium") : `as of ${formatDate(i.track_from, "medium")}`,
                    p.units != null && i.avg_cost != null ? `${p.units.toLocaleString("en-IN", { maximumFractionDigits: 4 })} ${i.type === "mutual_fund" ? "units" : "shares"} at ${m(i.avg_cost)}` : null,
                    i.institution,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="num shrink-0 text-[14.5px] font-semibold">{m(i.invested_amount)}</span>
              <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />
            </button>
            {txs.length > 0 && <p className="px-1 pt-1 text-[12px] text-ink-3">Later purchases and sales are listed below.</p>}
          </section>
        )}
        {txs.length ? (
          <TxList
            txs={txs}
            sign={(t) => (t.type === "invest_sell" ? t.amount : -t.amount)}
            month={month}
            setMonth={setMonth}
            filters={[
              { id: "all", label: "All", test: () => true },
              { id: "buy", label: "Purchases", test: (t) => t.type === "invest_buy" },
              { id: "sell", label: "Sales", test: (t) => t.type === "invest_sell" },
            ]}
          />
        ) : (
          <EmptyState icon={Receipt} title={i.invested_amount > 0 ? "No later purchases yet" : "No purchases recorded"} body="Add each new purchase or SIP instalment to see it here." action={<Button onClick={() => ui.openTx({ type: "invest_buy", investment_id: i.id })}>Add purchase</Button>} />
        )}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">
        <button type="button" className="underline" onClick={() => router.push(back)}>Back to {i.type === "mutual_fund" ? "mutual funds" : "stocks"}</button>
      </p>
    </>
  );
}
