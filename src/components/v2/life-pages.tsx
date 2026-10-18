"use client";

import { Bell, Check, ExternalLink, History, ListChecks, PenLine, Pencil, Pin, Plus, Search, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addDays, formatDate } from "@/lib/dates";
import { buyOrWait } from "@/lib/engine/life";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import type { LifeItem, LifeKind } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { ChecklistCard, EditButton, TaskRow, useLifeActions } from "../life";
import { NoteEditor } from "./note-editor";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { EmptyState } from "../ui/misc";
import { StatusText, V2PageHeader } from "./ui";
import { Cell2, DataTable, Details } from "./data-table";

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

/** One row: add, (an extra add), search, and a show-done switch. Labels shorten on phones. */
function Toolbar({
  q, setQ, showDone, setShowDone, doneLabel, kind, addLabel, extra, onAdd,
}: { q: string; setQ: (s: string) => void; showDone: boolean; setShowDone: (b: boolean) => void; doneLabel: string; kind: LifeKind; addLabel: string; extra?: ReactNode; onAdd?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Button variant="primary" aria-label={addLabel} icon={<Plus className="h-4 w-4" />} onClick={onAdd ?? (() => useUI.getState().openLife(kind))} className="shrink-0 px-3 sm:px-4">
        <span className="hidden sm:inline">{addLabel}</span>
        <span className="sm:hidden">New</span>
      </Button>
      {extra}
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input aria-label="Search" placeholder="Search" className="h-10 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <button
        type="button"
        aria-pressed={showDone}
        aria-label={doneLabel}
        title={doneLabel}
        onClick={() => setShowDone(!showDone)}
        className={cn(
          "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13.5px] font-medium transition-colors",
          showDone ? "border-inverse bg-inverse text-on-inverse" : "border-line bg-surface text-ink-2 hover:border-line-strong",
        )}
      >
        <History className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">{doneLabel}</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function NotesScreen({ embedded }: { embedded?: boolean } = {}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? "/daily";
  const open = params.get("note");
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const items = useItems(["note"], showDone, q);
  const go = useCallback(
    (note: string | null, replace = false) => {
      const p = new URLSearchParams(params.toString());
      if (note) p.set("note", note);
      else p.delete("note");
      const url = `${pathname}?${p.toString()}`;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [params, pathname, router],
  );
  const onCreated = useCallback((id: string) => go(id, true), [go]);

  if (open) return <NoteEditor key={open === "new" ? "new" : open} id={open === "new" ? null : open} onClose={() => go(null)} onCreated={onCreated} />;

  const sorted = [...items].sort((a, b) => (b.updated_at ?? b.created_at ?? "").localeCompare(a.updated_at ?? a.created_at ?? ""));
  const pinned = sorted.filter((i) => i.pinned && i.status === "open");
  const rest = sorted.filter((i) => !(i.pinned && i.status === "open"));
  return (
    <>
      {!embedded && <V2PageHeader title="Notes" />}
      <Toolbar q={q} setQ={setQ} showDone={showDone} setShowDone={setShowDone} doneLabel="Show archived" kind="note" addLabel="New note" onAdd={() => go("new")} />
      {items.length === 0 ? (
        <EmptyState icon={StickyNote} title={q ? "Nothing matches" : "No notes yet"} body="Ideas, research, account details you need to remember — anything." />
      ) : (
        <div className="flex flex-col gap-5">
          {pinned.length > 0 && (
            <section aria-label="Pinned notes">
              <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3"><Pin className="h-3.5 w-3.5" aria-hidden />Pinned</h2>
              <NoteGrid items={pinned} onOpen={go} />
            </section>
          )}
          {rest.length > 0 && (
            <section aria-label="Notes">
              {pinned.length > 0 && <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">Others</h2>}
              <NoteGrid items={rest} onOpen={go} />
            </section>
          )}
        </div>
      )}
    </>
  );
}

/** Notes as cards in columns (tall notes don't leave gaps). */
function NoteGrid({ items, onOpen }: { items: LifeItem[]; onOpen: (id: string) => void }) {
  const { ds } = useFinance();
  return (
    <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4">
      {items.map((i) => {
        const goal = i.goal_id ? ds.goals.find((g) => g.id === i.goal_id) : null;
        const edited = (i.updated_at ?? i.created_at ?? "").slice(0, 10);
        return (
          <button
            key={i.id}
            type="button"
            onClick={() => onOpen(i.id)}
            className={cn("lift group mb-3 flex w-full break-inside-avoid flex-col rounded-2xl border bg-surface p-4 text-left transition-colors hover:border-line-strong hover:shadow-panel", i.status === "archived" ? "border-dashed border-line opacity-70" : "border-line")}
          >
            <span className="flex items-start justify-between gap-2">
              <span className="text-[15.5px] font-semibold leading-snug">{i.title}</span>
              <PenLine className="h-4 w-4 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
            </span>
            {i.body && <span className="mt-1.5 line-clamp-[8] whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{i.body}</span>}
            <span className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px]">
              {goal && <span className="rounded-full bg-brand-soft px-2 py-0.5 font-medium text-brand-strong">{goal.name}</span>}
              {i.tags.map((t) => (
                <span key={t} className="rounded-full bg-surface-3 px-2 py-0.5 text-ink-2">#{t}</span>
              ))}
              {i.data?.url && <ExternalLink className="h-3 w-3 text-ink-3" aria-label="Has a link" />}
              {i.status === "archived" && <span className="text-ink-3">Archived</span>}
              {edited && <span className="ml-auto text-ink-3">{formatDate(edited, "short")}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function RemindersScreen({ embedded }: { embedded?: boolean } = {}) {
  const { today } = useFinance();
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const items = useItems(["reminder"], showDone, q);
  const act = useLifeActions();
  const sorted = [...items].sort((a, b) => (a.status !== b.status ? (a.status === "open" ? -1 : 1) : (a.due_date ?? "9999") < (b.due_date ?? "9999") ? -1 : 1));
  return (
    <>
      {!embedded && <V2PageHeader title="Reminders" />}
      <Toolbar q={q} setQ={setQ} showDone={showDone} setShowDone={setShowDone} doneLabel="Show done" kind="reminder" addLabel="New reminder" />
      {sorted.length === 0 ? (
        <EmptyState icon={Bell} title={q ? "Nothing matches" : "No reminders yet"} body="Insurance renewal, a document that expires, a monthly money check — set it once and get an alarm." />
      ) : (
        <DataTable
          label="Reminders"
          rows={sorted}
          rowKey={(i) => i.id}
          rowClassName={(i) => (i.status !== "open" ? "text-ink-3" : undefined)}
          rowAction={(i) => <EditButton item={i} />}
          columns={[
            {
              key: "w",
              header: "What",
              cell: (i) => (
                <Cell2
                  main={<span className={cn(i.status !== "open" && "line-through")}>{i.title}</span>}
                  sub={`${i.due_date ? formatDate(i.due_date, "short") : "No date"}${i.due_time ? ` · ${i.due_time}` : ""}`}
                />
              ),
            },
            {
              key: "s",
              header: "Status",
              cell: (i) => {
                const done = i.status !== "open";
                const st = !i.due_date ? "upcoming" : i.due_date < today ? "late" : i.due_date <= addDays(today, 7) ? "due" : "upcoming";
                return done ? (
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ok">
                    <Check className="h-3.5 w-3.5" aria-hidden /> Done
                  </span>
                ) : (
                  <StatusText status={st} />
                );
              },
            },
          ]}
          details={(i) => (
            <Details
              items={[
                ["Repeats", REPEAT[i.repeat]],
                ...(i.body ? ([["Note", i.body]] as [string, string][]) : []),
              ]}
              actions={
                <>
                  <Button size="sm" variant="primary" onClick={() => (i.status !== "open" ? act.reopen(i) : act.complete(i))}>
                    {i.status !== "open" ? "Not done" : "Done"}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => useUI.getState().openLife("reminder", i.id)}>
                    Edit
                  </Button>
                </>
              }
            />
          )}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

export function TodoScreen({ embedded }: { embedded?: boolean } = {}) {
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
      {!embedded && <V2PageHeader title="To-do & checklists" />}
      <Toolbar
        q={q}
        setQ={setQ}
        showDone={showDone}
        setShowDone={setShowDone}
        doneLabel="Show done"
        kind="task"
        addLabel="New to-do"
        extra={
          <Button aria-label="New checklist" icon={<ListChecks className="h-4 w-4" />} onClick={() => useUI.getState().openLife("checklist")} className="shrink-0 px-3 sm:px-4">
            <span className="hidden sm:inline">Checklist</span>
          </Button>
        }
      />
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

export function WishlistScreen({ embedded }: { embedded?: boolean } = {}) {
  const { month, norms, ef, ctx } = useFinance();
  const [q, setQ] = useState("");
  const [showDone, setShowDone] = useState(false);
  const items = useItems(["wishlist"], showDone, q);
  const m = (n: number) => formatMoney(n, ctx);
  const patch = useStore((s) => s.patch);
  const markBought = async (i: LifeItem) => {
    const bought = i.status === "open";
    await patch("life_items", i.id, bought ? { status: "done", completed_at: new Date().toISOString() } : { status: "open", completed_at: null });
    toast.success(bought ? `Marked “${i.title}” as bought — see it under Show bought` : `“${i.title}” is back on your wishlist`);
  };
  return (
    <>
      {!embedded && <V2PageHeader title="Wishlist" />}
      <Toolbar q={q} setQ={setQ} showDone={showDone} setShowDone={setShowDone} doneLabel="Show bought" kind="wishlist" addLabel="Add an item" />
      {items.length === 0 ? (
        <EmptyState title={q ? "Nothing matches" : "Your wishlist is empty"} body="Add the price now and then — you'll see whether to buy, wait for a better price or save first." />
      ) : (
        <DataTable
          label="Wishlist"
          rows={items}
          rowKey={(i) => i.id}
          rowClassName={(i) => (i.status !== "open" ? "text-ink-3" : undefined)}
          rowAction={(i) => <EditButton item={i} />}
          columns={[
            {
              key: "i",
              header: "Item",
              cell: (i) => {
                const bw = buyOrWait(i, { month, norms, ef, ctx });
                return <Cell2 main={i.title} sub={<span className={cn("font-semibold", VERDICT_CLS[bw.verdict])}>{VERDICT_WORD[bw.verdict]}</span>} />;
              },
            },
            { key: "p", header: "Price", align: "right", cell: (i) => (i.data?.current_price != null ? m(i.data.current_price) : "–") },
          ]}
          details={(i) => {
            const bw = buyOrWait(i, { month, norms, ef, ctx });
            return (
              <Details
                items={[
                  ["Target price", i.data?.target_price != null ? m(i.data.target_price) : "–"],
                  ["Suggestion", VERDICT_WORD[bw.verdict]],
                ]}
                actions={
                  <>
                    {i.data?.url && (
                      <a href={i.data.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 rounded-xl border border-line px-3 text-[13px] font-medium">
                        Open link <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    )}
                    <Button size="sm" variant="primary" icon={<Check className="h-3.5 w-3.5" />} onClick={() => void markBought(i)}>
                      {i.status === "open" ? "Bought it" : "Back on the wishlist"}
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => useUI.getState().openLife("wishlist", i.id)}>
                      Edit
                    </Button>
                  </>
                }
              >
                <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">
                  {bw.reasons.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </Details>
            );
          }}
        />
      )}
      <p className="mt-2 hidden text-[12px] text-ink-3 lg:block">A suggestion based on your plans, not advice.</p>
    </>
  );
}
