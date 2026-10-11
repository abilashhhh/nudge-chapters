"use client";

import { AlertTriangle, Plus, Target } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { addMonths, addYears, endOfMonth, formatDate, formatMonthLong, monthKey } from "@/lib/dates";
import { purchaseCheck } from "@/lib/engine/phase2";
import { project } from "@/lib/engine/projection";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useUI } from "@/lib/ui";
import { Money } from "../money";
import { Button } from "../ui/button";
import { AmountInput, DateInput, Field, Input } from "../ui/form";
import { EmptyState, Progress } from "../ui/misc";
import { monthLabel } from "./month-grid";
import { ChipGroup, StatTile, V2PageHeader } from "./ui";
import { Cell2, DataTable, Details } from "./data-table";

type DatePick = "eom" | "fy" | "1y" | "3y" | "custom";

export function FutureScreen() {
  const { ds, today, positions, assumptions } = useFinance();
  const params = useSearchParams();
  const fyEnd = (() => {
    const y = Number(today.slice(0, 4));
    const mar = `${y}-03-31`;
    return today <= mar ? mar : `${y + 1}-03-31`;
  })();
  const presets: Record<Exclude<DatePick, "custom">, string> = { eom: endOfMonth(today), fy: fyEnd, "1y": addYears(today, 1), "3y": addYears(today, 3) };
  const initial = params.get("date");
  const [pick, setPick] = useState<DatePick>(initial ? "custom" : "1y");
  const [custom, setCustom] = useState(initial && initial > today ? initial : addYears(today, 2));
  const date = pick === "custom" ? (custom > today ? custom : addMonths(today, 1)) : presets[pick];

  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h) setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  const res = useMemo(() => project(ds, { today, to: date, positions, assumptions, scenario: "base" }), [ds, today, date, positions, assumptions]);
  const year = useMemo(() => project(ds, { today, to: endOfMonth(addMonths(today, 11)), positions, assumptions, scenario: "base" }), [ds, today, positions, assumptions]);

  const rows = useMemo(() => {
    const out: { month: string; in: number; out: number; left: number }[] = [];
    let prev = year.start.cash;
    const by = new Map<string, { in: number; out: number; left: number }>();
    for (const t of year.timeline) {
      const k = monthKey(t.event.date);
      const d = t.cashAfter - prev;
      prev = t.cashAfter;
      const r = by.get(k) ?? { in: 0, out: 0, left: t.cashAfter };
      if (d > 0) r.in += d;
      else r.out -= d;
      r.left = t.cashAfter;
      by.set(k, r);
    }
    let carry = year.start.cash;
    for (let i = 0; i < 12; i++) {
      const k = monthKey(addMonths(today, i));
      const r = by.get(k);
      if (r) carry = r.left;
      out.push({ month: k, in: r?.in ?? 0, out: r?.out ?? 0, left: carry });
    }
    return out;
  }, [year, today]);

  return (
    <>
      <V2PageHeader title="Future" />

      <section aria-labelledby="pick" className="mb-8">
        <h2 id="pick" className="mb-2 text-[16px] font-semibold">
          Pick a date
        </h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ChipGroup
            label="Date"
            value={pick}
            onChange={setPick}
            options={[
              { id: "eom", label: "End of month" },
              { id: "fy", label: "31 Mar" },
              { id: "1y", label: "1 year" },
              { id: "3y", label: "3 years" },
              { id: "custom", label: "Pick a date" },
            ]}
          />
          {pick === "custom" && <DateInput aria-label="Date" value={custom} min={today} onChange={(e) => setCustom(e.target.value)} className="w-44" />}
        </div>
        <p className="mb-3 text-[13.5px] text-ink-2">
          On <strong>{formatDate(date, "long")}</strong> you could have (estimate):
        </p>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <StatTile label="Money in bank" value={res.end.cash} projected />
          <StatTile label="Savings" value={res.end.investments + res.end.otherAssets} projected />
          <StatTile label="Still to pay" value={res.end.liabilities} projected />
          <StatTile label="Total worth" value={res.end.netWorth} projected />
        </div>
        {res.negativeOn && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-[13.5px] text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            Your bank money could go below zero on {formatDate(res.negativeOn)}. Lowest: {formatMoney(res.lowest.cash, { currency: ds.profile.currency, locale: ds.profile.locale })}.
          </p>
        )}
        <p className="mt-2 hidden text-[12px] text-ink-3 lg:block">Based on your salary, bills, EMIs and savings plans as they are today. Violet numbers are estimates, not promises.</p>
      </section>

      <section aria-labelledby="next12" className="mb-8">
        <h2 id="next12" className="mb-2 text-[16px] font-semibold">
          Next 12 months
        </h2>
        <DataTable
          label="Next 12 months"
          rows={rows.map((r, i) => ({ ...r, i }))}
          rowKey={(r) => r.month}
          rowClassName={(r) => (r.left < 0 ? "bg-danger-soft" : undefined)}
          columns={[
            {
              key: "m",
              header: "Month",
              cell: (r) => (
                <Cell2
                  main={monthLabel(r.month)}
                  sub={r.left < 0 ? <span className="font-semibold text-danger">⚠ below zero</span> : r.i === 0 ? "rest of month" : undefined}
                />
              ),
            },
            { key: "l", header: "Left in bank", align: "right", cell: (r) => <Money value={r.left} projected className={cn("font-semibold", r.left < 0 && "text-danger")} /> },
          ]}
          details={(r) => (
            <Details
              items={[
                ["Money in", <Money key="i" value={r.in} projected />],
                ["Money out", <Money key="o" value={r.out} projected />],
              ]}
            />
          )}
        />
      </section>

      <Goals />
      <Afford />
    </>
  );
}

const GOAL_STATUS: Record<string, { word: string; cls: string }> = {
  done: { word: "✓ Reached", cls: "text-ok" },
  on_track: { word: "✓ On track", cls: "text-ok" },
  off_track: { word: "⚠ Behind", cls: "text-warn" },
  no_date: { word: "○ No date", cls: "text-ink-3" },
  not_funded: { word: "○ Not started", cls: "text-ink-3" },
};

function Goals() {
  const { goals, ctx } = useFinance();
  const ui = useUI.getState();
  const list = goals.filter((g) => g.goal.kind !== "retirement" || g.goal.target_amount > 0).sort((a, b) => a.goal.priority - b.goal.priority);
  const m = (n: number) => formatMoney(n, ctx);
  return (
    <section id="goals" aria-labelledby="goals-h" className="mb-8 scroll-mt-20">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="goals-h" className="text-[16px] font-semibold">
          Goals
        </h2>
        <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => ui.openEditor("goal")}>
          New goal
        </Button>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={Target} title="No goals yet" body="A trip, a bike, an emergency fund — add a target amount and date and see what to save each month." />
      ) : (
        <DataTable
          label="Goals"
          rows={list}
          rowKey={(g) => g.goal.id}
          columns={[
            {
              key: "g",
              header: "Goal",
              cell: (g) => (
                <span className="block min-w-0">
                  <span className="block font-medium">{g.goal.name}</span>
                  <Progress className="mt-1 max-w-[10rem]" value={g.progress} tone={g.status === "off_track" ? "warn" : "brand"} label={`${g.goal.name} saved`} />
                </span>
              ),
            },
            { key: "s", header: "Status", cell: (g) => <span className={cn("text-[12.5px] font-medium", (GOAL_STATUS[g.status] ?? GOAL_STATUS.no_date).cls)}>{(GOAL_STATUS[g.status] ?? GOAL_STATUS.no_date).word}</span> },
          ]}
          details={(g) => (
            <Details
              items={[
                ["Target", m(g.goal.target_amount)],
                ["Saved", m(g.value)],
                ["Need per month", g.requiredMonthly != null && g.status !== "done" ? <Money key="r" value={g.requiredMonthly} projected /> : "–"],
                ["Target date", g.goal.target_date ? formatDate(g.goal.target_date) : "–"],
              ]}
              actions={
                <Button size="sm" variant="ghost" onClick={() => ui.openEditor("goal", g.goal.id)}>
                  Edit
                </Button>
              }
            />
          )}
        />
      )}
    </section>
  );
}

function Afford() {
  const { ds, today, positions, ctx } = useFinance();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [price, setPrice] = useState<number | null>(params.get("amount") ? Number(params.get("amount")) : null);
  const [when, setWhen] = useState((params.get("date") ?? today).slice(0, 7));
  const result = useMemo(
    () => (price && price > 0 ? purchaseCheck(ds, positions, today, { name: name || "This", price, month: `${when}-01` < today ? today : `${when}-01`, priority: 3, financing: "cash" }) : null),
    [ds, positions, today, name, price, when],
  );
  const m = (n: number) => formatMoney(n, ctx);
  return (
    <section id="afford" aria-labelledby="afford-h" className="scroll-mt-20">
      <h2 id="afford-h" className="mb-2 text-[16px] font-semibold">
        Can I afford it?
      </h2>
      <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="What" htmlFor="af-name" optional>
            <Input id="af-name" value={name} placeholder="e.g. New phone" onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Price" htmlFor="af-price">
            <AmountInput id="af-price" value={price} onChange={setPrice} />
          </Field>
          <Field label="When" htmlFor="af-when">
            <Input id="af-when" type="month" value={when} min={today.slice(0, 7)} onChange={(e) => setWhen(e.target.value || today.slice(0, 7))} />
          </Field>
        </div>
        {result && (
          <div
            className={cn(
              "mt-4 rounded-xl px-4 py-3",
              result.verdict === "fits" ? "bg-ok-soft text-ok" : result.verdict === "slows_goals" ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger",
            )}
            role="status"
          >
            <p className="display text-[22px] font-semibold">
              {result.verdict === "fits" ? "Yes" : result.verdict === "slows_goals" ? "Yes, but it slows your goals" : result.earliestFree ? `Wait until ${formatMonthLong(result.earliestFree)}` : "Not in the next 2 years"}
            </p>
            <p className="mt-1 text-[13.5px] text-ink-2">
              {result.verdict === "fits" && `${name || "It"} fits in the money you have free by ${formatMonthLong(when)}, without touching your goals.`}
              {result.verdict === "slows_goals" && `To pay ${m(price!)} by ${formatMonthLong(when)} you'd take ${result.impacts.map((i) => `${m(i.amount)} from ${i.name}`).join(", ")}.${result.earliestFree ? ` Without slowing any goal: ${formatMonthLong(result.earliestFree)}.` : ""}`}
              {result.verdict === "not_yet" && `${m(price!)} doesn't fit by ${formatMonthLong(when)} after your bills, EMIs and goals.${result.earliestFree ? ` It fits from ${formatMonthLong(result.earliestFree)} (estimate).` : ""}`}
            </p>
            {result.verdict !== "fits" && price && (
              <Button size="sm" className="mt-2" onClick={() => useUI.getState().openEditor("goal", undefined, { name: name || "Purchase", target_amount: price, target_date: `${result.earliestFree ?? when}-28` })}>
                Make it a goal
              </Button>
            )}
          </div>
        )}
        <p className="mt-3 hidden text-[12px] text-ink-3 lg:block">An estimate from your plans — not advice.</p>
      </div>
    </section>
  );
}
