"use client";

import { useFinance } from "@/lib/finance";
import { useTab } from "@/lib/use-tab";
import { addDays } from "@/lib/dates";
import { Tabs } from "../ui/misc";
import { NotesScreen, RemindersScreen, TodoScreen, WishlistScreen } from "./life-pages";
import { V2PageHeader } from "./ui";

const TABS = ["todo", "reminders", "notes", "wishlist"] as const;
type Tab = (typeof TABS)[number];

/** Daily: to-do & checklists, reminders, notes and wishlist — one tap from the main bar. */
export function DailyScreen() {
  const [tab, setTab] = useTab(TABS, "todo");
  const { ds, today } = useFinance();
  const open = ds.life_items.filter((i) => i.status === "open");
  const dueSoon = open.filter((i) => (i.kind === "task" || i.kind === "checklist") && i.due_date && i.due_date <= today).length;
  const remindersSoon = open.filter((i) => i.kind === "reminder" && i.due_date && i.due_date <= addDays(today, 7)).length;
  return (
    <>
      <V2PageHeader title="Daily" meaning="To-do, reminders, notes and your wishlist" />
      <Tabs<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "todo", label: "To-do", count: dueSoon },
          { id: "reminders", label: "Reminders", count: remindersSoon },
          { id: "notes", label: "Notes", count: open.filter((i) => i.kind === "note").length },
          { id: "wishlist", label: "Wishlist", count: open.filter((i) => i.kind === "wishlist").length },
        ]}
      />
      {tab === "todo" && <TodoScreen embedded />}
      {tab === "reminders" && <RemindersScreen embedded />}
      {tab === "notes" && <NotesScreen embedded />}
      {tab === "wishlist" && <WishlistScreen embedded />}
    </>
  );
}
