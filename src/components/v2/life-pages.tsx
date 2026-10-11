"use client";

import { Bell, Check, ExternalLink, Plus, Search, StickyNote } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { addDays, formatDate } from "@/lib/dates";
import { buyOrWait } from "@/lib/engine/life";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import type { LifeItem, LifeKind } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { ChecklistCard, NoteCard, TaskRow, useLifeActions } from "../life";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { EmptyState } from "../ui/misc";
import { StatusText, V2PageHeader } from "./ui";

const REPEAT: Record<LifeItem["repeat"], string> = { none: "Once", daily: "Every day", weekly: "Every week", monthly: "Every month", yearly: "Every year" };

function useItems(kinds: LifeKind[], showDone: boolean, q: string) {
  const { ds } = useFinance();
  return useMemo(() => {
    const query = q.trim().toLowerCase();
    return ds.life_items.filter((i) => {
      if (!kinds.includes(i.kind)) return false;
      if (!showDone && i.status !== "open") return false;
      if (query && !`${i.title} ${i.body ?? ""} ${i.tags.join(" ")} ${(i.data?.items ?? []).map((e) => e.text).join(" ")}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [ds.life_items, kinds, showDone, q]);
}

function Toolbar({ q, setQ, showDone, setShowDone, doneLabel, kind, addLabel }: { q: string; setQ: (s: string) => void; showDone: boolean; setShowDone: (b: boolean) => void; doneLabel: string; kind: LifeKind; addLabel: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openLife(kind)}>
        {addLabel}
      </Button>
      <div className="relative min-w-[12rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input aria-label="Search" placeholder="Search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink-2">
        <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
        {doneLabel}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function NotesScreen() {
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const items = useItems(["note"], showDone, q);
  return (
    <>
      <V2PageHeader title="Notes" meaning="Free text notes. Pin the important ones to the top." />
      <Toolbar q={q} setQ={setQ} showDone={showDone} setShowDone={setShowDone} doneLabel="Show archived" kind="note" addLabel="New note" />
      {items.length === 0 ? (
        <EmptyState icon={StickyNote} title={q ? "Nothing matches" : "No notes yet"} body="Ideas, research, account details you need to remember — anything." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...items].sort((a, b) => Number(b.pinned) - Number(a.pinned)).map((i) => (
            <NoteCard key={i.id} item={i} />
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

export function RemindersScreen() {
  const { today } = useFinance();
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const items = useItems(["reminder"], showDone, q);
  const act = useLifeActions();
  const sorted = [...items].sort((a, b) => (a.status !== b.status ? (a.status === "open" ? -1 : 1) : (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1));
  return (
    <>
      <V2PageHeader title="Reminders" meaning="A date, a time and how often it repeats. It rings an alarm when it's due." />
      <Toolbar q={q} setQ={setQ} showDone={showDone} setShowDone={setShowDone} doneLabel="Show done" kind="reminder" addLabel="New reminder" />
      {sorted.length === 0 ? (
        <EmptyState icon={Bell} title={q ? "Nothing matches" : "No reminders yet"} body="Insurance renewal, a document that expires, a monthly money check — set it once and get an alarm." />
      ) : (
        <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
          <table className="v2-table w-full min-w-[34rem] text-[13.5px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-3 py-2.5 font-medium">When</th>
                <th className="px-3 py-2.5 font-medium">What</th>
                <th className="px-3 py-2.5 font-medium">Repeats</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((i) => {
                const done = i.status !== "open";
                const st = done ? "paid" : !i.due_date ? "upcoming" : i.due_date < today ? "late" : i.due_date <= addDays(today, 7) ? "due" : "upcoming";
                return (
                  <tr key={i.id} className={cn("border-t border-line", done && "text-ink-3")}>
                    <td className="num whitespace-nowrap px-3 py-2.5">
                      {i.due_date ? formatDate(i.due_date, "short") : "No date"}
                      {i.due_time ? ` · ${i.due_time}` : ""}
                    </td>
                    <td className="px-3 py-2.5">
                      <button type="button" className={cn("text-left font-medium hover:underline", done && "line-through")} onClick={() => useUI.getState().openLife("reminder", i.id)}>
                        {i.title}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">{REPEAT[i.repeat]}</td>
                    <td className="px-3 py-2.5">{done ? (
                        <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ok">
                          <Check className="h-3.5 w-3.5" aria-hidden /> Done
                        </span>
                      ) : (
                        <StatusText status={st} />
                      )}</td>
                    <td className="px-2 py-1.5">
                      <Button size="sm" variant="ghost" onClick={() => (done ? act.reopen(i) : act.complete(i))}>
                        {done ? "Not done" : "Done"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

export function TodoScreen() {
  const { today } = useFinance();
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const items = useItems(["task", "checklist"], showDone, q);
  const open = items.filter((i) => i.status === "open");
  const tasks = open.filter((i) => i.kind === "task");
  const week = addDays(today, 7);
  const groups: [string, LifeItem[], boolean][] = [
    ["Late", tasks.filter((i) => i.due_date && i.due_date < today), true],
    ["Today", tasks.filter((i) => i.due_date === today), false],
    ["This week", tasks.filter((i) => i.due_date && i.due_date > today && i.due_date <= week), false],
    ["Later", tasks.filter((i) => !i.due_date || i.due_date > week), false],
    ["Done", items.filter((i) => i.kind === "task" && i.status !== "open"), false],
  ];
  const lists = items.filter((i) => i.kind === "checklist");
  return (
    <>
      <V2PageHeader
        title="To-do & checklists"
        meaning="Things to get done, and lists with steps."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openLife("checklist")}>
            New checklist
          </Button>
        }
      />
      <Toolbar q={q} setQ={setQ} showDone={showDone} setShowDone={setShowDone} doneLabel="Show done" kind="task" addLabel="New to-do" />
      {tasks.length === 0 && lists.length === 0 && !showDone ? (
        <EmptyState title={q ? "Nothing matches" : "Nothing to do"} body="Add a to-do with a date, or a checklist with steps (a travel list, a monthly bike check)." />
      ) : (
        <div className="flex flex-col gap-4">
          {groups
            .filter(([, list]) => list.length)
            .map(([label, list, red]) => (
              <section key={label} className="rounded-2xl border border-line bg-surface p-2 sm:p-3" aria-label={label}>
                <h2 className={cn("px-2 pb-1 pt-1 text-[12.5px] font-semibold", red ? "text-danger" : "text-ink-3")}>
                  {label} · {list.length}
                </h2>
                {list.map((i) => (
                  <TaskRow key={i.id} item={i} />
                ))}
              </section>
            ))}
          {lists.length > 0 && (
            <section aria-label="Checklists">
              <h2 className="mb-2 text-[16px] font-semibold">Checklists</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {lists.map((i) => (
                  <ChecklistCard key={i.id} item={i} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

const VERDICT_WORD = { buy: "Buy now", wait: "Wait", save_first: "Save first", consider: "Buy now — check your safety net", unknown: "Add a price" } as const;
const VERDICT_CLS = { buy: "text-ok", wait: "text-warn", save_first: "text-future-ink", consider: "text-warn", unknown: "text-ink-3" } as const;

export function WishlistScreen() {
  const { month, norms, ef, ctx } = useFinance();
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const items = useItems(["wishlist"], showDone, q);
  const m = (n: number) => formatMoney(n, ctx);
  return (
    <>
      <V2PageHeader title="Wishlist" meaning="Things you want to buy, with a simple “Buy now / Wait / Save first” for each." />
      <Toolbar q={q} setQ={setQ} showDone={showDone} setShowDone={setShowDone} doneLabel="Show bought" kind="wishlist" addLabel="Add an item" />
      {items.length === 0 ? (
        <EmptyState title={q ? "Nothing matches" : "Your wishlist is empty"} body="Add the price now and then — you'll see whether to buy, wait for a better price or save first." />
      ) : (
        <div className="-mx-4 overflow-x-auto border-y border-line bg-surface sm:mx-0 sm:rounded-2xl sm:border">
          <table className="v2-table w-full min-w-[38rem] text-[13.5px]">
            <thead className="text-left text-[12px] text-ink-3">
              <tr className="border-b border-line">
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 text-right font-medium">Price</th>
                <th className="px-3 py-2.5 text-right font-medium">Target</th>
                <th className="px-3 py-2.5 font-medium">Verdict</th>
                <th className="px-3 py-2.5 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const bw = buyOrWait(i, { month, norms, ef, ctx });
                return (
                  <tr key={i.id} className={cn("border-t border-line align-top", i.status !== "open" && "text-ink-3")}>
                    <td className="px-3 py-2.5">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => useUI.getState().openLife("wishlist", i.id)}>
                        {i.title}
                      </button>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{i.data?.current_price != null ? m(i.data.current_price) : "–"}</td>
                    <td className="num px-3 py-2.5 text-right">{i.data?.target_price != null ? m(i.data.target_price) : "–"}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("font-semibold", VERDICT_CLS[bw.verdict])}>{VERDICT_WORD[bw.verdict]}</span>
                      <span className="block max-w-xs text-[12px] text-ink-3">{bw.reasons[bw.reasons.length - 1]}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {i.data?.url ? (
                        <a href={i.data.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium underline">
                          Open <ExternalLink className="h-3 w-3" aria-hidden />
                        </a>
                      ) : (
                        "–"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[12px] text-ink-3">A suggestion based on your plans, not advice.</p>
    </>
  );
}
