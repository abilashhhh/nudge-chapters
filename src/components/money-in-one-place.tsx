"use client";

import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Money } from "@/components/money";
import { formatDate, formatMonthLong } from "@/lib/dates";
import { isPending, type FinEvent } from "@/lib/engine/events";
import type { MonthMetrics } from "@/lib/engine/metrics";
import { useFinance } from "@/lib/finance";
import type { Period } from "./period-summary";

type Item = { id: string; name: string; sub?: string | null; value: number; href: string };
type Group = { title: string; href: string; items: Item[] };

const nz = (i: Item) => Math.abs(i.value) >= 0.5;
const sum = (gs: Group[]) => gs.reduce((s, g) => s + g.items.reduce((t, i) => t + i.value, 0), 0);

/**
 * What you have and what you owe, on one screen.
 *  - All time: every balance — accounts, investments, IOUs, cards, loans, chits (same totals as net worth).
 *  - This / next month: today's balances, plus only what falls due in that month — that month's card bills,
 *    EMIs, chit installments and repayments, never a loan's whole balance or other months' instalments.
 * Every row opens its section.
 */
export function MoneyInOnePlace({ period, metrics }: { period: Period; metrics: MonthMetrics | null }) {
  const { positions } = useFinance();
  const t = positions.totals;

  const { have, owe, haveTotal, oweTotal } = useMemo(() => {
    const accounts = [...positions.accounts.values()]
      .filter((p) => !p.account.archived)
      .map((p) => ({ id: p.account.id, name: p.account.name, sub: p.account.institution, value: p.balanceBase, href: "/assets?tab=accounts" }));
    const invest = [...positions.investments.values()].filter((p) => !p.investment.archived);
    const isPhysical = (p: (typeof invest)[number]) => p.investment.type === "real_estate" || p.investment.type === "vehicle";
    const investments = invest.filter((p) => !isPhysical(p)).map((p) => ({ id: p.investment.id, name: p.investment.name, sub: p.investment.institution, value: p.valueBase, href: "/assets?tab=investments" }));
    const physical = invest.filter(isPhysical).map((p) => ({ id: p.investment.id, name: p.investment.name, value: p.valueBase, href: "/assets?tab=property" }));
    const balances: Group[] = [
      { title: "Bank & cash", href: "/assets?tab=accounts", items: accounts.filter(nz) },
      { title: "Investments", href: "/assets?tab=investments", items: investments.filter(nz) },
      { title: "Property & vehicles", href: "/assets?tab=property", items: physical.filter(nz) },
    ];
    const lendings = [...positions.lendings.values()];

    if (period === "all" || !metrics) {
      const chits = [...positions.chits.values()];
      const lent = lendings.filter((p) => p.lending.direction === "lent").map((p) => ({ id: p.lending.id, name: p.lending.person, value: p.outstanding, href: "/owed" }));
      const borrowed = lendings.filter((p) => p.lending.direction === "borrowed").map((p) => ({ id: p.lending.id, name: p.lending.person, value: p.outstanding, href: "/liabilities?tab=borrowed" }));
      const have: Group[] = [
        ...balances,
        { title: "Owed to you", href: "/owed", items: lent.filter(nz) },
        { title: "Chits", href: "/liabilities?tab=chits", items: chits.map((p) => ({ id: p.chit.id, name: p.chit.name, value: p.asset, href: "/liabilities?tab=chits" })).filter(nz) },
      ];
      const owe: Group[] = [
        {
          title: "Credit cards",
          href: "/liabilities?tab=cards",
          items: [...positions.cards.values()]
            .filter((p) => !p.card.archived)
            .map((p) => ({ id: p.card.id, name: p.card.name, sub: p.card.last4 ? `•• ${p.card.last4}` : p.card.issuer, value: Math.max(0, p.outstanding), href: "/liabilities?tab=cards" }))
            .filter(nz),
        },
        {
          title: "Loans & EMIs",
          href: "/liabilities?tab=loans",
          items: [...positions.loans.values()]
            .filter((p) => p.loan.status === "active")
            .map((p) => ({ id: p.loan.id, name: p.loan.name, sub: p.loan.lender, value: p.state.outstanding, href: "/liabilities?tab=loans" }))
            .filter(nz),
        },
        { title: "Borrowed", href: "/liabilities?tab=borrowed", items: borrowed.filter(nz) },
        { title: "Chits", href: "/liabilities?tab=chits", items: chits.map((p) => ({ id: p.chit.id, name: p.chit.name, value: p.liability, href: "/liabilities?tab=chits" })).filter(nz) },
      ];
      return { have: have.filter((g) => g.items.length), owe: owe.filter((g) => g.items.length), haveTotal: t.totalAssets, oweTotal: t.totalLiabilities };
    }

    // A month: only what falls due in it (the current month also carries anything overdue).
    const due = metrics.events.filter((e) => isPending(e) && !e.excluded && e.remaining >= 0.5);
    const row = (e: FinEvent, href: string): Item => ({ id: e.key, name: e.title, sub: formatDate(e.date), value: e.remaining, href });
    const byKind = (kinds: FinEvent["kind"][], href: string, keep: (e: FinEvent) => boolean = () => true) =>
      due.filter((e) => kinds.includes(e.kind) && keep(e)).sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => row(e, href));
    // IOUs without a date have no month of their own; they're due whenever, so they show in the current month.
    const undated = (dir: "lent" | "borrowed", href: string): Item[] =>
      metrics.period !== "current"
        ? []
        : lendings
            .filter((p) => p.lending.direction === dir && !p.lending.expected_date && !p.lending.written_off)
            .map((p) => ({ id: p.lending.id, name: p.lending.person, sub: "no date set", value: p.outstanding, href }))
            .filter(nz);

    const have: Group[] = [
      ...balances,
      { title: "Due to you", href: "/owed", items: [...byKind(["lend_due"], "/owed"), ...undated("lent", "/owed")] },
      { title: "Chit payouts", href: "/liabilities?tab=chits", items: byKind(["chit_payout"], "/liabilities?tab=chits") },
    ];
    const owe: Group[] = [
      { title: "Credit card bills", href: "/liabilities?tab=cards", items: byKind(["card_bill"], "/liabilities?tab=cards") },
      { title: "EMIs", href: "/liabilities?tab=loans", items: byKind(["emi"], "/liabilities?tab=loans", (e) => e.flow === "out") },
      { title: "Chit installments", href: "/liabilities?tab=chits", items: byKind(["chit"], "/liabilities?tab=chits") },
      { title: "Repay", href: "/liabilities?tab=borrowed", items: [...byKind(["borrow_due"], "/liabilities?tab=borrowed"), ...undated("borrowed", "/liabilities?tab=borrowed")] },
    ];
    const h = have.filter((g) => g.items.length);
    const o = owe.filter((g) => g.items.length);
    return { have: h, owe: o, haveTotal: sum(h), oweTotal: sum(o) };
  }, [positions, period, metrics, t.totalAssets, t.totalLiabilities]);

  const monthName = metrics ? formatMonthLong(metrics.month).split(" ")[0] : "";
  return (
    <section aria-labelledby="one-place" className="rounded-2xl border border-line bg-surface">
      <header className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div>
          <h2 id="one-place" className="text-[15px] font-semibold">
            {period === "all" ? "Everything you have and owe" : `What you have and owe in ${monthName}`}
          </h2>
          {period !== "all" && <p className="mt-0.5 text-[12.5px] text-ink-3">Today&apos;s balances, plus only what falls due in {monthName}.</p>}
        </div>
        <Link href="/money" className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
          Details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>
      <div key={period} className="animate-fade grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        <Side label="You have" total={haveTotal} groups={have} empty="Add a bank account to get started." />
        <Side
          label={period === "all" ? "You owe" : `Due in ${monthName}`}
          total={oweTotal}
          groups={owe}
          empty={period === "all" ? "No debts — nice." : `Nothing due in ${monthName}.`}
          tone="out"
        />
      </div>
    </section>
  );
}

function Side({ label, total, groups, empty, tone }: { label: string; total: number; groups: Group[]; empty: ReactNode; tone?: "out" }) {
  return (
    <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
      <div className="flex items-baseline justify-between border-b border-line pb-2">
        <span className="text-[13px] font-medium text-ink-3">{label}</span>
        <Money value={total} className={tone === "out" ? "text-[18px] font-semibold text-danger" : "text-[18px] font-semibold"} />
      </div>
      {groups.length === 0 ? (
        <p className="pt-3 text-[13.5px] text-ink-3">{empty}</p>
      ) : (
        groups.map((g) => (
          <div key={g.title} className="pt-3">
            <Link href={g.href} className="flex items-center justify-between text-[12px] font-medium uppercase tracking-wide text-ink-3 hover:text-ink">
              {g.title}
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
            <ul className="mt-1">
              {g.items.map((i) => (
                <li key={i.id}>
                  <Link
                    href={i.href}
                    className="group -mx-2 flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-[14px] transition-colors hover:bg-surface-3/60 active:bg-surface-3"
                  >
                    <span className="min-w-0 truncate">
                      {i.name}
                      {i.sub && <span className="ml-1.5 text-[12px] text-ink-3">{i.sub}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Money value={i.value} className="font-medium" />
                      <ChevronRight className="h-3.5 w-3.5 self-center text-ink-3 opacity-40 transition-opacity group-hover:opacity-100" aria-hidden />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
