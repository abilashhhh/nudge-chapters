"use client";

import { useFinance } from "@/lib/finance";
import { useTab } from "@/lib/use-tab";
import { addDays } from "@/lib/dates";
import { Tabs } from "../ui/misc";
import { NotesScreen, RemindersScreen, TodoScreen, WishlistScreen } from "./life-pages";
import { V2PageHeader } from "./ui";
import { RhythmSection } from "../rhythm/rhythm";
import { daySummary, indexLogs } from "@/lib/rhythm";

const TABS = ["rhythm", "todo", "reminders", "notes", "wishlist"] as const;
type Tab = (typeof TABS)[number];

/** Daily: the Daily Rhythm tracker, to-do & checklists, reminders, notes and wishlist — one tap from the main bar. */
export function DailyScreen() {
  const [tab, setTab] = useTab(TABS, "rhythm");
  const { ds, today } = useFinance();
  const open = ds.life_items.filter((i) => i.status === "open");
  const dueSoon = open.filter((i) => (i.kind === "task" || i.kind === "checklist") && i.due_date && i.due_date <= today).length;
  const rhythmLeft = daySummary(ds.habits ?? [], indexLogs(ds.habit_logs ?? []), today, today).tally.pending;
  const remindersSoon = open.filter((i) => i.kind === "reminder" && i.due_date && i.due_date <= addDays(today, 7)).length;
  return (
    <>
      <V2PageHeader title="Daily" />
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "rhythm", label: "Daily Rhythm", count: rhythmLeft },
          { id: "todo", label: "To-do", count: dueSoon },
          { id: "reminders", label: "Reminders", count: remindersSoon },
          { id: "notes", label: "Notes", count: open.filter((i) => i.kind === "note").length },
          { id: "wishlist", label: "Wishlist", count: open.filter((i) => i.kind === "wishlist").length },
        ]}
      />
      {tab === "rhythm" && <RhythmSection />}
      {tab === "todo" && <TodoScreen embedded />}
      {tab === "reminders" && <RemindersScreen embedded />}
      {tab === "notes" && <NotesScreen embedded />}
      {tab === "wishlist" && <WishlistScreen embedded />}
    </>
  );
}
