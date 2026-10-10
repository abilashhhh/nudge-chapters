"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { Money } from "@/components/money";
import { useFinance } from "@/lib/finance";

type Item = { id: string; name: string; sub?: string | null; value: number };
type Group = { title: string; href: string; items: Item[] };

const nz = (i: Item) => Math.abs(i.value) >= 0.5;

/**
 * Every account, investment, card, loan, chit and IOU on one screen — what you have on the left,
 * what you owe on the right. Uses the same positions (and the same inclusion rules) as the totals,
 * so the numbers here always add up to the headline figures.
 */
export function MoneyInOnePlace() {
  const { positions } = useFinance();
  const t = positions.totals;

  const { have, owe } = useMemo(() => {
    const accounts = [...positions.accounts.values()]
      .filter((p) => !p.account.archived)
      .map((p) => ({ id: p.account.id, name: p.account.name, sub: p.account.institution, value: p.balanceBase }));
    const invest = [...positions.investments.values()].filter((p) => !p.investment.archived);
    const isPhysical = (p: (typeof invest)[number]) => p.investment.type === "real_estate" || p.investment.type === "vehicle";
    const investments = invest.filter((p) => !isPhysical(p)).map((p) => ({ id: p.investment.id, name: p.investment.name, sub: p.investment.institution, value: p.valueBase }));
    const physical = invest.filter(isPhysical).map((p) => ({ id: p.investment.id, name: p.investment.name, value: p.valueBase }));
    const lendings = [...positions.lendings.values()];
    const lent = lendings.filter((p) => p.lending.direction === "lent").map((p) => ({ id: p.lending.id, name: p.lending.person, value: p.outstanding }));
    const borrowed = lendings.filter((p) => p.lending.direction === "borrowed").map((p) => ({ id: p.lending.id, name: p.lending.person, value: p.outstanding }));
    const chits = [...positions.chits.values()];
    const cards = [...positions.cards.values()]
      .filter((p) => !p.card.archived)
      .map((p) => ({ id: p.card.id, name: p.card.name, sub: p.card.last4 ? `•• ${p.card.last4}` : p.card.issuer, value: Math.max(0, p.outstanding) }));
    const loans = [...positions.loans.values()]
      .filter((p) => p.loan.status === "active")
      .map((p) => ({ id: p.loan.id, name: p.loan.name, sub: p.loan.lender, value: p.state.outstanding }));

    const have: Group[] = [
      { title: "Bank & cash", href: "/assets", items: accounts },
      { title: "Investments", href: "/assets?tab=investments", items: investments.filter(nz) },
      { title: "Property & vehicles", href: "/assets?tab=property", items: physical.filter(nz) },
      { title: "Owed to you", href: "/owed", items: lent.filter(nz) },
      { title: "Chits", href: "/liabilities?tab=chits", items: chits.map((p) => ({ id: p.chit.id, name: p.chit.name, value: p.asset })).filter(nz) },
    ];
    const owe: Group[] = [
      { title: "Credit cards", href: "/liabilities", items: cards.filter(nz) },
      { title: "Loans & EMIs", href: "/liabilities?tab=loans", items: loans.filter(nz) },
      { title: "Borrowed", href: "/liabilities?tab=borrowed", items: borrowed.filter(nz) },
      { title: "Chits", href: "/liabilities?tab=chits", items: chits.map((p) => ({ id: p.chit.id, name: p.chit.name, value: p.liability })).filter(nz) },
    ];
    return { have: have.filter((g) => g.items.length), owe: owe.filter((g) => g.items.length) };
  }, [positions]);

  return (
    <section aria-labelledby="one-place" className="rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between px-4 pt-4 sm:px-5">
        <h2 id="one-place" className="text-[15px] font-semibold">
          Everything you have and owe
        </h2>
        <Link href="/money" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
          Details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>
      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        <Side label="You have" total={t.totalAssets} groups={have} empty="Add a bank account to get started." />
        <Side label="You owe" total={t.totalLiabilities} groups={owe} empty="No debts — nice." tone="out" />
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
                <li key={i.id} className="flex items-baseline justify-between gap-3 py-1 text-[14px]">
                  <span className="min-w-0 truncate">
                    {i.name}
                    {i.sub && <span className="ml-1.5 text-[12px] text-ink-3">{i.sub}</span>}
                  </span>
                  <Money value={i.value} className="shrink-0 font-medium" />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
