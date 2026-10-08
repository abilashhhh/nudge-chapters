// Future projection engine (PRD §3.2, §17, §41).
//
// A day-by-day event simulator: it starts from today's actual positions, applies
// every pending planned event on its date (overdue items are applied today),
// grows investments at the scenario's assumed returns, and records month-end
// snapshots. Results are estimates and always carry the assumptions behind them.

import { addDays, addMonths, diffDays, endOfMonth, yearsBetween } from "../dates";
import { round2 } from "../money";
import type { AssetClass, Assumptions, Dataset, ISODate, ScenarioAssumptions, ScenarioKey, Transaction } from "../types";
import { resolveAssumptions } from "./defaults";
import { buildEvents, isPending, type FinEvent } from "./events";
import { cardDelta, cashDeltas, classify, computePositions, isOpening, type Positions } from "./ledger";

export interface WhatIf {
  id: string;
  type: "income_change" | "income_stop" | "expense_change" | "one_time" | "recurring";
  label?: string;
  pct?: number;
  from?: ISODate;
  months?: number | null;
  date?: ISODate;
  amount?: number;
  /** For one_time / recurring: money in or out, or invested (moves cash into investments). */
  direction?: "in" | "out" | "invest";
  category?: string;
  assetClass?: AssetClass;
  accountId?: string;
}

export interface ProjectionPoint {
  date: ISODate;
  cash: number;
  allAccounts: number;
  investments: number;
  otherAssets: number;
  liabilities: number;
  netWorth: number;
}

export interface CashBreakdown {
  startCash: number;
  income: number;
  expenses: number;
  cardBills: number;
  emis: number;
  investments: number;
  chitInstallments: number;
  chitPayouts: number;
  repaymentsIn: number;
  repaymentsOut: number;
  transfersNet: number;
  otherActuals: number;
  endCash: number;
}

export interface ProjectionResult {
  scenario: ScenarioAssumptions;
  scenarioKey: ScenarioKey | "custom-inline";
  inflation: number;
  today: ISODate;
  to: ISODate;
  start: ProjectionPoint;
  end: ProjectionPoint;
  series: ProjectionPoint[];
  totals: {
    income: number;
    expenses: number;
    interest: number;
    emi: number;
    cardPayments: number;
    invested: number;
    retirementContributions: number;
    investmentGrowth: number;
    debtReduced: number;
  };
  cash: CashBreakdown;
  lowest: { date: ISODate; cash: number };
  negativeOn: ISODate | null;
  belowMin: { accountId: string; name: string; date: ISODate; balance: number; min: number }[];
  events: FinEvent[];
  /** Each applied event with total available cash right after it. */
  timeline: { event: FinEvent; cashAfter: number }[];
  largeUpcoming: FinEvent[];
  accountsEnd: { id: string; name: string; balance: number; included: boolean }[];
  investmentsEnd: { id: string; name: string; value: number; contributed: number; assetClass: AssetClass }[];
  liabilitiesEnd: { id: string; name: string; kind: "card" | "loan" | "chit" | "borrowed"; amount: number }[];
  inflationFactor: number;
}

export interface ProjectionOptions {
  today: ISODate;
  to: ISODate;
  scenario?: ScenarioKey | ScenarioAssumptions;
  assumptions?: Assumptions;
  whatIfs?: WhatIf[];
  positions?: Positions;
}

const UNASSIGNED = "__unassigned__";

function dailyFactor(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 365);
}

export function project(ds: Dataset, opts: ProjectionOptions): ProjectionResult {
  const assumptions = opts.assumptions ?? resolveAssumptions(ds.profile);
  const scenarioKey = typeof opts.scenario === "string" ? opts.scenario : opts.scenario ? "custom-inline" : "base";
  const sc: ScenarioAssumptions =
    typeof opts.scenario === "object" ? opts.scenario : assumptions.scenarios[(opts.scenario as ScenarioKey) ?? "base"];
  const today = opts.today;
  const to = opts.to < today ? today : opts.to;
  const positions = opts.positions ?? computePositions(ds, today);
  const whatIfs = opts.whatIfs ?? [];

  // ---- Initial state --------------------------------------------------------
  const included = new Set<string>();
  const cash = new Map<string, number>();
  const accountName = new Map<string, string>();
  const minBal = new Map<string, number>();
  let defaultAccount: string | null = null;
  for (const [id, p] of positions.accounts) {
    if (p.account.archived) continue;
    cash.set(id, p.balanceBase);
    accountName.set(id, p.account.name);
    if (p.account.include_in_cash) {
      included.add(id);
      if (!defaultAccount || (p.account.type === "savings" && positions.accounts.get(defaultAccount)?.account.type !== "savings")) {
        defaultAccount = id;
      }
    }
    if (p.account.min_balance > 0) minBal.set(id, p.account.min_balance);
  }
  if (!defaultAccount) {
    defaultAccount = UNASSIGNED;
    cash.set(UNASSIGNED, 0);
    included.add(UNASSIGNED);
    accountName.set(UNASSIGNED, "Unassigned cash");
  }
  const acct = (id?: string | null) => (id && cash.has(id) ? id : defaultAccount!);

  const inv = new Map<string, { name: string; value: number; contributed: number; factor: number; assetClass: AssetClass; physical: boolean; monthly: number }>();
  for (const [id, p] of positions.investments) {
    const i = p.investment;
    if (i.archived) continue;
    let rate = i.expected_return ?? sc.returns[i.asset_class as keyof typeof sc.returns] ?? sc.returns.other;
    if (i.type === "epf") rate = i.expected_return ?? sc.returns.epf;
    if ((i.type === "fd" || i.type === "rd" || i.type === "bond") && i.interest_rate != null && i.expected_return == null) rate = i.interest_rate;
    if (i.type === "vehicle" && i.expected_return == null) rate = -12;
    inv.set(id, {
      name: i.name,
      value: p.valueBase,
      contributed: 0,
      factor: dailyFactor(rate),
      assetClass: i.asset_class,
      physical: i.type === "real_estate" || i.type === "vehicle",
      monthly: i.type === "epf" ? i.employee_contribution + i.employer_contribution : 0,
    });
  }
  const WHATIF_INV = "__whatif__";

  const cards = new Map<string, { name: string; owed: number }>();
  for (const [id, c] of positions.cards) if (!c.card.archived) cards.set(id, { name: c.card.name, owed: Math.max(0, c.outstanding) });

  const loans = new Map<string, { name: string; owed: number }>();
  for (const [id, l] of positions.loans) if (l.loan.status === "active") loans.set(id, { name: l.loan.name, owed: l.state.outstanding });

  const chits = new Map<string, { name: string; asset: number; liability: number; contribution: number; remaining: number; received: boolean }>();
  for (const [id, c] of positions.chits) {
    if (c.chit.status !== "active") continue;
    chits.set(id, {
      name: c.chit.name,
      asset: c.asset,
      liability: c.liability,
      contribution: c.chit.monthly_contribution,
      remaining: c.remainingCount,
      received: c.liability > 0 || c.chit.payout_status === "received",
    });
  }

  const receivable = new Map<string, number>();
  const borrowed = new Map<string, { name: string; owed: number }>();
  for (const [id, l] of positions.lendings) {
    if (l.lending.direction === "lent") receivable.set(id, l.outstanding);
    else borrowed.set(id, { name: l.lending.person, owed: l.outstanding });
  }
  const physicalOther = 0;

  // ---- Events ---------------------------------------------------------------
  const allEvents = buildEvents(ds, { from: today, to, today, scenario: sc, positions });
  const pending = allEvents.filter((e) => isPending(e) && !e.excluded && e.kind !== "card_statement");
  const byDate = new Map<string, { e: FinEvent; amt: number }[]>();
  const applied: FinEvent[] = [];
  const timeline: { event: FinEvent; cashAfter: number }[] = [];
  const includedCash = () => {
    let c = 0;
    for (const id of included) c += cash.get(id) ?? 0;
    return round2(c);
  };
  const pushEv = (date: ISODate, e: FinEvent, amt: number) => {
    const d = date < today ? today : date;
    byDate.set(d, [...(byDate.get(d) ?? []), { e, amt }]);
  };

  for (const e of pending) {
    let amt = e.remaining;
    for (const w of whatIfs) {
      const from = w.from ?? today;
      if (w.type === "income_change" && e.kind === "income" && e.date >= from) amt *= 1 + (w.pct ?? 0) / 100;
      if (w.type === "income_stop" && e.kind === "income" && e.date >= from) {
        const until = w.months ? addMonths(from, w.months) : "9999-12-31";
        if (e.date < until) amt = 0;
      }
      if (
        w.type === "expense_change" &&
        (e.kind === "expense" || e.kind === "card_spend") &&
        e.date >= from &&
        (!w.category || w.category === e.category)
      ) {
        amt *= 1 + (w.pct ?? 0) / 100;
      }
    }
    if (amt > 0.005) pushEv(e.date, e, round2(amt));
  }

  // Synthetic what-if events.
  for (const w of whatIfs) {
    if (w.type !== "one_time" && w.type !== "recurring") continue;
    const dates: ISODate[] = [];
    if (w.type === "one_time" && w.date) dates.push(w.date);
    if (w.type === "recurring") {
      const start = w.from ?? today;
      const n = w.months ?? 10_000;
      for (let i = 0; i < n; i++) {
        const d = addMonths(start, i);
        if (d > to) break;
        dates.push(d);
      }
    }
    for (const d of dates) {
      if (d < today || d > to) continue;
      const kind = w.direction === "in" ? "income" : w.direction === "invest" ? "sip" : "expense";
      const e: FinEvent = {
        key: `whatif:${w.id}:${d}`,
        source: "rule",
        sourceId: w.id,
        occurrence: d,
        date: d,
        kind,
        title: w.label || "What-if",
        amount: w.amount ?? 0,
        paid: 0,
        remaining: w.amount ?? 0,
        status: "planned",
        flow: w.direction === "in" ? "in" : "out",
        accountId: w.accountId,
        investmentId: w.direction === "invest" ? WHATIF_INV : undefined,
        category: w.category ?? "What-if",
        isFixed: true,
        isEssential: false,
        certainty: "known",
        excluded: false,
        estimated: true,
        txIds: [],
      };
      if (w.direction === "invest" && !inv.has(WHATIF_INV)) {
        inv.set(WHATIF_INV, {
          name: "What-if investments",
          value: 0,
          contributed: 0,
          factor: dailyFactor(sc.returns[w.assetClass ?? "equity"]),
          assetClass: w.assetClass ?? "equity",
          physical: false,
          monthly: 0,
        });
      }
      pushEv(d, e, w.amount ?? 0);
    }
  }

  // Actual transactions dated in the future are applied on their date.
  const futureTx = new Map<string, Transaction[]>();
  for (const t of ds.transactions) {
    if (t.date > today && t.date <= to && !isOpening(t)) futureTx.set(t.date, [...(futureTx.get(t.date) ?? []), t]);
  }

  // ---- Simulation -------------------------------------------------------------
  const totals = { income: 0, expenses: 0, interest: 0, emi: 0, cardPayments: 0, invested: 0, retirementContributions: 0, investmentGrowth: 0, debtReduced: 0 };
  const cb: CashBreakdown = {
    startCash: 0, income: 0, expenses: 0, cardBills: 0, emis: 0, investments: 0, chitInstallments: 0,
    chitPayouts: 0, repaymentsIn: 0, repaymentsOut: 0, transfersNet: 0, otherActuals: 0, endCash: 0,
  };
  const moveCash = (id: string, delta: number, bucket: keyof CashBreakdown) => {
    cash.set(id, (cash.get(id) ?? 0) + delta);
    if (included.has(id)) cb[bucket] = (cb[bucket] as number) + Math.abs(delta) * (bucket === "transfersNet" || bucket === "otherActuals" ? Math.sign(delta) : 1);
  };

  const snapshot = (date: ISODate): ProjectionPoint => {
    let c = 0;
    let all = 0;
    for (const [id, v] of cash) {
      all += v;
      if (included.has(id)) c += v;
    }
    let investments = 0;
    let phys = physicalOther;
    for (const v of inv.values()) {
      if (v.physical) phys += v.value;
      else investments += v.value;
    }
    let liabilities = 0;
    for (const v of cards.values()) liabilities += Math.max(0, v.owed);
    for (const v of loans.values()) liabilities += Math.max(0, v.owed);
    for (const v of borrowed.values()) liabilities += Math.max(0, v.owed);
    let other = phys;
    for (const v of receivable.values()) other += Math.max(0, v);
    for (const v of chits.values()) {
      other += v.asset;
      liabilities += v.liability;
    }
    return {
      date,
      cash: round2(c),
      allAccounts: round2(all),
      investments: round2(investments),
      otherAssets: round2(other),
      liabilities: round2(liabilities),
      netWorth: round2(all + investments + other - liabilities),
    };
  };

  const start = snapshot(today);
  cb.startCash = start.cash;
  const series: ProjectionPoint[] = [start];
  let lowest = { date: today, cash: start.cash };
  let negativeOn: ISODate | null = start.cash < 0 ? today : null;
  const belowMin = new Map<string, { accountId: string; name: string; date: ISODate; balance: number; min: number }>();

  const days = diffDays(today, to);
  for (let k = 0; k <= days; k++) {
    const d = addDays(today, k);

    if (k > 0) {
      for (const v of inv.values()) {
        const before = v.value;
        v.value *= v.factor;
        totals.investmentGrowth += v.value - before;
        if (v.monthly > 0 && d.endsWith("-01")) {
          v.value += v.monthly;
          v.contributed += v.monthly;
          totals.retirementContributions += v.monthly;
        }
      }
    }

    for (const t of futureTx.get(d) ?? []) {
      for (const [id, delta] of cashDeltas(t)) moveCash(acct(id), delta, "otherActuals");
      const cd = cardDelta(t);
      if (cd && t.card_id && cards.has(t.card_id)) cards.get(t.card_id)!.owed += cd;
      const cl = classify(t);
      totals.income += cl.income;
      totals.expenses += cl.expense;
      totals.invested += Math.max(0, cl.invested);
      if (t.investment_id && inv.has(t.investment_id)) {
        const v = inv.get(t.investment_id)!;
        if (t.type === "invest_buy") {
          v.value += t.amount;
          v.contributed += t.amount;
        } else if (t.type === "invest_sell") v.value = Math.max(0, v.value - t.amount);
      }
    }

    for (const { e, amt } of byDate.get(d) ?? []) {
      const ev = { ...e, date: d, remaining: amt };
      applied.push(ev);
      switch (e.kind) {
        case "income":
          moveCash(acct(e.accountId), amt, "income");
          totals.income += amt;
          break;
        case "expense":
          moveCash(acct(e.accountId), -amt, "expenses");
          totals.expenses += amt;
          break;
        case "card_spend": {
          const c = e.cardId ? cards.get(e.cardId) : undefined;
          if (c) c.owed += amt;
          else moveCash(acct(e.accountId), -amt, "expenses");
          totals.expenses += amt;
          break;
        }
        case "transfer": {
          const fromId = acct(e.accountId);
          const toId = acct(e.toAccountId);
          cash.set(fromId, (cash.get(fromId) ?? 0) - amt);
          cash.set(toId, (cash.get(toId) ?? 0) + amt);
          if (included.has(fromId) && !included.has(toId)) cb.transfersNet -= amt;
          if (!included.has(fromId) && included.has(toId)) cb.transfersNet += amt;
          break;
        }
        case "card_bill": {
          moveCash(acct(e.accountId), -amt, "cardBills");
          const c = e.cardId ? cards.get(e.cardId) : undefined;
          if (c) c.owed -= amt;
          totals.cardPayments += amt;
          totals.debtReduced += amt;
          break;
        }
        case "emi": {
          const ratio = e.amount > 0 ? amt / e.amount : 1;
          const principal = (e.principal ?? amt) * ratio;
          const interest = (e.interest ?? 0) * ratio;
          if (e.cardId && cards.has(e.cardId)) cards.get(e.cardId)!.owed += amt;
          else moveCash(acct(e.accountId), -amt, "emis");
          const l = e.loanId ? loans.get(e.loanId) : undefined;
          if (l) l.owed = Math.max(0, l.owed - principal);
          totals.emi += amt;
          totals.interest += interest;
          totals.expenses += interest;
          totals.debtReduced += principal;
          break;
        }
        case "sip": {
          moveCash(acct(e.accountId), -amt, "investments");
          const v = e.investmentId ? inv.get(e.investmentId) : undefined;
          if (v) {
            v.value += amt;
            v.contributed += amt;
          }
          totals.invested += amt;
          break;
        }
        case "chit": {
          moveCash(acct(e.accountId), -amt, "chitInstallments");
          const c = e.chitId ? chits.get(e.chitId) : undefined;
          if (c) {
            if (c.received) c.liability = Math.max(0, c.liability - amt);
            else c.asset += amt;
            c.remaining = Math.max(0, c.remaining - 1);
          }
          totals.invested += amt;
          break;
        }
        case "chit_payout": {
          moveCash(acct(e.accountId), amt, "chitPayouts");
          const c = e.chitId ? chits.get(e.chitId) : undefined;
          if (c) {
            c.asset = 0;
            c.received = true;
            c.liability = c.remaining * c.contribution;
          }
          break;
        }
        case "lend_due": {
          moveCash(acct(e.accountId), amt, "repaymentsIn");
          if (e.lendingId) receivable.set(e.lendingId, Math.max(0, (receivable.get(e.lendingId) ?? 0) - amt));
          break;
        }
        case "borrow_due": {
          moveCash(acct(e.accountId), -amt, "repaymentsOut");
          const b = e.lendingId ? borrowed.get(e.lendingId) : undefined;
          if (b) b.owed = Math.max(0, b.owed - amt);
          totals.debtReduced += amt;
          break;
        }
      }
      timeline.push({ event: ev, cashAfter: includedCash() });
    }

    // Daily balance checks.
    let c = 0;
    for (const id of included) c += cash.get(id) ?? 0;
    if (c < lowest.cash) lowest = { date: d, cash: round2(c) };
    if (c < -0.5 && !negativeOn) negativeOn = d;
    for (const [id, min] of minBal) {
      const bal = cash.get(id) ?? 0;
      if (bal < min && !belowMin.has(id)) {
        belowMin.set(id, { accountId: id, name: accountName.get(id) ?? "Account", date: d, balance: round2(bal), min });
      }
    }

    if (d === endOfMonth(d) || d === to) series.push(snapshot(d));
  }

  const end = series[series.length - 1];
  cb.endCash = end.cash;
  for (const key of Object.keys(cb) as (keyof CashBreakdown)[]) cb[key] = round2(cb[key]);
  for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] = round2(totals[key]);

  const largeUpcoming = applied
    .filter((e) => e.flow === "out" || e.kind === "card_spend")
    .filter((e) => e.kind !== "card_spend" || !e.estimated)
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 8);

  const liabilitiesEnd: ProjectionResult["liabilitiesEnd"] = [];
  for (const [id, v] of cards) if (v.owed > 0.5) liabilitiesEnd.push({ id, name: v.name, kind: "card", amount: round2(v.owed) });
  for (const [id, v] of loans) if (v.owed > 0.5) liabilitiesEnd.push({ id, name: v.name, kind: "loan", amount: round2(v.owed) });
  for (const [id, v] of chits) if (v.liability > 0.5) liabilitiesEnd.push({ id, name: v.name, kind: "chit", amount: round2(v.liability) });
  for (const [id, v] of borrowed) if (v.owed > 0.5) liabilitiesEnd.push({ id, name: v.name, kind: "borrowed", amount: round2(v.owed) });

  return {
    scenario: sc,
    scenarioKey,
    inflation: assumptions.inflation,
    today,
    to,
    start,
    end,
    series,
    totals,
    cash: cb,
    lowest,
    negativeOn,
    belowMin: [...belowMin.values()],
    events: applied,
    timeline,
    largeUpcoming,
    accountsEnd: [...cash.entries()].map(([id, v]) => ({ id, name: accountName.get(id) ?? "Account", balance: round2(v), included: included.has(id) })),
    investmentsEnd: [...inv.entries()].map(([id, v]) => ({ id, name: v.name, value: round2(v.value), contributed: round2(v.contributed), assetClass: v.assetClass })),
    liabilitiesEnd,
    inflationFactor: Math.pow(1 + assumptions.inflation / 100, Math.max(0, yearsBetween(today, to))),
  };
}

export function compareScenarios(ds: Dataset, today: ISODate, to: ISODate, positions?: Positions) {
  const assumptions = resolveAssumptions(ds.profile);
  const p = positions ?? computePositions(ds, today);
  return (["conservative", "base", "optimistic"] as const).map((key) => ({
    key,
    result: project(ds, { today, to, scenario: key, assumptions, positions: p }),
  }));
}

// ---------------------------------------------------------------------------
// Large-purchase affordability (PRD §39.21)
// ---------------------------------------------------------------------------

export interface PurchasePlan {
  name: string;
  price: number;
  date: ISODate;
  financing: "cash" | "emi" | "card";
  emiMonths?: number;
  emiRate?: number;
  downPayment?: number;
  accountId?: string;
  cardId?: string;
}

export function purchaseWhatIfs(p: PurchasePlan, dueDateForCard?: ISODate): WhatIf[] {
  if (p.financing === "cash") {
    return [{ id: "purchase", type: "one_time", date: p.date, amount: p.price, direction: "out", label: p.name, accountId: p.accountId }];
  }
  if (p.financing === "card") {
    return [{ id: "purchase", type: "one_time", date: dueDateForCard ?? addMonths(p.date, 1), amount: p.price, direction: "out", label: `${p.name} (card bill)`, accountId: p.accountId }];
  }
  const down = Math.min(p.downPayment ?? 0, p.price);
  const principal = p.price - down;
  const n = Math.max(1, p.emiMonths ?? 12);
  const r = (p.emiRate ?? 0) / 1200;
  const emi = r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const out: WhatIf[] = [
    { id: "purchase-emi", type: "recurring", from: addMonths(p.date, 1), months: n, amount: round2(emi), direction: "out", label: `${p.name} EMI`, accountId: p.accountId },
  ];
  if (down > 0) out.push({ id: "purchase-down", type: "one_time", date: p.date, amount: down, direction: "out", label: `${p.name} down payment`, accountId: p.accountId });
  return out;
}

export function affordability(ds: Dataset, today: ISODate, plan: PurchasePlan, bufferCash = 0) {
  const horizon = addMonths(plan.date > today ? plan.date : today, 12);
  const positions = computePositions(ds, today);
  const base = project(ds, { today, to: horizon, positions });
  const withIt = project(ds, { today, to: horizon, positions, whatIfs: purchaseWhatIfs(plan) });
  const safe = withIt.lowest.cash >= bufferCash && !withIt.negativeOn;
  let saferDate: ISODate | null = null;
  if (!safe) {
    for (let m = 1; m <= 24; m++) {
      const d = addMonths(plan.date, m);
      const test = project(ds, { today, to: addMonths(d, 12), positions, whatIfs: purchaseWhatIfs({ ...plan, date: d }) });
      if (test.lowest.cash >= bufferCash && !test.negativeOn) {
        saferDate = d;
        break;
      }
    }
  }
  return {
    base,
    withPurchase: withIt,
    safe,
    saferDate,
    cashImpactAtHorizon: round2(withIt.end.cash - base.end.cash),
    netWorthImpact: round2(withIt.end.netWorth - base.end.netWorth),
  };
}
