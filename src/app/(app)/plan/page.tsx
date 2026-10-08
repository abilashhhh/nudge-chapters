"use client";

import { Plus, Search } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { ChecklistCard, KIND_LABEL, NoteCard, TaskRow, WishlistCard } from "@/components/life";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, Tabs } from "@/components/ui/misc";
import { agenda } from "@/lib/engine/life";
import { useFinance } from "@/lib/finance";
import type { LifeItem, LifeKind } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { useTab } from "@/lib/use-tab";

const TABS = ["tasks", "checklists", "notes", "reminders", "wishlist"] as const;
type Tab = (typeof TABS)[number];
const KIND: Record<Tab, LifeKind> = { tasks: "task", checklists: "checklist", notes: "note", reminders: "reminder", wishlist: "wishlist" };
const EMPTY: Record<Tab, string> = {
  tasks: "Add the things you need to get done. Repeating tasks come back on their next date when you tick them off.",
  checklists: "Lists you reuse or tick through: a travel checklist, a monthly bike check, a moving-house list.",
  notes: "Ideas, research and links — attach them to a chapter so they're there when you need them.",
  reminders: "One-time or repeating: insurance renewals, document expiry, a monthly spending review.",
  wishlist: "Things you'd like to buy. Record the price now and then — Nudge Chapters tells you whether to buy, wait or save first.",
};

export default function PlanPage() {
  return (
    <Suspense>
      <Plan />
    </Suspense>
  );
}

function Plan() {
  const [tab, setTab] = useTab(TABS, "tasks");
  const { ds, today } = useFinance();
  const [q, setQ] = useState("");
  const [chapter, setChapter] = useState("");
  const [showDone, setShowDone] = useState(false);
  const kind = KIND[tab];

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    return ds.life_items.filter((i) => {
      if (i.kind !== kind) return false;
      if (chapter && i.goal_id !== chapter) return false;
      if (!showDone && i.status !== "open") return false;
      if (query) {
        const hay = `${i.title} ${i.body ?? ""} ${i.tags.join(" ")} ${(i.data?.items ?? []).map((e) => e.text).join(" ")}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [ds.life_items, kind, q, chapter, showDone]);

  const counts = useMemo(() => {
    const c = {} as Record<Tab, number>;
    for (const t of TABS) c[t] = ds.life_items.filter((i) => i.kind === KIND[t] && i.status === "open").length;
    return c;
  }, [ds.life_items]);

  return (
    <>
      <PageHeader
        title="Plan"
        description="Tasks, checklists, notes, reminders and your wishlist — linked to the chapters they belong to."
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openLife(kind, undefined, chapter ? { goal_id: chapter } : undefined)}>
            New {KIND_LABEL[kind].toLowerCase()}
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "tasks", label: "Tasks", count: counts.tasks },
          { id: "checklists", label: "Checklists", count: counts.checklists },
          { id: "notes", label: "Notes", count: counts.notes },
          { id: "reminders", label: "Reminders", count: counts.reminders },
          { id: "wishlist", label: "Wishlist", count: counts.wishlist },
        ]}
      />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input aria-label={`Search ${tab}`} placeholder="Search titles, notes and tags" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Chapter" value={chapter} onChange={(e) => setChapter(e.target.value)}>
          <option value="">All chapters</option>
          {ds.goals
            .filter((g) => !g.archived)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </Select>
        <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          {tab === "notes" ? "Show archived" : "Show done"}
        </label>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={q || chapter ? "Nothing matches" : `No ${tab} yet`}
          body={q || chapter ? "Try a different search or chapter." : EMPTY[tab]}
          action={
            !q && !chapter ? (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => useUI.getState().openLife(kind)}>
                New {KIND_LABEL[kind].toLowerCase()}
              </Button>
            ) : undefined
          }
        />
      ) : tab === "tasks" || tab === "reminders" ? (
        <DatedList items={items} today={today} />
      ) : tab === "checklists" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((i) => (
            <ChecklistCard key={i.id} item={i} />
          ))}
        </div>
      ) : tab === "notes" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...items].sort((a, b) => Number(b.pinned) - Number(a.pinned)).map((i) => (
            <NoteCard key={i.id} item={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((i) => (
            <WishlistCard key={i.id} item={i} />
          ))}
        </div>
      )}
    </>
  );
}

function DatedList({ items, today }: { items: LifeItem[]; today: string }) {
  const ag = agenda(items, today);
  const later = items.filter((i) => i.status === "open" && (!i.due_date || i.due_date > ag.upcoming.at(-1)?.due_date! || !ag.upcoming.length) && !ag.overdue.includes(i) && !ag.today.includes(i) && !ag.upcoming.includes(i));
  const done = items.filter((i) => i.status !== "open");
  const groups: [string, LifeItem[]][] = [
    ["Overdue", ag.overdue],
    ["Today", ag.today],
    ["Next 7 days", ag.upcoming],
    ["Later / no date", later],
    ["Done", done],
  ];
  return (
    <div className="flex flex-col gap-4">
      {groups
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <section key={label} className="rounded-2xl border border-line bg-surface p-2 sm:p-3" aria-label={label}>
            <h2 className={`px-2 pb-1 pt-1 text-[12.5px] font-semibold ${label === "Overdue" ? "text-danger" : "text-ink-3"}`}>
              {label} · {list.length}
            </h2>
            {list.map((i) => (
              <TaskRow key={i.id} item={i} />
            ))}
          </section>
        ))}
    </div>
  );
}
