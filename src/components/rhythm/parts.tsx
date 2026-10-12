"use client";

import { Archive, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDashed, Clock, MessageSquare, Minus, RotateCcw, SkipForward, Trash2, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addMonths, formatDate, formatMonthLong, monthKey } from "@/lib/dates";
import {
  HABIT_CATEGORIES, WEEKDAY_SHORT, daySummary, formatTime, habitStreaks, monthCells, monthReport, scheduleLabel,
  type DayLook, type DaySummary, type OccStatus, type Occurrence,
} from "@/lib/rhythm";
import type { Habit, HabitFrequency } from "@/lib/types";
import { Button } from "../ui/button";
import { DateInput, Field, Input, NumberInput, Switch, Textarea } from "../ui/form";
import { Badge, Progress, Segmented } from "../ui/misc";
import { ConfirmSheet, Sheet } from "../ui/sheet";
import { useRhythm, useRhythmActions } from "./actions";
import { HabitWeeksChart } from "./charts";

const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Sunday, 11 October 2026" */
export function longDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
  return `${WEEKDAY_LONG[wd]}, ${day} ${MONTH_LONG[m - 1]} ${y}`;
}

export const pctText = (r: number | null | undefined) => (r == null ? "—" : `${Math.round(r * 100)}%`);

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

export function HabitIcon({ h, className }: { h: Pick<Habit, "icon" | "name" | "color">; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-[17px] leading-none", className)}
      style={h.color ? { background: `color-mix(in oklab, ${h.color} 18%, var(--surface))` } : undefined}
      aria-hidden
    >
      {h.icon || <span className="text-[14px] font-semibold text-ink-2">{h.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

const STATUS_UI: Record<OccStatus, { word: string; icon: LucideIcon; cls: string }> = {
  completed: { word: "Done", icon: Check, cls: "text-ok" },
  missed: { word: "Missed", icon: X, cls: "text-danger" },
  pending: { word: "To do", icon: CircleDashed, cls: "text-ink-2" },
  skipped: { word: "Skipped", icon: SkipForward, cls: "text-ink-3" },
  future: { word: "Upcoming", icon: Clock, cls: "text-ink-3" },
};

/** Status as icon + word — never colour alone. */
export function StatusWord({ status, className }: { status: OccStatus; className?: string }) {
  const s = STATUS_UI[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-medium", s.cls, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {s.word}
    </span>
  );
}

/** A summary card: label, big value, small note. */
export function RhStat({ label, value, note, onClick, accent, className }: { label: ReactNode; value: ReactNode; note?: ReactNode; onClick?: () => void; accent?: boolean; className?: string }) {
  const body = (
    <>
      <span className={cn("block text-[12.5px]", accent ? "opacity-75" : "text-ink-3")}>{label}</span>
      <span className="display num mt-0.5 block truncate text-[20px] font-semibold leading-tight sm:text-[22px]">{value}</span>
      {note && <span className={cn("mt-0.5 block truncate text-[11.5px]", accent ? "opacity-70" : "text-ink-3")}>{note}</span>}
    </>
  );
  const cls = cn("block min-w-0 rounded-2xl border p-3.5 text-left sm:p-4", className, accent ? "border-transparent bg-inverse text-on-inverse" : "border-line bg-surface", onClick && "transition-colors hover:border-line-strong");
  return onClick ? (
    <button type="button" className={cn(cls, "w-full")} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function MonthNav({ month, setMonth, today, className }: { month: string; setMonth: (m: string) => void; today: string; className?: string }) {
  const cur = monthKey(today);
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => setMonth(monthKey(addMonths(`${month}-01`, -1, 1)))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="display min-w-[9.5rem] text-center text-[17px] font-semibold">{formatMonthLong(month)}</span>
      <Button size="sm" variant="ghost" aria-label="Next month" onClick={() => setMonth(monthKey(addMonths(`${month}-01`, 1, 1)))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
      {month !== cur && (
        <Button size="sm" onClick={() => setMonth(cur)}>
          Today
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const LOOK_CLS: Record<DayLook, string> = {
  all: "bg-rh-done text-white",
  some: "bg-warn-soft text-warn",
  zero: "bg-danger-soft text-danger",
  open: "bg-surface text-ink border border-dashed border-line-strong",
  skipped: "bg-surface-3 text-ink-3",
  none: "bg-transparent text-ink-3",
  future: "bg-surface-2 text-ink-2",
};

const LOOK_WORD: Record<DayLook, string> = {
  all: "everything done",
  some: "part done",
  zero: "nothing done",
  open: "nothing ticked yet",
  skipped: "all skipped",
  none: "nothing scheduled",
  future: "upcoming",
};

export function CalendarLegend({ className }: { className?: string }) {
  const items: [DayLook, string, ReactNode][] = [
    ["all", "All done", <Check key="a" className="h-3 w-3" />],
    ["some", "Some done", <span key="s" className="block h-0.5 w-2 rounded bg-current" />],
    ["zero", "None done", <X key="z" className="h-3 w-3" />],
    ["future", "Upcoming", null],
    ["none", "Nothing scheduled", null],
  ];
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-ink-2", className)}>
      {items.map(([look, label, icon]) => (
        <span key={look} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-flex h-4 w-4 items-center justify-center rounded-[5px]", LOOK_CLS[look], look === "none" && "border border-line")}>{icon}</span>
          {label}
        </span>
      ))}
    </div>
  );
}

/** Month grid. Each day shows how it went: colour, a fill bar and (on wider screens) "done/total". */
export function MonthCalendar({
  month,
  selected,
  onSelect,
  compact,
}: {
  month: string;
  selected?: string | null;
  onSelect: (date: string) => void;
  compact?: boolean;
}) {
  const { habits, index, today, weekStart } = useRhythm();
  const cells = useMemo(() => monthCells(month, weekStart).map((c) => ({ ...c, s: daySummary(habits, index, c.date, today) })), [month, weekStart, habits, index, today]);
  const heads = Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT[(i + weekStart) % 7]);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={formatMonthLong(month)}>
        {heads.map((h) => (
          <div key={h} className="pb-1 text-center text-[11.5px] font-medium text-ink-3" role="columnheader">
            {compact ? h.slice(0, 1) : h}
          </div>
        ))}
        {cells.map(({ date, inMonth, s }) => {
          const isToday = date === today;
          const isSel = selected === date;
          const t = s.tally;
          const frac = t.eligible ? t.completed / t.eligible : 0;
          const label = `${formatDate(date, "long")}: ${s.occ.length ? `${t.completed} of ${t.eligible} done${t.skipped ? `, ${t.skipped} skipped` : ""}` : "nothing scheduled"} — ${LOOK_WORD[s.look]}${isToday ? " (today)" : ""}`;
          return (
            <button
              key={date}
              type="button"
              role="gridcell"
              aria-label={label}
              aria-selected={isSel}
              title={label}
              onClick={() => onSelect(date)}
              className={cn(
                "relative flex flex-col items-center justify-start rounded-xl p-1 text-center transition-[box-shadow,opacity] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-future",
                compact ? "h-10" : "h-14 sm:h-[4.5rem]",
                LOOK_CLS[s.look],
                !inMonth && "opacity-35",
                isSel && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
              )}
            >
              <span className={cn("num text-[13px] leading-5", isToday ? "font-bold underline decoration-2 underline-offset-2" : "font-medium")}>{Number(date.slice(8))}</span>
              {s.look !== "none" && s.look !== "future" && t.eligible > 0 && (
                <>
                  {!compact && <span className="num hidden text-[11px] leading-4 opacity-90 sm:block">{`${t.completed}/${t.eligible}`}</span>}
                  {s.look === "all" ? (
                    <Check className={cn("absolute bottom-1.5 h-3 w-3", !compact && "sm:hidden")} aria-hidden />
                  ) : s.look === "zero" ? (
                    <X className={cn("absolute bottom-1.5 h-3 w-3", !compact && "sm:hidden")} aria-hidden />
                  ) : (
                    <span className="absolute inset-x-1.5 bottom-1.5 h-[3px] overflow-hidden rounded-full bg-current/20" aria-hidden>
                      <span className="block h-full rounded-full bg-current" style={{ width: `${Math.max(frac * 100, 6)}%` }} />
                    </span>
                  )}
                </>
              )}
              {s.look === "future" && !compact && <span className="num hidden text-[11px] leading-4 text-ink-3 sm:block">{s.occ.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One day's checklist
// ---------------------------------------------------------------------------

export function DayChecklist({ date, onOpenHabit, emptyAction }: { date: string; onOpenHabit?: (h: Habit) => void; emptyAction?: ReactNode }) {
  const { habits, index, today } = useRhythm();
  const s: DaySummary = useMemo(() => daySummary(habits, index, date, today), [habits, index, date, today]);
  const t = s.tally;
  const future = date > today;
  return (
    <div>
      <div className="mb-3">
        <p className="text-[15px] font-semibold text-ink">{longDate(date)}</p>
        {s.occ.length > 0 && (
          <>
            <p className="mt-0.5 text-[13.5px] text-ink-2">
              {future ? (
                <>
                  {s.occ.length} {s.occ.length === 1 ? "activity" : "activities"} planned
                </>
              ) : t.eligible ? (
                <>
                  <span className="num font-semibold text-ink">
                    {t.completed}/{t.eligible}
                  </span>{" "}
                  completed — <span className="num font-semibold text-ink">{pctText(t.rate)}</span>
                </>
              ) : (
                "Everything skipped"
              )}
              {t.skipped > 0 && t.eligible > 0 && <span className="text-ink-3"> · {t.skipped} skipped (not counted)</span>}
            </p>
            {!future && t.eligible > 0 && <Progress className="mt-2" value={t.rate ?? 0} label="Completed" />}
          </>
        )}
      </div>
      {s.occ.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-ink-2">
          {date < (habits.map((h) => h.start_date).sort()[0] ?? today) ? "You weren't tracking anything yet on this day." : "Nothing scheduled on this day."}
          {emptyAction && <div className="mt-3">{emptyAction}</div>}
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {s.occ.map((o) => (
            <ChecklistRow key={o.habit.id} o={o} future={future} onOpenHabit={onOpenHabit} />
          ))}
        </ul>
      )}
      {future && s.occ.length > 0 && <p className="mt-2 text-[12.5px] text-ink-3">You can skip a day ahead of time (a trip, a rest day). Ticking off happens on the day.</p>}
    </div>
  );
}

function ChecklistRow({ o, future, onOpenHabit }: { o: Occurrence; future: boolean; onOpenHabit?: (h: Habit) => void }) {
  const act = useRhythmActions();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(o.log?.notes ?? "");
  useEffect(() => setNote(o.log?.notes ?? ""), [o.log?.notes]);
  const { ds } = useRhythm();
  const done = o.status === "completed";
  const h = o.habit;
  const tz = ds.profile.timezone;
  // When it was ticked, shown only if it was ticked on that same day (not a later catch-up).
  const doneAt = (() => {
    if (!done || !o.log?.completed_at) return "";
    const at = new Date(o.log.completed_at);
    if (Number.isNaN(at.getTime()) || at.toLocaleDateString("en-CA", { timeZone: tz }) !== o.date) return "";
    return at.toLocaleTimeString(ds.profile.locale || "en-IN", { hour: "numeric", minute: "2-digit", timeZone: tz }).replace(/\s?(am|pm)$/i, (x) => ` ${x.trim().toUpperCase()}`);
  })();
  const choose = (st: "completed" | "missed" | "skipped" | null) => void act.setStatus(h, o.date, st).catch(() => undefined);
  return (
    <li className={cn("px-3 py-2.5", done && "bg-ok-soft/40")}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`${h.name}: ${done ? "done — tap to undo" : "mark done"}`}
          disabled={future}
          onClick={() => void act.toggle(h, o.date, done).catch(() => undefined)}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            done ? "border-rh-done bg-rh-done text-white" : o.status === "missed" ? "border-danger/60 text-danger" : o.status === "skipped" ? "border-line-strong text-ink-3" : "border-line-strong hover:border-ink-3",
          )}
        >
          {done ? <Check className="h-4 w-4" strokeWidth={3} /> : o.status === "missed" ? <X className="h-3.5 w-3.5" /> : o.status === "skipped" ? <Minus className="h-3.5 w-3.5" /> : null}
        </button>
        <span className="hidden xs:block">
          <HabitIcon h={h} />
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => (onOpenHabit ? onOpenHabit(h) : setOpen((v) => !v))}>
          <span className={cn("block truncate text-[14.5px] font-medium", done ? "text-ink-2" : "text-ink")}>
            <span className="xs:hidden">{h.icon ? `${h.icon} ` : ""}</span>
            {h.name}
          </span>
          <span className="block truncate text-[12px] text-ink-3">
            {h.time && <span className="font-semibold text-ink-2">{formatTime(h.time)} · </span>}
            {h.category}
            {h.target_value ? ` · ${h.target_value} ${h.target_unit ?? ""}` : ""}
            {doneAt ? ` · done at ${doneAt}` : ""}
            {o.log?.notes ? " · has a note" : ""}
          </span>
        </button>
        <span className="hidden sm:block">
          <StatusWord status={o.status} />
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`More for ${h.name}`}
          onClick={() => setOpen((v) => !v)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3 hover:bg-surface-3/70 hover:text-ink"
        >
          {o.log?.notes && !open ? <MessageSquare className="h-4 w-4" /> : <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />}
        </button>
      </div>
      {open && (
        <div className="mt-2.5 space-y-2.5 pl-10">
          <span className="sm:hidden">
            <StatusWord status={o.status} />
          </span>
          <div className="flex flex-wrap gap-1.5">
            {!future && (
              <>
                <Button size="sm" variant={o.status === "completed" ? "primary" : "secondary"} icon={<Check className="h-3.5 w-3.5" />} onClick={() => choose("completed")}>
                  Done
                </Button>
                <Button size="sm" variant="secondary" className={cn(o.status === "missed" && "border-danger text-danger")} icon={<X className="h-3.5 w-3.5" />} onClick={() => choose("missed")}>
                  Missed
                </Button>
              </>
            )}
            <Button size="sm" variant="secondary" className={cn(o.status === "skipped" && "border-ink-3")} icon={<SkipForward className="h-3.5 w-3.5" />} onClick={() => choose("skipped")}>
              Skip
            </Button>
            {o.log && o.log.status !== "pending" && (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => choose(null)}>
                Clear
              </Button>
            )}
          </div>
          <p className="text-[12px] text-ink-3">Skipped days don&apos;t count against you. Anything not ticked by the end of its day counts as missed — you can still tick it later.</p>
          <div className="flex gap-2">
            <Input aria-label={`Note for ${h.name}`} placeholder="Add a note (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="h-9 text-[14px]" />
            <Button size="sm" className="h-9" disabled={(note.trim() || "") === (o.log?.notes ?? "")} onClick={() => void act.setNote(h, o.date, note).catch(() => undefined)}>
              Save
            </Button>
          </div>
          {onOpenHabit && (
            <button type="button" className="text-[12.5px] font-medium text-brand hover:underline" onClick={() => onOpenHabit(h)}>
              See {h.name}&apos;s history
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Activity editor
// ---------------------------------------------------------------------------

const EMOJIS = ["🏋️", "🏃", "📖", "🧠", "💧", "🧘", "🛠️", "✍️", "🎸", "🥗", "😴", "🚶", "💊", "🧹", "📵", "🙏"];

export function HabitEditorSheet({ open, onClose, habit }: { open: boolean; onClose: () => void; habit?: Habit | null }) {
  const { habits, logs, today, weekStart } = useRhythm();
  const act = useRhythmActions();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [category, setCategory] = useState("General");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<HabitFrequency>("daily");
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [interval, setInterval] = useState(2);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [time, setTime] = useState("");
  const [remind, setRemind] = useState(false);
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(habit?.name ?? "");
    setIcon(habit?.icon ?? "");
    setCategory(habit?.category ?? "General");
    setDescription(habit?.description ?? "");
    setFrequency(habit?.frequency ?? "daily");
    setDays(habit?.frequency === "days" ? habit.days : [1, 3, 5]);
    setInterval(habit?.interval_days ?? 2);
    setStart(habit?.start_date ?? today);
    setEnd(habit?.end_date ?? "");
    setTime(habit?.time ?? habit?.reminder_time ?? "");
    setRemind(!!habit?.reminder_time);
    setTarget(habit?.target_value != null ? String(habit.target_value) : "");
    setUnit(habit?.target_unit ?? "");
    setError(null);
  }, [open, habit, today]);

  const cats = useMemo(() => Array.from(new Set([...HABIT_CATEGORIES, ...habits.map((h) => h.category)])), [habits]);
  const logCount = habit ? logs.filter((l) => l.habit_id === habit.id).length : 0;
  const orderedDays = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);

  async function save() {
    if (!name.trim()) return setError("Give the activity a name.");
    if (frequency === "days" && !days.length) return setError("Pick at least one day.");
    if (end && end < start) return setError("The end date is before the start date.");
    const row: Partial<Habit> = {
      name: name.trim(),
      icon: icon.trim() || null,
      category: category.trim() || "General",
      description: description.trim() || null,
      frequency,
      days: frequency === "days" ? [...days].sort() : [],
      interval_days: frequency === "interval" ? Math.min(365, Math.max(2, Math.round(interval || 2))) : null,
      start_date: start || today,
      end_date: end || null,
      time: time || null,
      reminder_time: remind && time ? time : null,
      target_value: target ? Number(target) : null,
      target_unit: target ? unit.trim() || null : null,
    };
    setBusy(true);
    try {
      if (habit) await act.update(habit, row);
      else await act.create(row);
      onClose();
    } catch {
      /* the store already showed why */
    } finally {
      setBusy(false);
    }
  }

  const scheduleChanged = habit && habit.start_date < today && (frequency !== habit.frequency || (frequency === "days" && [...days].sort().join() !== [...habit.days].sort().join()) || (frequency === "interval" && interval !== habit.interval_days));

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={habit ? `Edit ${habit.name}` : "New activity"}
        description={habit ? undefined : "Something you want to do regularly — the gym, reading, a language lesson."}
        size="md"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {habit && (
                <Button variant="ghost" className="text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              )}
              {habit && !habit.archived && (
                <Button
                  variant="ghost"
                  icon={<Archive className="h-4 w-4" />}
                  onClick={async () => {
                    await act.archive(habit).catch(() => undefined);
                    onClose();
                  }}
                >
                  Archive
                </Button>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" loading={busy} onClick={save}>
                {habit ? "Save" : "Add activity"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Activity" htmlFor="rh-name" error={error}>
            <Input id="rh-name" autoFocus={!habit} value={name} onChange={(e) => setName(e.target.value)} placeholder="Go to the gym" maxLength={80} />
          </Field>
          <Field label="Icon" optional help="Pick one, or type any emoji.">
            <div className="flex flex-wrap items-center gap-1">
              <span className="block w-16">
                <Input aria-label="Icon" value={icon} onChange={(e) => setIcon(e.target.value.slice(0, 8))} className="h-9 text-center" placeholder="—" />
              </span>
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => setIcon(e)} className={cn("h-9 w-9 rounded-lg text-[18px] hover:bg-surface-3", icon === e && "bg-surface-3 ring-1 ring-line-strong")} aria-label={`Use ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="rh-cat">
              <Input id="rh-cat" list="rh-cats" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={40} />
              <datalist id="rh-cats">
                {cats.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Target" optional help="For your reference, e.g. 20 minutes. Ticking it off is what counts.">
              <div className="flex gap-2">
                <NumberInput aria-label="Target amount" value={target} min={0} onChange={(e) => setTarget(e.target.value)} placeholder="20" className="w-24" />
                <Input aria-label="Target unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="minutes" maxLength={20} />
              </div>
            </Field>
          </div>
          <Field label="Details" optional htmlFor="rh-desc">
            <Textarea id="rh-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Strength training, 45 minutes" className="min-h-16" />
          </Field>
          <Field label="How often" help={scheduleChanged ? "The new days apply from today. Earlier days keep the old schedule, so your history doesn't change." : undefined}>
            <Segmented<HabitFrequency>
              value={frequency}
              onChange={setFrequency}
              options={[
                { id: "daily", label: "Every day" },
                { id: "days", label: "Some days" },
                { id: "interval", label: "Every few days" },
              ]}
            />
          </Field>
          {frequency === "days" && (
            <div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of the week">
                {orderedDays.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={days.includes(d)}
                    onClick={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
                    className={cn("h-10 w-12 rounded-xl border text-[13.5px] font-medium transition-colors", days.includes(d) ? "border-inverse bg-inverse text-on-inverse" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
                  >
                    {WEEKDAY_SHORT[d]}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2 text-[12.5px]">
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => setDays([1, 2, 3, 4, 5])}>
                  Weekdays
                </button>
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => setDays([0, 6])}>
                  Weekends
                </button>
              </div>
            </div>
          )}
          {frequency === "interval" && (
            <div className="flex items-center gap-2 text-[14px] text-ink-2">
              Every
              <NumberInput aria-label="Days between" min={2} max={365} value={interval} onChange={(e) => setInterval(Number(e.target.value))} className="w-20" />
              days, counting from {frequency === habit?.frequency && habit && habit.start_date < today ? "when it started" : "the start date"}
            </div>
          )}
          <Field label="Time" optional htmlFor="rh-time" help="When in the day you do it. Your checklist lists activities by time; ones without a time come after.">
            <div className="flex items-center gap-2">
              <Input id="rh-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" />
              {time ? (
                <Button size="sm" variant="ghost" onClick={() => setTime("")}>
                  Any time
                </Button>
              ) : (
                <span className="text-[13px] text-ink-3">Any time</span>
              )}
            </div>
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Starts on" htmlFor="rh-start" help={start < today && !habit ? "Earlier days you don't tick count as missed — tick them in the calendar if you did them." : undefined}>
              <DateInput id="rh-start" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Ends on" optional htmlFor="rh-end" help="Leave empty to keep going.">
              <DateInput id="rh-end" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <div className="rounded-xl border border-line p-3">
            <Switch
              checked={remind && !!time}
              onChange={(v) => setRemind(v)}
              label="Remind me at this time"
              help={time ? `A nudge on this device at ${formatTime(time)} if it isn't done yet (while the app is open or in the background).` : "Set a time above first."}
            />
          </div>
        </div>
      </Sheet>
      {habit && (
        <ConfirmSheet
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          danger
          title={`Delete ${habit.name}?`}
          confirmLabel="Delete for good"
          body={
            <>
              This removes the activity{logCount ? <> and its <b>{logCount}</b> saved day{logCount === 1 ? "" : "s"}</> : null} from every month and report. To stop tracking but keep the history, archive it instead.
            </>
          }
          onConfirm={async () => {
            await act.remove(habit);
            onClose();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// One activity's history
// ---------------------------------------------------------------------------

export function HabitDetailSheet({ habit, onClose, month, onEdit }: { habit: Habit | null; onClose: () => void; month: string; onEdit: (h: Habit) => void }) {
  const { index, today, weekStart, logs } = useRhythm();
  const act = useRhythmActions();
  const data = useMemo(() => {
    if (!habit) return null;
    const r = monthReport([habit], index, month, today, weekStart);
    return { r, all: habitStreaks(habit, index, today) };
  }, [habit, index, month, today, weekStart]);
  const notes = useMemo(
    () => (habit ? logs.filter((l) => l.habit_id === habit.id && l.notes && monthKey(l.date) === month).sort((a, b) => (a.date < b.date ? 1 : -1)) : []),
    [habit, logs, month],
  );
  if (!habit || !data) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;
  const t = data.r.tally;
  const scheduled = t.eligible + t.skipped + t.upcoming;
  return (
    <Sheet
      open={!!habit}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <HabitIcon h={habit} />
          <span className="min-w-0 truncate">{habit.name}</span>
        </span>
      }
      description={`${habit.category} · ${scheduleLabel(habit, weekStart)}${habit.time ? ` at ${formatTime(habit.time)}` : ""} · since ${formatDate(habit.start_date)}${habit.archived ? " · archived" : ""}`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {habit.archived ? (
            <Button icon={<RotateCcw className="h-4 w-4" />} onClick={() => void act.restore(habit).catch(() => undefined)}>
              Bring back
            </Button>
          ) : (
            <Button icon={<Archive className="h-4 w-4" />} onClick={() => void act.archive(habit).catch(() => undefined)}>
              Archive
            </Button>
          )}
          <Button variant="primary" onClick={() => onEdit(habit)}>
            Edit
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-[13px] font-medium text-ink-2">{formatMonthLong(month)}</p>
      {scheduled === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-ink-2">No days for this activity in {formatMonthLong(month)}.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <RhStat label="Completion" value={pctText(t.rate)} note={t.eligible ? `${t.completed} of ${t.eligible} counted` : "Nothing counted yet"} />
            <RhStat label="Scheduled" value={scheduled} note={t.upcoming ? `${t.upcoming} still to come` : "days this month"} />
            <RhStat label="Done" value={t.completed} note={`${t.missed} missed · ${t.skipped} skipped`} />
            <RhStat label="Streak now" value={`${data.all.current} ${data.all.current === 1 ? "day" : "days"}`} note={`Best ever: ${data.all.best}`} />
          </div>
          {t.rate != null && t.skipped > 0 && (
            <p className="mt-2 text-[12.5px] text-ink-3">
              Completion = {t.completed} ÷ ({scheduled - t.upcoming} − {t.skipped} skipped) = {(t.rate * 100).toFixed(1)}%
            </p>
          )}
          <h3 className="mb-2 mt-5 text-[14px] font-semibold">Day by day</h3>
          <div className="flex flex-wrap gap-1">
            {data.r.days
              .filter((d) => d.occ.length)
              .map((d) => (
                <span
                  key={d.date}
                  title={`${formatDate(d.date)} — ${STATUS_UI[d.occ[0].status].word}`}
                  className={cn(
                    "num inline-flex h-8 w-8 items-center justify-center rounded-lg text-[11.5px] font-medium",
                    d.occ[0].status === "completed" ? "bg-rh-done text-white" : d.occ[0].status === "missed" ? "bg-danger-soft text-danger" : d.occ[0].status === "skipped" ? "bg-surface-3 text-ink-3 line-through" : "border border-dashed border-line-strong text-ink-3",
                  )}
                >
                  {Number(d.date.slice(8))}
                </span>
              ))}
          </div>
          <p className="mt-1.5 text-[12px] text-ink-3">Green: done · red: missed · grey struck through: skipped · dashed: to do or upcoming.</p>
          {data.r.weeks.some((w) => w.tally.eligible > 0) && (
            <>
              <h3 className="mb-2 mt-5 text-[14px] font-semibold">Week by week</h3>
              <HabitWeeksChart weeks={data.r.weeks} />
            </>
          )}
          <h3 className="mb-2 mt-5 text-[14px] font-semibold">Notes</h3>
          {notes.length === 0 ? (
            <p className="text-[13px] text-ink-3">No notes this month. Open a day in the calendar to add one.</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-surface-2 px-3 py-2 text-[13.5px]">
                  <span className="flex items-center justify-between gap-2 text-[12px] text-ink-3">
                    {formatDate(n.date, "long")}
                    {n.status !== "pending" && <Badge>{STATUS_UI[n.status].word}</Badge>}
                  </span>
                  <span className="mt-0.5 block text-ink">{n.notes}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}
