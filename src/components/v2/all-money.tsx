"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { INVESTMENT_TYPE_LABEL } from "@/lib/engine/defaults";
import { useFinance } from "@/lib/finance";
import { round2, toBase } from "@/lib/money";
import { Money } from "../money";
import { EntityIcon } from "./entity-icon";

type Line = { id: string; label: string; sub?: string; value: number; href?: string; icon?: ReactNode };
type Block = { title: string; lines: Line[] };

/** What's still owed on a card: the unpaid bill, spends not billed yet and every EMI still to come. */
function useCardDues() {
  const { ds, positions } = useFinance();
  return useMemo(
    () =>
      ds.credit_cards
        .filter((c) => !c.archived)
        .map((c) => {
          const cp = positions.cards.get(c.id);
          const emi = ds.loans
            .filter((l) => l.card_id === c.id && l.status === "active")
            .reduce((t, l) => {
              const st = positions.loans.get(l.id)?.state;
              return t + (st ? st.schedule.slice(st.paidCount).reduce((a, i) => a + i.emi, 0) : 0);
            }, 0);
          return { card: c, due: round2(Math.max(0, cp?.outstanding ?? 0) + emi), emi: round2(emi) };
        }),
    [ds.credit_cards, ds.loans, positions],
  );
}

function Section({ title, total, blocks, tone }: { title: string; total: number; blocks: Block[]; tone: "have" | "owe" }) {
  const shown = blocks.filter((b) => b.lines.length);
  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <Money value={total} decimals className={cn("text-[18px] font-semibold", tone === "owe" && total > 0.5 && "text-danger")} />
      </div>
      {shown.length === 0 && <p className="px-4 py-4 text-[14px] text-ink-2 sm:px-5">Nothing here.</p>}
      {shown.map((b) => (
        <div key={b.title}>
          <div className="flex items-baseline justify-between bg-surface-2/60 px-4 py-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-3 sm:px-5">
            <span>{b.title}</span>
            <Money value={b.lines.reduce((s, l) => s + l.value, 0)} decimals className="text-[12px] font-semibold normal-case text-ink-2" />
          </div>
          <ul className="divide-y divide-line/70">
            {b.lines.map((l) => {
              const body = (
                <>
                  {l.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{l.label}</span>
                    {l.sub && <span className="block truncate text-[12px] text-ink-3">{l.sub}</span>}
                  </span>
                  <Money value={l.value} decimals className="shrink-0 text-[14px] font-medium" />
                  {l.href && <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden />}
                </>
              );
              return (
                <li key={l.id}>
                  {l.href ? (
                    <Link href={l.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** My Money → All: everything you have and everything you owe, in one place. */
export function AllMoney() {
  const { ds, positions } = useFinance();
  const cards = useCardDues();
  const nz = (l: Line) => Math.abs(l.value) > 0.5;

  const have: Block[] = [
    {
      title: "Bank & cash",
      lines: ds.accounts
        .filter((a) => !a.archived)
        .map((a) => ({ id: a.id, label: a.name, sub: a.include_in_cash ? undefined : "Not counted as spendable", value: positions.accounts.get(a.id)?.balanceBase ?? 0, href: `/my-money/account?id=${a.id}`, icon: <EntityIcon kind={a.type === "wallet" || a.type === "cash" ? "wallet" : "bank"} name={a.name} issuer={a.institution} color={a.color} size="sm" /> }))
        .filter(nz),
    },
    {
      title: "People owe me",
      // One line per person, with everything they owe added up.
      lines: [
        ...ds.lendings
          .filter((l) => l.direction === "lent" && !l.written_off)
          .reduce((map, l) => {
            // "Surya — laptop EMI 1/7" and "Surya — laptop EMI 2/7" are both Surya.
            const name = l.person.split(/\s+[—–-]\s+/)[0].trim() || l.person.trim();
            const k = name.toLowerCase();
            const cur = map.get(k) ?? { id: `p:${k}`, label: name, value: 0, href: "/my-money?tab=owed", icon: <EntityIcon kind="person" name={name} size="sm" /> };
            cur.value += positions.lendings.get(l.id)?.outstanding ?? 0;
            return map.set(k, cur);
          }, new Map<string, Line>())
          .values(),
      ]
        .filter(nz)
        .sort((a, b) => b.value - a.value),
    },
    {
      title: "Savings",
      lines: [
        ...[...positions.investments.values()]
          .filter((p) => !p.investment.archived)
          .map((p) => ({ id: p.investment.id, label: p.investment.name, sub: INVESTMENT_TYPE_LABEL[p.investment.type] ?? undefined, value: p.valueBase, href: `/my-money/holding?id=${p.investment.id}`, icon: <EntityIcon kind={p.investment.type === "mutual_fund" ? "fund" : p.investment.type === "stock" || p.investment.type === "etf" ? "stock" : "saving"} name={p.investment.name} size="sm" /> })),
        ...[...positions.chits.values()].map((c) => ({ id: c.chit.id, label: c.chit.name, sub: "Chit · paid in so far", value: c.asset, href: "/my-money?tab=chits", icon: <EntityIcon kind="chit" name={c.chit.name} size="sm" /> })),
      ].filter(nz),
    },
  ];
  const owe: Block[] = [
    {
      title: "Credit cards",
      lines: cards.map((c) => ({ id: c.card.id, label: c.card.name, sub: c.emi > 0.5 ? "Bill, new spends and EMIs to come" : "Bill and new spends", value: c.due, href: `/to-pay/card?id=${c.card.id}`, icon: <EntityIcon kind="card" name={c.card.name} issuer={c.card.issuer} color={c.card.color} size="sm" /> })).filter(nz),
    },
    {
      title: "Loans",
      lines: [...positions.loans.values()]
        .filter((l) => !l.loan.card_id && l.loan.status === "active")
        .map((l) => ({ id: l.loan.id, label: l.loan.name, sub: `${l.state.remainingInstallments} EMIs left`, value: l.state.outstanding, href: "/to-pay?tab=loans", icon: <EntityIcon kind="loan" name={l.loan.name} size="sm" /> }))
        .filter(nz),
    },
    {
      title: "Borrowed",
      lines: ds.lendings
        .filter((l) => l.direction === "borrowed")
        .map((l) => ({ id: l.id, label: l.person, value: positions.lendings.get(l.id)?.outstanding ?? 0, href: "/to-pay?tab=loans", icon: <EntityIcon kind="person" name={l.person} size="sm" /> }))
        .filter(nz),
    },
    {
      title: "Chits still to pay",
      lines: [...positions.chits.values()].map((c) => ({ id: c.chit.id, label: c.chit.name, sub: `${c.remainingCount} installments left`, value: c.liability, href: "/to-pay?tab=chits", icon: <EntityIcon kind="chit" name={c.chit.name} size="sm" /> })).filter(nz),
    },
  ];
  const sum = (bs: Block[]) => bs.reduce((s, b) => s + b.lines.reduce((t, l) => t + l.value, 0), 0);
  const haveTotal = sum(have);
  const oweTotal = sum(owe);
  const net = haveTotal - oweTotal;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl bg-inverse px-4 py-3 text-on-inverse sm:px-5">
        <span className="text-[14px] font-semibold">What I have − what I owe</span>
        <Money value={net} decimals className={cn("text-[20px] font-semibold text-inherit", net < 0 && "text-[#ff8a80]")} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="What I have" total={haveTotal} blocks={have} tone="have" />
        <Section title="What I owe" total={oweTotal} blocks={owe} tone="owe" />
      </div>
      <p className="text-[12.5px] text-ink-3">Card dues include every EMI still to come on the card, so this can be more than this month&apos;s bill.</p>
    </div>
  );
}

/** My Money → All savings: every saving in one list, biggest first. */
export function AllSavings() {
  const { positions, ctx } = useFinance();
  const lines = useMemo(() => {
    const invs = [...positions.investments.values()]
      .filter((p) => !p.investment.archived)
      .map((p) => {
        const put = toBase(p.invested, p.investment.currency, ctx);
        return { id: p.investment.id, label: p.investment.name, sub: INVESTMENT_TYPE_LABEL[p.investment.type] ?? "Saving", value: p.valueBase, gain: p.valueBase - put, put, kind: (p.investment.type === "mutual_fund" ? "fund" : p.investment.type === "stock" || p.investment.type === "etf" ? "stock" : "saving") as "fund" | "stock" | "saving" | "chit" };
      });
    const chits = [...positions.chits.values()].map((c) => ({ id: c.chit.id, label: c.chit.name, sub: "Chit", value: c.asset, gain: c.summary.auctionSavings, put: c.asset, kind: "chit" as const }));
    return [...invs, ...chits].sort((a, b) => b.value - a.value);
  }, [positions, ctx]);
  const total = lines.reduce((s, l) => s + l.value, 0);
  if (!lines.length) return <p className="rounded-2xl border border-dashed border-line-strong p-4 text-[14px] text-ink-2">No savings yet. Add a mutual fund, chit, EPF, stock or FD from its tab.</p>;
  return (
    <section aria-label="All savings" className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-4 border-b border-line px-4 py-2 text-[12px] text-ink-3 sm:px-5">
        <span>Name</span>
        <span className="text-right">Profit</span>
        <span className="w-24 text-right sm:w-28">Value</span>
      </div>
      <ul className="divide-y divide-line/70">
        {lines.map((l) => (
          <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 px-4 py-2.5 sm:px-5">
            <span className="flex min-w-0 items-center gap-3">
              <EntityIcon kind={l.kind} name={l.label} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-[14px]">{l.label}</span>
                <span className="block truncate text-[12px] text-ink-3">{l.sub}</span>
              </span>
            </span>
            <Money value={l.gain} decimals tone="pl" className="text-right text-[13px]" />
            <Money value={l.value} decimals className="w-24 text-right text-[14px] font-semibold sm:w-28" />
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-line px-4 py-3 sm:px-5">
        <span className="text-[14px] font-semibold">Total</span>
        <Money value={total} decimals className="text-[16px] font-semibold" />
      </div>
    </section>
  );
}
