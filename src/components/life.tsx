"use client";

import { Bell, CheckSquare, ExternalLink, Pin, Plus, Repeat as RepeatIcon, Square, StickyNote, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate, relativeDays } from "@/lib/dates";
import { buyOrWait, checklistProgress, completionPatch, type Nudge } from "@/lib/engine/life";
import { useFinance } from "@/lib/finance";
import { formatMoney } from "@/lib/money";
import { useStore } from "@/lib/store";
import type { ChecklistEntry, LifeItem, LifeKind, Repeat } from "@/lib/types";
import { useUI } from "@/lib/ui";
import { Button } from "./ui/button";
import { AmountInput, DateInput, Field, Input, Select, Switch, Textarea } from "./ui/form";
import { Badge, Progress } from "./ui/misc";
import { ConfirmSheet, Sheet } from "./ui/sheet";

export const KIND_LABEL: Record<LifeKind, string> = { task: "Task", checklist: "Checklist", note: "Note", reminder: "Reminder", wishlist: "Wishlist item" };
const REPEAT_LABEL: Record<Repeat, string> = { none: "Doesn't repeat", daily: "Every day", weekly: "Every week", monthly: "Every month", yearly: "Every year" };
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

// ---------------------------------------------------------------------------
// Shared actions

export function useLifeActions() {
  const { today } = useFinance();
  const patch = useStore((s) => s.patch);
  return {
    async complete(item: LifeItem) {
      const p = completionPatch(item, today);
      await patch("life_items", item.id, p);
      toast.success(item.repeat !== "none" && item.due_date ? `Done — next one ${formatDate(p.due_date!, "short")}` : "Done");
    },
    async reopen(item: LifeItem) {
      await patch("life_items", item.id, { status: "open", completed_at: null });
    },
    async toggleEntry(item: LifeItem, entryId: string) {
      const items = (item.data?.items ?? []).map((e) => (e.id === entryId ? { ...e, done: !e.done } : e));
      await patch("life_items", item.id, { data: { ...item.data, items } });
    },
  };
}

function dueLabel(item: LifeItem, today: string) {
  if (!item.due_date) return null;
  const overdue = item.status === "open" && item.due_date < today;
  return (
    <span className={cn("whitespace-nowrap", overdue ? "font-medium text-danger" : item.due_date === today ? "font-medium text-warn" : "text-ink-3")}>
      {item.due_date === today ? "Today" : relativeDays(today, item.due_date)}
      {item.due_time ? ` · ${item.due_time}` : ""}
    </span>
  );
}

function ChapterChip({ goalId }: { goalId?: string | null }) {
  const { ds } = useFinance();
  const g = goalId ? ds.goals.find((x) => x.id === goalId) : null;
  if (!g) return null;
  return <span className="truncate rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-medium text-brand-strong">{g.name}</span>;
}

// ---------------------------------------------------------------------------
// Rows and cards

/** A task or reminder: tick to complete (repeating ones roll to their next date). */
export function TaskRow({ item }: { item: LifeItem }) {
  const { today } = useFinance();
  const act = useLifeActions();
  const done = item.status === "done";
  const sub = checklistProgress(item);
  return (
    <div className="flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2 sm:px-3">
      <button
        type="button"
        onClick={() => (done ? act.reopen(item) : act.complete(item))}
        className={cn("mt-0.5 shrink-0", done ? "text-brand" : "text-ink-3 hover:text-ink")}
        aria-label={done ? `Mark "${item.title}" not done` : `Mark "${item.title}" done`}
      >
        {item.kind === "reminder" && !done ? <Bell className="h-5 w-5" /> : done ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
      </button>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useUI.getState().openLife(item.kind, item.id)}>
        <span className={cn("block truncate text-[14.5px]", done && "text-ink-3 line-through")}>{item.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
          {dueLabel(item, today)}
          {item.repeat !== "none" && (
            <span className="inline-flex items-center gap-1 text-ink-3">
              <RepeatIcon className="h-3 w-3" aria-hidden />
              {REPEAT_LABEL[item.repeat].replace("Every ", "")}
            </span>
          )}
          {sub.total > 0 && <span className="text-ink-3">{sub.done}/{sub.total} steps</span>}
          {item.priority === 1 && !done && <span className="font-medium text-danger">High</span>}
          <ChapterChip goalId={item.goal_id} />
        </span>
      </button>
    </div>
  );
}

export function ChecklistCard({ item }: { item: LifeItem }) {
  const act = useLifeActions();
  const p = checklistProgress(item);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={() => useUI.getState().openLife("checklist", item.id)}>
          <p className="truncate text-[15px] font-semibold hover:underline">{item.title}</p>
          <p className="text-[12.5px] text-ink-3">
            {p.done} of {p.total} done{item.repeat !== "none" ? ` · resets ${REPEAT_LABEL[item.repeat].toLowerCase()}` : ""}
          </p>
        </button>
        <ChapterChip goalId={item.goal_id} />
      </div>
      <Progress className="mt-2" value={p.total ? p.done / p.total : 0} label={`${item.title} progress`} />
      <ul className="mt-2">
        {(item.data?.items ?? []).map((e) => (
          <li key={e.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-[14px] hover:bg-surface-2">
              <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={e.done} onChange={() => act.toggleEntry(item, e.id)} />
              <span className={cn(e.done && "text-ink-3 line-through")}>{e.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {p.total > 0 && p.done === p.total && item.status === "open" && (
        <Button size="sm" className="mt-2" onClick={() => act.complete(item)}>
          {item.repeat !== "none" ? "Done — reset for next time" : "Mark checklist complete"}
        </Button>
      )}
    </div>
  );
}

export function NoteCard({ item }: { item: LifeItem }) {
  return (
    <button type="button" onClick={() => useUI.getState().openLife("note", item.id)} className="flex w-full flex-col rounded-2xl border border-line bg-surface p-4 text-left hover:border-line-strong">
      <span className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-semibold">{item.title}</span>
        {item.pinned && <Pin className="h-4 w-4 shrink-0 text-ink-3" aria-label="Pinned" />}
      </span>
      {item.body && <span className="mt-1 line-clamp-4 whitespace-pre-line text-[13.5px] text-ink-2">{item.body}</span>}
      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        <ChapterChip goalId={item.goal_id} />
        {item.tags.map((t) => (
          <span key={t} className="rounded-full bg-surface-3 px-2 py-0.5 text-[11.5px] text-ink-2">
            #{t}
          </span>
        ))}
      </span>
    </button>
  );
}

const VERDICT_TONE = { buy: "brand", wait: "warn", save_first: "future", consider: "warn", unknown: "neutral" } as const;

export function WishlistCard({ item }: { item: LifeItem }) {
  const { month, norms, ef, ctx } = useFinance();
  const bw = useMemo(() => buyOrWait(item, { month, norms, ef, ctx }), [item, month, norms, ef, ctx]);
  const m = (n: number) => formatMoney(n, ctx);
  const history = item.data?.price_history ?? [];
  const lows = history.length ? Math.min(...history.map((h) => h.price)) : null;
  const highs = history.length ? Math.max(...history.map((h) => h.price)) : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        {item.data?.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.data.image_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useUI.getState().openLife("wishlist", item.id)}>
          <p className="truncate text-[15px] font-semibold hover:underline">{item.title}</p>
          <p className="num text-[13px] text-ink-2">
            {item.data?.current_price != null ? m(item.data.current_price) : "No price yet"}
            {item.data?.target_price != null && <span className="text-ink-3"> · target {m(item.data.target_price)}</span>}
          </p>
        </button>
        <Badge tone={VERDICT_TONE[bw.verdict]}>{bw.label}</Badge>
      </div>
      {history.length > 1 && (
        <p className="num mt-2 text-[12px] text-ink-3">
          Prices you recorded: low {m(lows!)} · high {m(highs!)} · {history.length} entries
        </p>
      )}
      <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">
        {bw.reasons.map((r) => (
          <li key={r}>• {r}</li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChapterChip goalId={item.goal_id} />
        {item.data?.url && (
          <a href={item.data.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-ink underline">
            Open link <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
        <span className="ml-auto text-[11.5px] text-ink-3">Suggestion, not advice — based on your plans</span>
      </div>
    </div>
  );
}

export function NudgeCard({ n, onDismiss }: { n: Nudge; onDismiss?: () => void }) {
  const ui = useUI.getState();
  return (
    <div className="flex gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold leading-snug">{n.title}</p>
        <p className="mt-1 text-[13px] text-ink-2">{n.reason}</p>
        {n.action && <p className="mt-1 text-[13px] text-ink">{n.action}</p>}
        {n.impact && <p className={cn("mt-1 text-[12.5px]", n.estimate ? "text-future-ink" : "text-ink-2")}>{n.impact}</p>}
        <p className="mt-1.5 text-[11.5px] text-ink-3">
          {n.estimate ? "Estimate · " : ""}From: {n.source}
        </p>
        {n.cta && (
          <div className="mt-2">
            {n.cta.href ? (
              <Link href={n.cta.href} className="text-[13px] font-medium text-ink underline">
                {n.cta.label}
              </Link>
            ) : (
              <button type="button" className="text-[13px] font-medium text-ink underline" onClick={() => n.cta?.eventKey && ui.openEvent(n.cta.eventKey)}>
                {n.cta.label}
              </button>
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="h-8 w-8 shrink-0 rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink" aria-label={`Dismiss: ${n.title}`}>
          <X className="mx-auto h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor

export function LifeEditorSheet() {
  const life = useUI((s) => s.life);
  if (!life) return null;
  return <LifeEditor key={`${life.kind}:${life.id ?? "new"}`} kind={life.kind} id={life.id} preset={life.preset} />;
}

function LifeEditor({ kind, id, preset }: { kind: LifeKind; id?: string; preset?: Partial<LifeItem> }) {
  const { ds, today, ctx } = useFinance();
  const add = useStore((s) => s.add);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const close = () => useUI.getState().closeLife();
  const existing = id ? ds.life_items.find((i) => i.id === id) : undefined;
  const base: LifeItem = existing ?? {
    id: "",
    kind,
    title: "",
    status: "open",
    repeat: "none",
    priority: 2,
    tags: [],
    pinned: false,
    data: kind === "checklist" ? { items: [] } : {},
    source: "user",
    due_date: kind === "reminder" ? today : null,
    ...preset,
  };
  const [v, setV] = useState<LifeItem>(base);
  const [tagText, setTagText] = useState(base.tags.join(", "));
  const [newEntry, setNewEntry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (p: Partial<LifeItem>) => setV((x) => ({ ...x, ...p }));
  const setData = (p: Partial<LifeItem["data"]>) => setV((x) => ({ ...x, data: { ...x.data, ...p } }));
  const entries = v.data?.items ?? [];
  const setEntries = (items: ChecklistEntry[]) => setData({ items });
  const addEntry = () => {
    const t = newEntry.trim();
    if (!t) return;
    setEntries([...entries, { id: uid(), text: t, done: false }]);
    setNewEntry("");
  };

  const save = async () => {
    if (!v.title.trim()) return setError("Give it a title.");
    if (kind === "reminder" && !v.due_date) return setError("Choose when to be reminded.");
    if (v.data?.url && !/^https?:\/\//i.test(v.data.url)) return setError("Links must start with http:// or https://");
    setBusy(true);
    try {
      let data = { ...v.data };
      // Keep a dated record of prices you enter, for the buy/wait check.
      if (kind === "wishlist" && data.current_price != null && data.current_price !== existing?.data?.current_price) {
        const hist = (data.price_history ?? []).filter((h) => h.date !== today);
        data = { ...data, price_history: [...hist, { date: today, price: data.current_price }] };
      }
      const body: Partial<LifeItem> = {
        ...v,
        kind,
        title: v.title.trim(),
        tags: tagText.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
        data,
      };
      delete (body as { id?: string }).id;
      if (existing) await patch("life_items", existing.id, body);
      else await add("life_items", body);
      toast.success(existing ? "Saved" : `${KIND_LABEL[kind]} added`);
      close();
    } catch {
      /* the store already showed the error */
    } finally {
      setBusy(false);
    }
  };

  const goals = ds.goals.filter((g) => !g.archived);
  return (
    <>
      <Sheet
        open
        onClose={close}
        size="md"
        title={existing ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : `New ${KIND_LABEL[kind].toLowerCase()}`}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {existing && (
              <Button variant="ghost" className="mr-auto text-danger hover:text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            {existing && kind === "note" && (
              <Button variant="ghost" onClick={async () => { await patch("life_items", existing.id, { status: existing.status === "archived" ? "open" : "archived" }); close(); }}>
                {existing.status === "archived" ? "Unarchive" : "Archive"}
              </Button>
            )}
            <Button onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={save}>
              {existing ? "Save changes" : "Add"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Title" htmlFor="li-title" error={error}>
            <Input
              id="li-title"
              autoFocus
              value={v.title}
              onChange={(e) => {
                set({ title: e.target.value });
                setError(null);
              }}
              placeholder={{ task: "e.g. Book bus ticket", checklist: "e.g. Travel checklist", note: "e.g. Bike research", reminder: "e.g. Renew bike insurance", wishlist: "e.g. 1TB SSD" }[kind]}
            />
          </Field>

          {(kind === "note" || kind === "task") && (
            <Field label={kind === "note" ? "Note" : "Details"} htmlFor="li-body" optional={kind === "task"}>
              <Textarea id="li-body" rows={kind === "note" ? 6 : 3} value={v.body ?? ""} onChange={(e) => set({ body: e.target.value })} />
            </Field>
          )}

          {kind === "wishlist" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Current price" htmlFor="li-cur" optional help="Each change is saved with today's date.">
                <AmountInput id="li-cur" value={v.data?.current_price ?? null} onChange={(x) => setData({ current_price: x })} currency={ctx.currency} />
              </Field>
              <Field label="Target price" htmlFor="li-tgt" optional>
                <AmountInput id="li-tgt" value={v.data?.target_price ?? null} onChange={(x) => setData({ target_price: x })} currency={ctx.currency} />
              </Field>
              <Field label="Image link" htmlFor="li-img" optional>
                <Input id="li-img" inputMode="url" value={v.data?.image_url ?? ""} onChange={(e) => setData({ image_url: e.target.value || null })} placeholder="https://…" />
              </Field>
              <Field label="Target date" htmlFor="li-wdate" optional>
                <DateInput id="li-wdate" value={v.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value || null })} />
              </Field>
            </div>
          )}

          {(kind === "note" || kind === "wishlist") && (
            <Field label="Link" htmlFor="li-url" optional>
              <Input id="li-url" inputMode="url" value={v.data?.url ?? ""} onChange={(e) => setData({ url: e.target.value || null })} placeholder="https://…" />
            </Field>
          )}

          {(kind === "checklist" || kind === "task") && (
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-2">{kind === "task" ? "Steps (optional)" : "Items"}</p>
              <ul className="flex flex-col gap-1.5">
                {entries.map((e, i) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={e.done} onChange={() => setEntries(entries.map((x) => (x.id === e.id ? { ...x, done: !x.done } : x)))} aria-label={`Done: ${e.text}`} />
                    <Input value={e.text} onChange={(ev) => setEntries(entries.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)))} aria-label={`Item ${i + 1}`} className="h-9" />
                    <button type="button" className="h-9 w-9 shrink-0 rounded-lg text-ink-3 hover:bg-surface-3" onClick={() => setEntries(entries.filter((x) => x.id !== e.id))} aria-label={`Remove ${e.text}`}>
                      <X className="mx-auto h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <Input
                  value={newEntry}
                  onChange={(e) => setNewEntry(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addEntry();
                    }
                  }}
                  placeholder="Add an item and press Enter"
                  aria-label="New item"
                  className="h-9"
                />
                <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={addEntry}>
                  {kind === "task" ? "Add step" : "Add item"}
                </Button>
              </div>
            </div>
          )}

          {(kind === "task" || kind === "reminder" || kind === "checklist") && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label={kind === "reminder" ? "Remind me on" : "Due"} htmlFor="li-due" optional={kind !== "reminder"}>
                <DateInput id="li-due" value={v.due_date ?? ""} onChange={(e) => set({ due_date: e.target.value || null })} />
              </Field>
              {kind === "reminder" && (
                <Field label="At" htmlFor="li-time" optional>
                  <Input id="li-time" type="time" value={v.due_time ?? ""} onChange={(e) => set({ due_time: e.target.value || null })} />
                </Field>
              )}
              <Field label="Repeats" htmlFor="li-rep">
                <Select id="li-rep" value={v.repeat} onChange={(e) => set({ repeat: e.target.value as Repeat })}>
                  {Object.entries(REPEAT_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Chapter" htmlFor="li-goal" optional>
              <Select id="li-goal" value={v.goal_id ?? ""} onChange={(e) => set({ goal_id: e.target.value || null })}>
                <option value="">None</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
            {(kind === "task" || kind === "wishlist") && (
              <Field label="Priority" htmlFor="li-pri">
                <Select id="li-pri" value={v.priority} onChange={(e) => set({ priority: Number(e.target.value) as 1 | 2 | 3 })}>
                  <option value={1}>High</option>
                  <option value={2}>Medium</option>
                  <option value={3}>Low</option>
                </Select>
              </Field>
            )}
            <Field label="Tags" htmlFor="li-tags" optional help="Separate with commas">
              <Input id="li-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="bike, travel" />
            </Field>
          </div>
          {kind === "note" && <Switch checked={v.pinned} onChange={(x) => set({ pinned: x })} label="Pin to the top" />}
          {existing && (
            <p className="text-[12px] text-ink-3">
              Added {existing.created_at ? formatDate(existing.created_at.slice(0, 10)) : "—"} · source: {existing.source === "user" ? "you" : existing.source}
            </p>
          )}
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete "${existing?.title}"?`}
        body="This can't be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (!existing) return;
          await remove("life_items", existing.id);
          toast.success("Deleted");
          close();
        }}
      />
    </>
  );
}

export const KIND_ICON = { task: CheckSquare, checklist: CheckSquare, note: StickyNote, reminder: Bell, wishlist: Pin } as const;
