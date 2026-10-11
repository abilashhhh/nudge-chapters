"use client";

import { ArrowDown, ArrowUp, BarChart3, CalendarDays, History, LayoutGrid, ListChecks, Pencil, Plus, RotateCcw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { addDays, addMonths, formatDate, formatMonthLong, monthKey } from "@/lib/dates";
import {
  DAY_GOAL_DEFAULT, SUGGESTED_HABITS, compareMonths, dayStreaks, daySummary, habitStreaks, monthInsights, monthReport, scheduleLabel, trackedMonths,
  type Insight, type MonthReport,
} from "@/lib/rhythm";
import { useStore } from "@/lib/store";
import type { Habit } from "@/lib/types";
import { Button } from "../ui/button";
import { Select } from "../ui/form";
import { Badge, EmptyState, Panel, Progress, Segmented } from "../ui/misc";
import { useRhythm, useRhythmActions } from "./actions";
import { DailyTrendChart, HabitBarsChart, Heatmap, MonthlyTrendChart, StackedDaysChart, WeeklyChart } from "./charts";
import { CalendarLegend, DayChecklist, HabitDetailSheet, HabitEditorSheet, HabitIcon, MonthCalendar, MonthNav, RhStat, pctText } from "./parts";

const VIEWS = ["overview", "calendar", "activities", "analytics", "history"] as const;
type View = (typeof VIEWS)[number];

const VIEW_META: Record<View, { label: string; icon: typeof LayoutGrid }> = {
  overview: { label: "Overview", icon: LayoutGrid },
  calendar: { label: "Calendar", icon: CalendarDays },
  activities: { label: "Activities", icon: ListChecks },
  analytics: { label: "Analytics", icon: BarChart3 },
  history: { label: "History", icon: History },
};

/** Query-string state for this section: ?view=…&month=YYYY-MM&day=YYYY-MM-DD (keeps ?tab=rhythm). */
function useRhythmParams(today: string) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawView = params.get("view") as View | null;
  const view: View = rawView && VIEWS.includes(rawView) ? rawView : "overview";
  const rawMonth = params.get("month");
  const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : monthKey(today);
  const rawDay = params.get("day");
  const day = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : null;
  const set = useCallback(
    (patch: { view?: View; month?: string; day?: string | null }) => {
      const p = new URLSearchParams(params.toString());
      p.set("tab", "rhythm");
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) p.delete(k);
        else p.set(k, v);
      }
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [params, router, pathname],
  );
  return { view, month, day, set };
}

/** Daily Rhythm: a calendar checklist for everyday activities, with streaks and monthly analytics. */
export function RhythmSection() {
  const { habits, today } = useRhythm();
  const { view, month, day, set } = useRhythmParams(today);
  const [editing, setEditing] = useState<Habit | null | "new">(null);
  const [detail, setDetail] = useState<string | null>(null);
  const detailHabit = habits.find((h) => h.id === detail) ?? null;
  const openEditor = (h: Habit | null) => {
    setDetail(null);
    setEditing(h ?? "new");
  };
  const ctx: ViewCtx = {
    month,
    setMonth: (m) => set({ month: m, day: null }),
    day,
    setDay: (d) => set({ day: d, month: monthKey(d) }),
    go: (v, extra) => set({ view: v, ...extra }),
    openHabit: (h) => setDetail(h.id),
    openEditor,
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="display flex items-center gap-2 text-[22px] font-semibold leading-tight">Daily Rhythm</h2>
          <p className="text-[13.5px] text-ink-2">Tick off your everyday activities and see how consistent you are, month by month.</p>
        </div>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openEditor(null)}>
          Add activity
        </Button>
      </div>
      <nav aria-label="Daily Rhythm views" className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex gap-1 rounded-2xl bg-surface-3/70 p-1">
          {VIEWS.map((v) => {
            const Icon = VIEW_META[v].icon;
            return (
              <button
                key={v}
                type="button"
                aria-current={view === v ? "page" : undefined}
                onClick={() => set({ view: v })}
                className={cn("inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13.5px] font-medium transition-colors", view === v ? "bg-surface text-ink shadow-sm" : "text-ink-2 hover:text-ink")}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {VIEW_META[v].label}
              </button>
            );
          })}
        </div>
      </nav>

      {habits.length === 0 && view !== "activities" ? (
        <Welcome onCustom={() => openEditor(null)} />
      ) : (
        <>
          {view === "overview" && <OverviewView {...ctx} />}
          {view === "calendar" && <CalendarView {...ctx} />}
          {view === "activities" && <ActivitiesView {...ctx} />}
          {view === "analytics" && <AnalyticsView {...ctx} />}
          {view === "history" && <HistoryView {...ctx} />}
        </>
      )}

      <HabitEditorSheet open={editing != null} habit={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      <HabitDetailSheet habit={detailHabit} month={month} onClose={() => setDetail(null)} onEdit={(h) => openEditor(h)} />
    </div>
  );
}

interface ViewCtx {
  month: string;
  setMonth: (m: string) => void;
  day: string | null;
  setDay: (d: string) => void;
  go: (v: View, extra?: { month?: string; day?: string | null }) => void;
  openHabit: (h: Habit) => void;
  openEditor: (h: Habit | null) => void;
}

// ---------------------------------------------------------------------------

function Welcome({ onCustom }: { onCustom: () => void }) {
  const act = useRhythmActions();
  const [picked, setPicked] = useState<string[]>(SUGGESTED_HABITS.slice(0, 2).map((s) => s.name));
  const [busy, setBusy] = useState(false);
  return (
    <Panel>
      <div className="mx-auto max-w-xl py-4 text-center">
        <Sparkles className="mx-auto mb-3 h-7 w-7 text-brand" aria-hidden />
        <p className="display text-[20px] font-semibold">Start your rhythm</p>
        <p className="mt-1 text-[14px] text-ink-2">Pick a few things you want to do regularly. You&apos;ll get a checklist for every day, a calendar of how each day went, and monthly charts.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {SUGGESTED_HABITS.map((s) => {
            const on = picked.includes(s.name);
            return (
              <button
                key={s.name}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== s.name) : [...p, s.name]))}
                className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-colors", on ? "border-ink bg-ink text-paper" : "border-line bg-surface text-ink-2 hover:border-line-strong")}
              >
                <span aria-hidden>{s.icon}</span>
                {s.name}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button
            variant="primary"
            loading={busy}
            disabled={!picked.length}
            onClick={async () => {
              setBusy(true);
              try {
                await act.createMany(SUGGESTED_HABITS.filter((s) => picked.includes(s.name)));
              } catch {
                /* shown by the store */
              } finally {
                setBusy(false);
              }
            }}
          >
            Start with {picked.length || "these"} {picked.length === 1 ? "activity" : "activities"}
          </Button>
          <Button onClick={onCustom}>Create my own</Button>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">They all start today, every day. You can change days, rename or remove them any time.</p>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewView({ go, openHabit, openEditor }: ViewCtx) {
  const { habits, index, today, weekStart, goal } = useRhythm();
  const cur = monthKey(today);
  const data = useMemo(() => {
    const t = daySummary(habits, index, today, today);
    const r = monthReport(habits, index, cur, today, weekStart, goal);
    const prev = monthReport(habits, index, monthKey(addMonths(`${cur}-01`, -1, 1)), today, weekStart, goal);
    return { t, r, streak: dayStreaks(habits, index, today, goal), insights: monthInsights(r, prev, today) };
  }, [habits, index, today, cur, weekStart, goal]);
  const { t, r, streak } = data;
  const remaining = t.tally.pending;
  const active = habits.filter((h) => !h.archived);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <RhStat accent label="Today" value={t.tally.eligible ? `${t.tally.completed}/${t.tally.eligible}` : "—"} note={t.tally.eligible ? `${pctText(t.tally.rate)} done` : "Nothing scheduled today"} />
        <RhStat label="Left today" value={remaining} note={remaining ? "still to tick" : t.tally.eligible ? "All done 🎉" : "Free day"} />
        <RhStat label={`${formatMonthLong(cur).split(" ")[0]} so far`} value={pctText(r.tally.rate)} note={r.tally.eligible ? `${r.tally.completed} of ${r.tally.eligible} done` : "Nothing counted yet"} onClick={() => go("analytics", { month: cur })} />
        <RhStat label="Day streak" value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`} note={`Days with ${goal}%+ done`} />
        <RhStat label="Best streak" value={`${streak.best} ${streak.best === 1 ? "day" : "days"}`} note={streak.bestEnd ? `Ended ${formatDate(streak.bestEnd, "short")}` : "Keep going"} />
        <RhStat
          label="Most consistent"
          value={r.mostConsistent ? `${r.mostConsistent.habit.icon ?? ""} ${pctText(r.mostConsistent.tally.rate)}`.trim() : "—"}
          note={r.mostConsistent?.habit.name ?? "Needs a few days"}
          onClick={r.mostConsistent ? () => openHabit(r.mostConsistent!.habit) : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel title="Today's checklist" description="Tap the box when it's done. Use ⌄ to mark missed, skip a day or add a note.">
          <DayChecklist date={today} onOpenHabit={openHabit} emptyAction={active.length === 0 ? <Button onClick={() => openEditor(null)}>Add an activity</Button> : undefined} />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => go("calendar", { day: addDays(today, -1), month: monthKey(addDays(today, -1)) })}>
              Review yesterday
            </Button>
            <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => openEditor(null)}>
              Add activity
            </Button>
          </div>
        </Panel>
        <Panel
          title={formatMonthLong(cur)}
          description="Tap a day to see or fix its checklist."
          action={
            <Button size="sm" onClick={() => go("calendar", { month: cur })}>
              Full calendar
            </Button>
          }
        >
          <MonthCalendar month={cur} compact selected={today} onSelect={(d) => go("calendar", { day: d, month: monthKey(d) })} />
          <CalendarLegend className="mt-3" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Day by day this month" description="Share of each day's activities you completed." action={<Button size="sm" variant="ghost" onClick={() => go("analytics", { month: cur })}>All charts</Button>}>
          {r.tally.eligible ? <DailyTrendChart days={r.days} today={today} height={190} /> : <NotEnough />}
        </Panel>
        <Panel title="What stands out">
          <InsightList insights={data.insights} />
        </Panel>
      </div>
    </div>
  );
}

function NotEnough() {
  return <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-[13.5px] text-ink-2">Not enough history yet — tick off a few days and your charts will fill in.</p>;
}

function InsightList({ insights }: { insights: Insight[] }) {
  if (!insights.length) return <NotEnough />;
  return (
    <ul className="space-y-2.5">
      {insights.map((i) => (
        <li key={i.text} className="flex gap-2.5 text-[14px] leading-snug">
          {i.tone === "good" ? <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="Good" /> : i.tone === "bad" ? <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Needs attention" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" aria-hidden />}
          <span>{i.text}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function CalendarView({ month, setMonth, day, setDay, openHabit }: ViewCtx) {
  const { habits, index, today, weekStart, goal } = useRhythm();
  const r = useMemo(() => monthReport(habits, index, month, today, weekStart, goal), [habits, index, month, today, weekStart, goal]);
  const streak = useMemo(() => dayStreaks(habits, index, today, goal), [habits, index, today, goal]);
  const selected = day && monthKey(day) === month ? day : month === monthKey(today) ? today : `${month}-01`;
  const scheduled = r.tally.eligible + r.tally.skipped + r.tally.upcoming;
  return (
    // On phones the calendar and checklist come first; the numbers follow.
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} setMonth={setMonth} today={today} />
        <CalendarLegend />
      </div>
      <div className="order-2 grid grid-cols-2 gap-2 sm:order-none sm:grid-cols-4 sm:gap-3">
        <RhStat label="Overall completion" value={pctText(r.tally.rate)} note={r.tally.eligible ? "of the days counted so far" : "Nothing counted yet"} />
        <RhStat label="Activities completed" value={r.tally.completed} note={`${r.tally.missed} missed · ${r.tally.skipped} skipped`} />
        <RhStat label="Activities scheduled" value={scheduled} note={r.tally.upcoming ? `${r.tally.upcoming} still to come` : "in this month"} />
        <RhStat label="Current day streak" value={`${streak.current} ${streak.current === 1 ? "day" : "days"}`} note={`Best ${streak.best} · goal ${goal}%`} />
      </div>
      <div className="order-1 grid grid-cols-1 gap-4 sm:order-none xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel>
          <MonthCalendar month={month} selected={selected} onSelect={setDay} />
        </Panel>
        <Panel title="Checklist" description="Fix any day — past days you forgot can still be ticked.">
          <DayChecklist date={selected} onOpenHabit={openHabit} />
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDay(addDays(selected, -1))}>
              ‹ Previous day
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDay(addDays(selected, 1))}>
              Next day ›
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

function ActivitiesView({ openHabit, openEditor }: ViewCtx) {
  const { habits, index, today, weekStart, goal, ds } = useRhythm();
  const act = useRhythmActions();
  const [cat, setCat] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const cats = useMemo(() => Array.from(new Set(habits.map((h) => h.category))).sort(), [habits]);
  const r = useMemo(() => monthReport(habits, index, monthKey(today), today, weekStart, goal), [habits, index, today, weekStart, goal]);
  const rate = new Map(r.perHabit.map((p) => [p.habit.id, p.tally]));
  const sorted = [...habits].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const list = sorted.filter((h) => (showArchived ? h.archived : !h.archived) && (cat === "all" || h.category === cat));
  const archivedCount = habits.filter((h) => h.archived).length;
  const prefs = ds.profile.preferences ?? {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={showArchived ? "archived" : "active"}
          onChange={(v) => setShowArchived(v === "archived")}
          options={[
            { id: "active", label: `Active (${habits.length - archivedCount})` },
            { id: "archived", label: `Archived (${archivedCount})` },
          ]}
        />
        {cats.length > 1 && (
          <div className="w-44">
            <Select aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 text-[14px]">
              <option value="all">All categories</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={showArchived ? "Nothing archived" : habits.length ? "Nothing in this category" : "No activities yet"}
          body={showArchived ? "Archived activities keep their history and show up here." : "Add the things you want to do regularly."}
          action={!showArchived ? <Button variant="primary" onClick={() => openEditor(null)}>Add activity</Button> : undefined}
        />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {list.map((h, i) => {
            const t = rate.get(h.id);
            const s = habitStreaks(h, index, today);
            return (
              <li key={h.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                {!showArchived && cat === "all" && (
                  <div className="flex flex-col">
                    <button type="button" aria-label={`Move ${h.name} up`} disabled={i === 0} onClick={() => void act.move(list, h, -1).catch(() => undefined)} className="rounded p-0.5 text-ink-3 hover:text-ink disabled:opacity-25">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label={`Move ${h.name} down`} disabled={i === list.length - 1} onClick={() => void act.move(list, h, 1).catch(() => undefined)} className="rounded p-0.5 text-ink-3 hover:text-ink disabled:opacity-25">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <HabitIcon h={h} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openHabit(h)}>
                  <span className="block truncate text-[14.5px] font-medium text-ink">{h.name}</span>
                  <span className="block truncate text-[12.5px] text-ink-3">
                    {h.category} · {scheduleLabel(h, weekStart)}
                    {h.reminder_time ? ` · ⏰ ${h.reminder_time}` : ""}
                    {h.archived && h.archived_on ? ` · archived ${formatDate(h.archived_on)}` : h.start_date > today ? ` · starts ${formatDate(h.start_date)}` : ""}
                  </span>
                </button>
                <div className="hidden w-28 text-right sm:block">
                  <span className="num block text-[14px] font-semibold">{pctText(t?.rate)}</span>
                  <span className="block text-[11.5px] text-ink-3">this month</span>
                </div>
                <div className="hidden w-20 text-right md:block">
                  <span className="num block text-[14px] font-semibold">{s.current}</span>
                  <span className="block text-[11.5px] text-ink-3">day streak</span>
                </div>
                {h.archived ? (
                  <Button size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => void act.restore(h).catch(() => undefined)}>
                    Bring back
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" aria-label={`Edit ${h.name}`} onClick={() => openEditor(h)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Panel title="Tracker settings" description="Changes how things are shown and how the day streak is counted. Your records don't change.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Weeks start on
            <Segmented<"1" | "0">
              value={prefs.rhythmWeekStart === 0 ? "0" : "1"}
              onChange={(v) => void useStore.getState().updatePrefs({ rhythmWeekStart: v === "0" ? 0 : 1 }).catch(() => undefined)}
              options={[
                { id: "1", label: "Monday" },
                { id: "0", label: "Sunday" },
              ]}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            A day counts toward your streak when at least
            <Select value={String(prefs.rhythmDayGoal ?? DAY_GOAL_DEFAULT)} onChange={(e) => void useStore.getState().updatePrefs({ rhythmDayGoal: Number(e.target.value) }).catch(() => undefined)} className="h-10 text-[14px]">
              {[50, 60, 70, 75, 80, 90, 100].map((v) => (
                <option key={v} value={v}>
                  {v === 100 ? "everything is done" : `${v}% is done`}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <details className="mt-4 text-[13px] text-ink-2">
          <summary className="cursor-pointer font-medium text-ink">How everything is counted</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>An activity counts only on the days it&apos;s scheduled — a Mon/Wed/Fri gym plan never counts as missed on a Tuesday.</li>
            <li>Not ticked: &ldquo;to do&rdquo; today, &ldquo;missed&rdquo; on earlier days. You can still tick an earlier day later. Future days never count.</li>
            <li>Completion = done ÷ (done + missed + to do). Skipped days are left out, so they never count against you.</li>
            <li>Week and month rates add up their days&apos; counts rather than averaging daily percentages.</li>
            <li>Activity streak: scheduled days done in a row. Skipped days and days off don&apos;t break it, and it carries across months.</li>
            <li>Changing an activity&apos;s days applies from today; archiving stops new days but keeps all history.</li>
          </ul>
        </details>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

function AnalyticsView({ month, setMonth, go, openHabit }: ViewCtx) {
  const { habits, index, today, weekStart, goal } = useRhythm();
  const data = useMemo(() => {
    const r = monthReport(habits, index, month, today, weekStart, goal);
    const prev = monthReport(habits, index, monthKey(addMonths(`${month}-01`, -1, 1)), today, weekStart, goal);
    return { r, prev, insights: monthInsights(r, prev, today) };
  }, [habits, index, month, today, weekStart, goal]);
  const { r } = data;
  const t = r.tally;
  const future = month > monthKey(today);
  return (
    <div className="space-y-4">
      <MonthNav month={month} setMonth={setMonth} today={today} />
      {future ? (
        <EmptyState icon={BarChart3} title="This month hasn't started" body="Analytics fill in as the days happen." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <RhStat accent label="Overall completion" value={pctText(t.rate)} note={t.eligible ? `${t.completed} of ${t.eligible} counted` : "Nothing counted"} />
            <RhStat label="Completed" value={t.completed} note={t.pending ? `${t.pending} still to do today` : "activity days"} />
            <RhStat label="Missed" value={t.missed} note={`${t.skipped} skipped (not counted)`} />
            <RhStat label="Activities tracked" value={r.activeCount} note={`${r.perfectDays} perfect ${r.perfectDays === 1 ? "day" : "days"}`} />
            <RhStat label="Best day" value={r.bestDay ? formatDate(r.bestDay.date, "short") : "—"} note={r.bestDay ? `${r.bestDay.tally.completed} of ${r.bestDay.tally.eligible} · ${pctText(r.bestDay.tally.rate)}` : undefined} onClick={r.bestDay ? () => go("calendar", { day: r.bestDay!.date, month }) : undefined} />
            <RhStat label="Most consistent" value={r.mostConsistent ? pctText(r.mostConsistent.tally.rate) : "—"} note={r.mostConsistent?.habit.name} onClick={r.mostConsistent ? () => openHabit(r.mostConsistent!.habit) : undefined} />
            <RhStat label="Best day streak" value={`${r.bestDayStreak} ${r.bestDayStreak === 1 ? "day" : "days"}`} note={`Days with ${goal}%+ done`} />
            <RhStat
              label={`vs ${formatMonthLong(data.prev.month).split(" ")[0]}`}
              value={t.rate != null && data.prev.tally.rate != null ? `${t.rate >= data.prev.tally.rate ? "+" : "−"}${Math.abs(Math.round((t.rate - data.prev.tally.rate) * 100))} pts` : "—"}
              note={data.prev.tally.rate != null ? `was ${pctText(data.prev.tally.rate)}` : "No data that month"}
              onClick={() => go("history", { month })}
            />
          </div>

          {t.eligible === 0 ? (
            <NotEnough />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Panel title="Daily completion" description="Share of each day's activities you completed. Days with nothing scheduled are left out.">
                  <DailyTrendChart days={r.days} today={today} />
                </Panel>
                <Panel title="By activity" description="Completion rate for each activity this month. Tap a bar for its history.">
                  <HabitBarsChart perHabit={r.perHabit} onSelect={(id) => openHabit(habits.find((h) => h.id === id)!)} />
                </Panel>
                <Panel title="Done vs missed" description="Activities per day. Skipped ones are shown but not counted.">
                  <StackedDaysChart days={r.days} today={today} />
                </Panel>
                <Panel title="Week by week" description="Each week's rate from its own days — the last week can be short.">
                  <WeeklyChart weeks={r.weeks} />
                </Panel>
                <Panel title="Consistency" description="Darker means more of that day was done. Tap a day to open it.">
                  <Heatmap report={r} weekStart={weekStart} today={today} onSelect={(d) => go("calendar", { day: d, month })} />
                  <Button size="sm" variant="ghost" className="mt-2" onClick={() => go("calendar", { month })}>
                    Open in calendar
                  </Button>
                </Panel>
                <Panel title="What stands out">
                  <InsightList insights={data.insights} />
                </Panel>
              </div>
              <ActivityTable report={r} onOpen={openHabit} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ActivityTable({ report, onOpen }: { report: MonthReport; onOpen: (h: Habit) => void }) {
  return (
    <Panel title="Each activity" description="Tap one for its full history, streaks and notes." flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[14px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-ink-3">
              <th className="px-4 py-2 font-medium sm:px-5">Activity</th>
              <th className="px-2 py-2 text-right font-medium">Done</th>
              <th className="px-2 py-2 text-right font-medium">Missed</th>
              <th className="px-2 py-2 text-right font-medium">Skipped</th>
              <th className="px-2 py-2 text-right font-medium">Best run</th>
              <th className="px-4 py-2 text-right font-medium sm:px-5">Completion</th>
            </tr>
          </thead>
          <tbody>
            {report.perHabit.map((p) => (
              <tr key={p.habit.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2" onClick={() => onOpen(p.habit)}>
                <td className="px-4 py-2.5 sm:px-5">
                  <button type="button" className="flex items-center gap-2 text-left font-medium" onClick={() => onOpen(p.habit)}>
                    <span aria-hidden>{p.habit.icon}</span>
                    {p.habit.name}
                    {p.habit.archived && <Badge>Archived</Badge>}
                  </button>
                </td>
                <td className="num px-2 text-right">{p.tally.completed}</td>
                <td className="num px-2 text-right">{p.tally.missed}</td>
                <td className="num px-2 text-right text-ink-3">{p.tally.skipped}</td>
                <td className="num px-2 text-right">{p.bestStreak}</td>
                <td className="px-4 sm:px-5">
                  <div className="flex items-center justify-end gap-2">
                    <Progress value={p.tally.rate ?? 0} className="hidden w-20 sm:block" label={`${p.habit.name} completion`} />
                    <span className="num w-11 text-right font-semibold">{pctText(p.tally.rate)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistoryView({ month, setMonth, go, openHabit }: ViewCtx) {
  const { habits, index, today, weekStart, goal } = useRhythm();
  const months = useMemo(() => trackedMonths(habits, today), [habits, today]);
  const reports = useMemo(() => new Map(months.map((m) => [m, monthReport(habits, index, m, today, weekStart, goal)])), [months, habits, index, today, weekStart, goal]);
  const sel = reports.has(month) ? month : months[0];
  const prevKey = sel ? monthKey(addMonths(`${sel}-01`, -1, 1)) : null;
  const a = prevKey ? reports.get(prevKey) ?? null : null;
  const b = sel ? reports.get(sel)! : null;
  const cmp = a && b ? compareMonths(a, b) : null;
  const rows = months.map((m) => {
    const r = reports.get(m)!;
    return { month: m, rate: r.tally.rate, completed: r.tally.completed, eligible: r.tally.eligible, r };
  });
  const withData = rows.filter((x) => x.rate != null && x.eligible >= 7);
  const bestMonth = withData.length ? withData.reduce((x, y) => (y.rate! > x.rate! ? y : x)) : null;
  const recent = withData.slice(0, 3);
  const before = withData.slice(3, 6);
  const avg = (l: typeof withData) => l.reduce((s, x) => s + x.completed, 0) / Math.max(1, l.reduce((s, x) => s + x.eligible, 0));

  if (!months.length || !b) return <NotEnough />;
  const cell = (r: MonthReport | null, f: (r: MonthReport) => string) => (r ? f(r) : "—");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Month by month" description="Completion rate for every month you've tracked.">
          {withData.length >= 2 ? <MonthlyTrendChart rows={rows.slice(0, 12)} /> : <p className="text-[13.5px] text-ink-2">The trend appears once you have two months with data.</p>}
          <div className="mt-3 space-y-1 text-[13.5px] text-ink-2">
            {bestMonth && (
              <p>
                Best month: <b className="text-ink">{formatMonthLong(bestMonth.month)}</b> at {pctText(bestMonth.rate)}.
              </p>
            )}
            {recent.length >= 2 && before.length >= 2 && (
              <p>
                Last {recent.length} months average {pctText(avg(recent))}, against {pctText(avg(before))} the {before.length} before —{" "}
                {avg(recent) - avg(before) >= 0.03 ? "you're getting more consistent." : avg(recent) - avg(before) <= -0.03 ? "a little less consistent lately." : "holding steady."}
              </p>
            )}
          </div>
        </Panel>
        <Panel
          title="Compare months"
          description="Each month uses only the activities and days that applied then."
          action={<MonthNav month={sel} setMonth={setMonth} today={today} />}
        >
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-3">
                <th className="py-2 font-medium" />
                <th className="py-2 text-right font-medium">{prevKey ? formatMonthLong(prevKey) : "—"}</th>
                <th className="py-2 text-right font-medium">{formatMonthLong(sel)}</th>
              </tr>
            </thead>
            <tbody className="[&_td]:py-2 [&_tr]:border-b [&_tr]:border-line [&_tr:last-child]:border-0">
              <CompareRow label="Completion rate" a={cell(a, (r) => pctText(r.tally.rate))} b={pctText(b.tally.rate)} />
              <CompareRow label="Completed" a={cell(a, (r) => String(r.tally.completed))} b={String(b.tally.completed)} />
              <CompareRow label="Missed" a={cell(a, (r) => String(r.tally.missed))} b={String(b.tally.missed)} />
              <CompareRow label="Skipped" a={cell(a, (r) => String(r.tally.skipped))} b={String(b.tally.skipped)} />
              <CompareRow label="Best day streak" a={cell(a, (r) => `${r.bestDayStreak} days`)} b={`${b.bestDayStreak} days`} />
              <CompareRow label="Perfect days" a={cell(a, (r) => String(r.perfectDays))} b={String(b.perfectDays)} />
            </tbody>
          </table>
          {a && a.tally.rate != null && b.tally.rate != null && (
            <p className="mt-3 text-[13.5px] text-ink-2">
              {b.month === monthKey(today) ? "So far, " : ""}
              {b.month === monthKey(today) ? (b.tally.rate >= a.tally.rate ? "up" : "down") : b.tally.rate >= a.tally.rate ? "Up" : "Down"} <b className="text-ink">{Math.abs(Math.round((b.tally.rate - a.tally.rate) * 100))} percentage points</b> on {formatMonthLong(a.month).split(" ")[0]}.
            </p>
          )}
          {cmp && (cmp.improved.length > 0 || cmp.declined.length > 0) && (
            <div className="mt-3 grid grid-cols-1 gap-3">
              <MoverList title="Improved" icon={<TrendingUp className="h-4 w-4 text-ok" aria-hidden />} items={cmp.improved} onOpen={openHabit} />
              <MoverList title="Slipped" icon={<TrendingDown className="h-4 w-4 text-danger" aria-hidden />} items={cmp.declined} onOpen={openHabit} />
            </div>
          )}
        </Panel>
      </div>

      <Panel title="All months" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-3">
                <th className="px-4 py-2 font-medium sm:px-5">Month</th>
                <th className="px-2 py-2 text-right font-medium">Completion</th>
                <th className="px-2 py-2 text-right font-medium">Done</th>
                <th className="px-2 py-2 text-right font-medium">Missed</th>
                <th className="px-2 py-2 text-right font-medium">Skipped</th>
                <th className="px-2 py-2 text-right font-medium">Best streak</th>
                <th className="px-4 py-2 text-right font-medium sm:px-5" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ month: m, r }) => (
                <tr key={m} className={cn("border-b border-line last:border-0", m === sel && "bg-surface-2")}>
                  <td className="px-4 py-2.5 font-medium sm:px-5">
                    {formatMonthLong(m)}
                    {bestMonth?.month === m && <Badge tone="brand" className="ml-2">Best</Badge>}
                  </td>
                  <td className="num px-2 text-right font-semibold">{pctText(r.tally.rate)}</td>
                  <td className="num px-2 text-right">{r.tally.completed}</td>
                  <td className="num px-2 text-right">{r.tally.missed}</td>
                  <td className="num px-2 text-right text-ink-3">{r.tally.skipped}</td>
                  <td className="num px-2 text-right">{r.bestDayStreak}</td>
                  <td className="px-4 text-right sm:px-5">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => go("analytics", { month: m })}>
                        Analytics
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => go("calendar", { month: m, day: null })}>
                        Calendar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function CompareRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr>
      <td className="text-ink-2">{label}</td>
      <td className="num text-right">{a}</td>
      <td className="num text-right font-semibold">{b}</td>
    </tr>
  );
}

function MoverList({ title, icon, items, onOpen }: { title: string; icon: ReactNode; items: { habit: Habit; from: number; to: number }[]; onOpen: (h: Habit) => void }) {
  if (!items.length) return null;
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
        {icon}
        {title}
      </p>
      <ul className="space-y-1 text-[13.5px]">
        {items.map((x) => (
          <li key={x.habit.id}>
            <button type="button" className="flex w-full items-center justify-between gap-2 text-left hover:underline" onClick={() => onOpen(x.habit)}>
              <span className="truncate">
                {x.habit.icon} {x.habit.name}
              </span>
              <span className="num shrink-0 text-ink-2">
                {pctText(x.from)} → {pctText(x.to)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

