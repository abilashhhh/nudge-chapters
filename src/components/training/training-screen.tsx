"use client";

import { AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { revisionQueue } from "@/lib/training/engine";
import { Tabs } from "../ui/misc";
import { V2PageHeader } from "../v2/ui";
import { useTraining, useTrainingStatus } from "./actions";
import { TrainingDashboard } from "./dashboard";
import { LearnCatalog, LessonView } from "./learn";
import { useTrainingView, type TrainingTab } from "./nav";
import { PracticeHub, RunLauncher } from "./practice";
import { ReviewScreen } from "./review";
import { ScoresScreen } from "./scores";

/** Trading Training: lessons, practice, the daily scoreboard and review — a personal chart-reading tutor. */
export function TradingTrainingScreen() {
  const [view, go] = useTrainingView();
  const t = useTraining();
  const needsUpdate = useTrainingStatus((s) => s.needsUpdate);
  const local = useStore((s) => s.repo?.kind === "local");
  const due = revisionQueue(t.data.attempts, t.today).length;

  const banner = needsUpdate && (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-warn/40 bg-warn-soft p-4 text-[13.5px]" role="alert">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
      <p>
        <span className="font-semibold">Progress can't be saved yet.</span> Your server needs the Trading Training database update (<code>supabase/migrations/0015_trading_training.sql</code>). Lessons and practice still work, but answers won't be kept until it's applied.
      </p>
    </div>
  );

  // A lesson or a round takes the whole page; Back (or the close button) returns to where you were.
  if (view.lesson)
    return (
      <>
        {banner}
        <LessonView id={view.lesson} />
      </>
    );
  if (view.run)
    return (
      <>
        {banner}
        <RunLauncher key={`${view.run}|${view.topic ?? ""}`} run={view.run} topic={view.topic ?? null} />
      </>
    );

  return (
    <>
      <V2PageHeader title="Trading Training" shortTitle="Training" />
      {banner}
      <Tabs<TrainingTab>
        className="mb-4"
        value={view.tab}
        onChange={(tab) => go({ tab })}
        tabs={[
          { id: "home", label: "Dashboard" },
          { id: "learn", label: "Learn", count: undefined },
          { id: "practice", label: "Practice", count: due || undefined },
          { id: "scores", label: "Scoreboard" },
          { id: "review", label: "Review" },
        ]}
      />
      {view.tab === "home" && <TrainingDashboard />}
      {view.tab === "learn" && <LearnCatalog />}
      {view.tab === "practice" && <PracticeHub />}
      {view.tab === "scores" && <ScoresScreen />}
      {view.tab === "review" && <ReviewScreen sessionId={view.session ?? null} />}
      {local && <p className="mt-6 text-center text-[12px] text-ink-3">Demo mode: your training progress is stored on this device only.</p>}
    </>
  );
}
