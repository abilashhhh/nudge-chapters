"use client";

import { Building2, LineChart, Plus } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { AllocationBar } from "@/components/charts";
import { AccountCard, HoldingRow, LendingList, PortfolioSummary, RefreshIcon, UpdatePricesSheet } from "@/components/holdings";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { EmptyState, KV, Panel, Tabs } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { diffMonths, formatDate } from "@/lib/dates";
import { INVESTMENT_TYPE_LABEL, MARKET_TYPES, RETIREMENT_TYPES } from "@/lib/engine/defaults";
import { futureValue } from "@/lib/engine/goals";
import type { InvestmentPosition } from "@/lib/engine/ledger";
import { allocation, concentration, domesticSplit } from "@/lib/engine/reports";
import { useFinance } from "@/lib/finance";
import { formatMoney, formatPct } from "@/lib/money";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";

const TABS = ["accounts", "investments", "retirement", "lending", "property"] as const;

export default function AssetsPage() {
  return (
    <Suspense>
      <Assets />
    </Suspense>
  );
}

function Assets() {
  const [tab, setTab] = useTab(TABS, "accounts");
  const { positions } = useFinance();
  const t = positions.totals;
  return (
    <>
      <PageHeader
        title="Assets"
        description="Everything you own or are owed: bank and cash, investments, retirement savings, money lent and property."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              const ui = useUI.getState();
              if (tab === "accounts") ui.openEditor("account");
              else if (tab === "lending") ui.openEditor("lending", undefined, { direction: "lent" });
              else if (tab === "retirement") ui.openEditor("investment", undefined, { type: "epf", asset_class: "debt" });
              else if (tab === "property") ui.openEditor("investment", undefined, { type: "real_estate", asset_class: "real_estate" });
              else ui.openEditor("investment");
            }}
          >
            Add {tab === "accounts" ? "account" : tab === "lending" ? "loan given" : tab === "property" ? "asset" : "investment"}
          </Button>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: "Total assets", v: t.totalAssets },
          { label: "Bank & cash", v: t.allAccounts },
          { label: "Investments", v: t.marketInvestments },
          { label: "Retirement", v: t.retirement },
          { label: "Owed to you + property", v: t.receivables + t.physical + t.chitAssets },
        ].map((k, i) => (
          <div key={k.label} className={cn("rounded-2xl border border-line bg-surface p-4", i === 0 && "col-span-2 md:col-span-1")}>
            <p className="text-[12.5px] text-ink-3">{k.label}</p>
            <Money value={k.v} className="mt-0.5 block text-[19px] font-semibold" />
          </div>
        ))}
      </div>
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "accounts", label: "Bank & cash" },
          { id: "investments", label: "Investments" },
          { id: "retirement", label: "EPF & retirement" },
          { id: "lending", label: "Money lent" },
          { id: "property", label: "Property & other" },
        ]}
      />
      {tab === "accounts" && <Accounts />}
      {tab === "investments" && <Investments />}
      {tab === "retirement" && <Retirement />}
      {tab === "lending" && <LendingList direction="lent" />}
      {tab === "property" && <Property />}
    </>
  );
}

function Accounts() {
  const { ds, positions } = useFinance();
  const [showArchived, setShowArchived] = useState(false);
  const list = ds.accounts.filter((a) => showArchived || !a.archived);
  if (!ds.accounts.length) {
    return <EmptyState icon={Building2} title="Add your first account" body="Bank accounts, cash and wallets — with today's balance." action={<Button variant="primary" onClick={() => useUI.getState().openEditor("account")}>Add account</Button>} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Available cash <Money value={positions.totals.cash} className="font-semibold text-ink" /> · all accounts <Money value={positions.totals.allAccounts} className="font-semibold text-ink" />. Transfers between your
        accounts are never counted as income or spending.
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {list.map((a) => (
          <AccountCard key={a.id} a={a} />
        ))}
      </div>
      {ds.accounts.some((a) => a.archived) && (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? "Hide" : "Show"} archived accounts
        </Button>
      )}
    </div>
  );
}

const GROUPS: { title: string; types: string[] }[] = [
  { title: "Mutual funds", types: ["mutual_fund"] },
  { title: "Stocks & ETFs", types: ["stock", "etf"] },
  { title: "Deposits & bonds", types: ["fd", "rd", "bond"] },
  { title: "Gold", types: ["gold"] },
  { title: "Crypto & other", types: ["crypto", "other"] },
];

function Investments() {
  const { positions, ctx } = useFinance();
  const [prices, setPrices] = useState(false);
  const list = useMemo(
    () => [...positions.investments.values()].filter((p) => !p.investment.archived && !RETIREMENT_TYPES.has(p.investment.type) && p.investment.type !== "real_estate" && p.investment.type !== "vehicle"),
    [positions],
  );
  const alloc = allocation(positions);
  const conc = concentration(positions);
  const split = domesticSplit(positions);
  if (!list.length) {
    return <EmptyState icon={LineChart} title="No investments yet" body="Add mutual funds, stocks, FDs, gold or crypto. SIPs are planned automatically each month." action={<Button variant="primary" onClick={() => useUI.getState().openEditor("investment")}>Add investment</Button>} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <PortfolioSummary list={list} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-ink-3">Values use the prices you last entered. Projections treat future growth as an estimate.</p>
            <Button size="sm" icon={<RefreshIcon />} onClick={() => setPrices(true)}>
              Update prices
            </Button>
          </div>
          {GROUPS.map((g) => {
            const items = list.filter((p) => g.types.includes(p.investment.type));
            if (!items.length) return null;
            const total = items.reduce((s, p) => s + p.valueBase, 0);
            return (
              <Panel key={g.title} title={g.title} description={formatMoney(total, ctx)} flush>
                <div className="hidden grid-cols-3 gap-3 border-b border-line px-4 pb-2 text-right text-[11.5px] text-ink-3 sm:ml-auto sm:grid sm:w-[372px]">
                  <span>Value</span>
                  <span>Gain</span>
                  <span>XIRR</span>
                </div>
                <div className="divide-y divide-line">
                  {items.map((p) => (
                    <HoldingRow key={p.investment.id} p={p} />
                  ))}
                </div>
                <div className="flex gap-2 border-t border-line px-3 py-2">
                  <Button size="sm" variant="ghost" onClick={() => useUI.getState().openTx({ type: "invest_buy", investment_id: items[0].investment.id })}>
                    Record buy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => useUI.getState().openTx({ type: "invest_sell", investment_id: items[0].investment.id })}>
                    Record sale
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Allocation" description="Including bank & cash">
            <AllocationBar items={alloc} />
          </Panel>
          <Panel title="Concentration">
            <ul className="flex flex-col gap-1">
              {conc.top.map((c) => (
                <li key={c.name} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="truncate text-ink-2">{c.name}</span>
                  <span className="num shrink-0">{formatPct(c.share * 100, 0)}</span>
                </li>
              ))}
            </ul>
            {conc.top[0] && conc.top[0].share > 0.4 && <p className="mt-2 text-[12.5px] text-warn">Over 40% sits in one holding.</p>}
            <div className="mt-3 border-t border-line pt-2">
              <KV k="Domestic" v={formatMoney(split.domestic, ctx)} />
              <KV k="International" v={formatMoney(split.international, ctx)} />
            </div>
          </Panel>
        </div>
      </div>
      <UpdatePricesSheet open={prices} onClose={() => setPrices(false)} positions={list.filter((p) => MARKET_TYPES.has(p.investment.type) || p.investment.type === "gold" || p.units == null)} />
    </div>
  );
}

function Retirement() {
  const { positions, ds, today, assumptions, ctx } = useFinance();
  const list = [...positions.investments.values()].filter((p) => !p.investment.archived && RETIREMENT_TYPES.has(p.investment.type));
  const birth = ds.profile.birth_year;
  const yearsLeft = birth ? Math.max(0, ds.profile.retirement_age - (Number(today.slice(0, 4)) - birth)) : null;
  if (!list.length) {
    return (
      <EmptyState
        title="No retirement accounts yet"
        body="Add your EPF (from the EPFO passbook), PPF or NPS. Nudge Chapters never pretends to have live EPFO data — you update the balance when you check it."
        action={<Button variant="primary" onClick={() => useUI.getState().openEditor("investment", undefined, { type: "epf", asset_class: "debt" })}>Add EPF</Button>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-ink-2">
        Balances are what you last entered from your passbook or statement.{" "}
        {yearsLeft != null ? `${yearsLeft} years to your retirement age of ${ds.profile.retirement_age}.` : "Add your birth year in Settings to see retirement projections."}
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {list.map((p) => (
          <RetirementCard key={p.investment.id} p={p} yearsLeft={yearsLeft} rate={p.investment.type === "epf" ? assumptions.scenarios.base.returns.epf : p.investment.interest_rate ?? p.investment.expected_return ?? assumptions.scenarios.base.returns.debt} />
        ))}
      </div>
      <p className="text-[12.5px] text-ink-3">
        Retirement projections are estimates using {formatPct(assumptions.scenarios.base.returns.epf)} for EPF. See Goals → Retirement for the full plan. Total today: {formatMoney(positions.totals.retirement, ctx)}.
      </p>
    </div>
  );
}

function RetirementCard({ p, yearsLeft, rate }: { p: InvestmentPosition; yearsLeft: number | null; rate: number }) {
  const { ds, today, ctx } = useFinance();
  const i = p.investment;
  const monthly = i.type === "epf" ? i.employee_contribution + i.employer_contribution : i.sip_active ? i.sip_amount : 0;
  const hist = ds.investment_valuations.filter((v) => v.investment_id === i.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const projected = yearsLeft != null ? futureValue(p.value, monthly, rate, yearsLeft * 12) : null;
  const stale = i.value_as_of ? diffMonths(i.value_as_of, today) : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="text-left" onClick={() => useUI.getState().openEditor("investment", i.id)}>
          <p className="text-[15px] font-semibold hover:underline">{i.name}</p>
          <p className="text-[12.5px] text-ink-3">
            {INVESTMENT_TYPE_LABEL[i.type]}
            {i.identifier ? ` · ${i.identifier}` : ""}
          </p>
        </button>
        <div className="text-right">
          <Money value={p.value} className="text-[19px] font-semibold" />
          <p className={cn("text-[12px]", stale != null && stale >= 6 ? "text-warn" : "text-ink-3")}>
            {i.value_as_of ? `as of ${formatDate(i.value_as_of)}` : "date unknown"}
            {stale != null && stale >= 6 ? " · time to update" : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 divide-y divide-line">
        {i.type === "epf" && <KV k="Your share + employer's" v={`${formatMoney(i.employee_contribution, ctx)} + ${formatMoney(i.employer_contribution, ctx)} / month`} />}
        {i.type === "epf" && i.pension_contribution > 0 && <KV k="Pension (EPS)" v={`${formatMoney(i.pension_contribution, ctx)} / month`} />}
        {i.type === "epf" && p.estimatedValue > p.value && <KV k="Estimated today (contributions since)" v={<Money value={p.estimatedValue} projected />} />}
        {i.type !== "epf" && monthly > 0 && <KV k="Monthly contribution" v={formatMoney(monthly, ctx)} />}
        <KV k="Total contributed" v={formatMoney(p.invested, ctx)} />
        {projected != null && <KV k={`At retirement (${formatPct(rate)}/yr)`} v={<Money value={projected} projected />} />}
      </div>
      {hist.length > 0 && (
        <div className="mt-3">
          <p className="text-[12.5px] font-medium text-ink-2">Balance history</p>
          <ul className="mt-1 text-[13px]">
            {hist.slice(0, 4).map((v) => (
              <li key={v.id} className="flex justify-between py-0.5">
                <button type="button" className="text-ink-3 hover:underline" onClick={() => useUI.getState().openEditor("valuation", v.id)}>
                  {formatDate(v.date)}
                </button>
                <span className="num">{formatMoney(v.value, ctx)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button size="sm" className="mt-3" onClick={() => useUI.getState().openEditor("valuation", undefined, { investment_id: i.id })}>
        Add passbook balance
      </Button>
    </div>
  );
}

function Property() {
  const { positions, ctx } = useFinance();
  const list = [...positions.investments.values()].filter((p) => !p.investment.archived && (p.investment.type === "real_estate" || p.investment.type === "vehicle"));
  const chits = [...positions.chits.values()].filter((c) => c.asset > 0);
  return (
    <div className="flex flex-col gap-4">
      {list.length === 0 && chits.length === 0 ? (
        <EmptyState
          title="No property or vehicles"
          body="Add a flat, land or a vehicle to include it in your net worth. Vehicles depreciate (−12%/yr by default)."
          action={<Button variant="primary" onClick={() => useUI.getState().openEditor("investment", undefined, { type: "real_estate", asset_class: "real_estate" })}>Add property</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((p) => (
            <div key={p.investment.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <button type="button" className="text-left" onClick={() => useUI.getState().openEditor("investment", p.investment.id)}>
                  <p className="text-[15px] font-semibold hover:underline">{p.investment.name}</p>
                  <p className="text-[12.5px] text-ink-3">
                    {INVESTMENT_TYPE_LABEL[p.investment.type]} · bought for {formatMoney(p.invested, ctx)}
                  </p>
                </button>
                <Money value={p.value} className="text-[18px] font-semibold" />
              </div>
              <p className="mt-2 text-[12.5px] text-ink-3">
                {p.investment.expected_return != null ? `${p.investment.expected_return > 0 ? "Appreciates" : "Depreciates"} ${formatPct(Math.abs(p.investment.expected_return))}/yr in projections` : "Uses your real-estate return assumption"} · value as of{" "}
                {formatDate(p.investment.value_as_of)}
              </p>
              <Button size="sm" className="mt-3" onClick={() => useUI.getState().openEditor("valuation", undefined, { investment_id: p.investment.id })}>
                Update value
              </Button>
            </div>
          ))}
          {chits.map((c) => (
            <div key={c.chit.id} className="rounded-2xl border border-line bg-surface p-4">
              <p className="text-[15px] font-semibold">{c.chit.name}</p>
              <p className="text-[12.5px] text-ink-3">Chit contributions not yet taken out — counted as money owed to you.</p>
              <Money value={c.asset} className="mt-2 block text-[18px] font-semibold" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
