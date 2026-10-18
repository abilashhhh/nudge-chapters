"use client";

import { Archive, ArchiveRestore, ArrowLeft, Check, ExternalLink, Link2, Loader2, Pin, PinOff, Tag, Target, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { useFinance } from "@/lib/finance";
import { useStore } from "@/lib/store";
import type { LifeItem } from "@/lib/types";
import { ConfirmSheet } from "../ui/sheet";

type Draft = Pick<LifeItem, "title" | "body" | "tags" | "pinned" | "goal_id"> & { url: string };

const EMPTY: Draft = { title: "", body: "", tags: [], pinned: false, goal_id: null, url: "" };
const fromItem = (i: LifeItem): Draft => ({ title: i.title === "Untitled note" ? "" : i.title, body: i.body ?? "", tags: i.tags, pinned: i.pinned, goal_id: i.goal_id ?? null, url: i.data?.url ?? "" });

/**
 * A note, full width, like a page: a big title, the text below it, and everything else in one quiet row.
 * Saves by itself a moment after you stop typing (and when you leave), so there's no Save button to forget.
 */
export function NoteEditor({ id, onClose, onCreated }: { id: string | null; onClose: () => void; onCreated: (id: string) => void }) {
  const { ds } = useFinance();
  const add = useStore((s) => s.add);
  const patch = useStore((s) => s.patch);
  const remove = useStore((s) => s.remove);
  const existing = id ? ds.life_items.find((i) => i.id === id && i.kind === "note") : undefined;
  const [draft, setDraft] = useState<Draft>(() => (existing ? fromItem(existing) : EMPTY));
  const [state, setState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [tagText, setTagText] = useState("");
  const [showLink, setShowLink] = useState(!!draft.url);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const savedId = useRef<string | null>(existing?.id ?? null);
  const latest = useRef(draft);
  latest.current = draft;
  const timer = useRef<number | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const body = useRef<HTMLTextAreaElement>(null);

  const isEmpty = (d: Draft) => !d.title.trim() && !d.body?.trim();

  const save = useCallback(async () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    // One save at a time; a change made during a save is picked up by the next one.
    if (saving.current) await saving.current.catch(() => undefined);
    const d = latest.current;
    if (!savedId.current && isEmpty(d)) return setState("saved");
    if (d.url && !/^https?:\/\//i.test(d.url)) {
      setState("error");
      return;
    }
    const fields: Partial<LifeItem> = {
      title: d.title.trim() || "Untitled note",
      body: d.body || null,
      tags: d.tags,
      pinned: d.pinned,
      goal_id: d.goal_id,
    };
    setState("saving");
    const run = (async () => {
      if (savedId.current) {
        const cur = useStore.getState().ds?.life_items.find((i) => i.id === savedId.current);
        await patch("life_items", savedId.current, { ...fields, data: { ...cur?.data, url: d.url || null } });
      } else {
        const row = await add("life_items", { kind: "note", status: "open", repeat: "none", priority: 2, source: "user", data: { url: d.url || null }, ...fields });
        savedId.current = row.id;
        onCreated(row.id);
      }
    })();
    saving.current = run;
    try {
      await run;
      setState(latest.current === d ? "saved" : "dirty");
    } catch {
      setState("error");
    } finally {
      saving.current = null;
    }
  }, [add, patch, onCreated]);

  const change = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setState("dirty");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 700);
  };

  // Save on the way out (Back, switching tabs, closing the page).
  useEffect(() => {
    const flush = () => {
      if (timer.current) void save();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [save]);

  // Grow the text area with its text, so the page scrolls rather than a little box.
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 320)}px`;
  }, [draft.body]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const close = async () => {
    if (timer.current || state === "dirty") await save();
    onClose();
  };

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").replace(/,$/, "");
    if (t && !draft.tags.includes(t)) change({ tags: [...draft.tags, t] });
    setTagText("");
  };

  const toggleArchive = async () => {
    await save();
    if (!savedId.current) return;
    const cur = useStore.getState().ds?.life_items.find((i) => i.id === savedId.current);
    const archived = cur?.status === "archived";
    await patch("life_items", savedId.current, { status: archived ? "open" : "archived" });
    toast.success(archived ? "Back in your notes" : "Archived — find it under Show archived");
    if (!archived) onClose();
  };

  if (id && !existing && !savedId.current)
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
        <p className="font-semibold">This note doesn&apos;t exist any more.</p>
        <button type="button" onClick={onClose} className="mt-3 text-[14px] font-medium text-brand underline">Back to notes</button>
      </div>
    );

  const goals = ds.goals.filter((g) => !g.archived);
  const current = savedId.current ? ds.life_items.find((i) => i.id === savedId.current) : undefined;
  const words = (draft.body ?? "").trim() ? (draft.body ?? "").trim().split(/\s+/).length : 0;
  const status =
    state === "saving" ? (
      <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />Saving…</span>
    ) : state === "dirty" ? (
      "Editing…"
    ) : state === "error" ? (
      <span className="text-danger">{draft.url && !/^https?:\/\//i.test(draft.url) ? "Links must start with https://" : "Not saved — check your connection"}</span>
    ) : savedId.current ? (
      <span className="inline-flex items-center gap-1 text-ok"><Check className="h-3.5 w-3.5" aria-hidden />Saved</span>
    ) : (
      "New note"
    );

  const iconBtn = "inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-40";
  return (
    <article className="anim-fade flex min-h-[70vh] flex-col rounded-2xl border border-line bg-surface">
      {/* Top bar */}
      <div className="sticky top-14 z-10 flex items-center gap-1 rounded-t-2xl border-b border-line bg-surface/95 px-2 py-2 backdrop-blur-md sm:px-4">
        <button type="button" onClick={() => void close()} className="inline-flex h-10 items-center gap-2 rounded-xl px-2.5 text-[14px] font-medium text-ink-2 hover:bg-surface-3 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span>Notes</span>
        </button>
        <span className="ml-2 truncate text-[12.5px] text-ink-3" aria-live="polite">{status}</span>
        <span className="ml-auto flex items-center">
          <button type="button" className={cn(iconBtn, draft.pinned && "text-brand")} aria-pressed={draft.pinned} aria-label={draft.pinned ? "Unpin" : "Pin to the top"} title={draft.pinned ? "Unpin" : "Pin to the top"} onClick={() => change({ pinned: !draft.pinned })}>
            {draft.pinned ? <PinOff className="h-[18px] w-[18px]" /> : <Pin className="h-[18px] w-[18px]" />}
          </button>
          <button type="button" className={iconBtn} disabled={!savedId.current} aria-label={current?.status === "archived" ? "Unarchive" : "Archive"} title={current?.status === "archived" ? "Unarchive" : "Archive"} onClick={() => void toggleArchive()}>
            {current?.status === "archived" ? <ArchiveRestore className="h-[18px] w-[18px]" /> : <Archive className="h-[18px] w-[18px]" />}
          </button>
          <button type="button" className={cn(iconBtn, "hover:text-danger")} aria-label="Delete note" title="Delete" onClick={() => (savedId.current ? setConfirmDelete(true) : onClose())}>
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        </span>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-8 lg:px-12">
        {current?.status === "archived" && <p className="mb-3 rounded-xl bg-surface-3 px-3 py-2 text-[13px] text-ink-2">This note is archived. Unarchive it from the bar above to bring it back to your list.</p>}
        <input
          value={draft.title}
          onChange={(e) => change({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              body.current?.focus();
            }
          }}
          autoFocus={!existing}
          placeholder="Title"
          aria-label="Title"
          maxLength={200}
          className="no-focus-ring display w-full bg-transparent text-[26px] font-semibold leading-tight text-ink outline-none placeholder:text-ink-3/60 sm:text-[32px]"
        />

        {/* Chapter, tags and link: one quiet row */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <label className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2 pl-2.5 pr-1 text-ink-2 focus-within:border-future">
            <Target className="h-3.5 w-3.5" aria-hidden />
            <select value={draft.goal_id ?? ""} onChange={(e) => change({ goal_id: e.target.value || null })} aria-label="Chapter" className="h-full max-w-40 bg-transparent pr-1 outline-none">
              <option value="">No chapter</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </label>
          {draft.tags.map((t) => (
            <span key={t} className="inline-flex h-8 items-center gap-1 rounded-full bg-surface-3 pl-2.5 pr-1 text-ink-2">
              #{t}
              <button type="button" aria-label={`Remove tag ${t}`} onClick={() => change({ tags: draft.tags.filter((x) => x !== t) })} className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-surface hover:text-ink">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <label className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 text-ink-3 focus-within:border-future">
            <Tag className="h-3.5 w-3.5" aria-hidden />
            <input
              value={tagText}
              onChange={(e) => (e.target.value.endsWith(",") ? addTag(e.target.value) : setTagText(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagText);
                } else if (e.key === "Backspace" && !tagText && draft.tags.length) change({ tags: draft.tags.slice(0, -1) });
              }}
              onBlur={() => tagText && addTag(tagText)}
              placeholder="Add tag"
              aria-label="Add a tag"
              className="w-20 bg-transparent text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          {showLink ? (
            <label className="inline-flex h-8 min-w-0 flex-1 basis-56 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-ink-2 focus-within:border-future">
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <input value={draft.url} onChange={(e) => change({ url: e.target.value.trim() })} inputMode="url" placeholder="https://…" aria-label="Link" className="min-w-0 flex-1 bg-transparent text-ink outline-none" />
              {draft.url && /^https?:\/\//i.test(draft.url) && (
                <a href={draft.url} target="_blank" rel="noopener noreferrer" aria-label="Open link" className="text-ink-3 hover:text-ink">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </label>
          ) : (
            <button type="button" onClick={() => setShowLink(true)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 text-ink-3 hover:text-ink">
              <Link2 className="h-3.5 w-3.5" aria-hidden /> Add link
            </button>
          )}
        </div>

        <textarea
          ref={body}
          value={draft.body ?? ""}
          onChange={(e) => change({ body: e.target.value })}
          autoFocus={!!existing}
          placeholder="Start writing…"
          aria-label="Note"
          className="no-focus-ring mt-5 w-full flex-1 resize-none bg-transparent text-[16px] leading-[1.75] text-ink outline-none placeholder:text-ink-3/60"
        />

        <p className="mt-4 border-t border-line pt-3 text-[12px] text-ink-3">
          {words} word{words === 1 ? "" : "s"}
          {current?.created_at ? ` · Added ${formatDate(current.created_at.slice(0, 10))}` : ""}
          {current?.updated_at && current.updated_at !== current.created_at ? ` · Edited ${formatDate(current.updated_at.slice(0, 10))}` : ""}
          <span className="hidden sm:inline"> · Saves as you type · Ctrl/⌘ S saves now · Esc goes back</span>
        </p>
      </div>

      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete "${draft.title.trim() || "Untitled note"}"?`}
        body="This can't be undone. Archive it instead if you might want it later."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = null;
          if (savedId.current) await remove("life_items", savedId.current);
          toast.success("Note deleted");
          onClose();
        }}
      />
    </article>
  );
}
