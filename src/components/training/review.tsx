"use client";

import { Check, ChevronDown, ChevronLeft, History, Repeat, ScrollText, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { LESSON_BY_ID, QUESTION_BY_ID, topicLabel } from "@/lib/training/content";
import { grade, mistakes, revisionQueue, type AnswerValue } from "@/lib/training/engine";
import type { TrainingAttempt } from "@/lib/types";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/misc";
import { useTraining } from "./actions";
import { Card } from "./dashboard";
import { useTrainingView } from "./nav";
import { QuestionCard } from "./question";
import { MODE_LABEL } from "./runner";

function AttemptRow({ a, index }: { a: TrainingAttempt; index?: number }) {
  const [open, setOpen] = useState(false);
  const q = QUESTION_BY_ID[a.question_id];
  if (!q) return null;
  return (
    <li>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white", a.correct ? "bg-ok" : a.score > 0 ? "bg-warn" : "bg-danger")}>{a.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px]">{index != null ? `${index + 1}. ` : ""}{q.prompt}</span>
          <span className="block text-[12px] text-ink-3">
            {topicLabel(a.topic)} · {formatDate(a.day, "medium")} · {a.attempt_no === 1 ? "first try" : `try ${a.attempt_no}`} · +{a.xp} XP
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-line/70 bg-surface-2/50 p-4">
          <QuestionCard q={q} review={{ answer: a.answer as AnswerValue, grade: grade(q, a.answer as AnswerValue), timeMs: a.time_ms, xp: a.xp }} />
        </div>
      )}
    </li>
  );
}

/** Mistake review and the history of every round you've finished. */
export function ReviewScreen({ sessionId }: { sessionId: string | null }) {
  const t = useTraining();
  const [, go] = useTrainingView();
  const [limit, setLimit] = useState(15);
  if (sessionId) return <SessionReview id={sessionId} />;
  const wrong = mistakes(t.data.attempts);
  const due = revisionQueue(t.data.attempts, t.today).length;
  const rounds = [...t.data.sessions].filter((s) => s.finished_at && t.data.attempts.some((a) => a.session_id === s.id)).sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <Card title="Mistake review" icon={ScrollText} action={due > 0 ? <Button size="sm" variant="primary" icon={<Repeat className="h-3.5 w-3.5" />} onClick={() => go({ tab: "practice", run: "revision" })}>Revise {due}</Button> : undefined}>
        {wrong.length ? (
          <>
            <p className="mb-2 text-[13px] text-ink-3">Your latest wrong answer for each question. Open one to see what you chose, the right answer and why.</p>
            <ul className="-mx-4 divide-y divide-line/70 border-y border-line/70 sm:-mx-5">
              {wrong.slice(0, limit).map((a) => <AttemptRow key={a.id} a={a} />)}
            </ul>
            {wrong.length > limit && <Button variant="ghost" className="mt-2" onClick={() => setLimit(limit + 15)}>Show more</Button>}
          </>
        ) : (
          <EmptyState icon={ScrollText} title="No mistakes to review" body={t.data.attempts.length ? "Everything you've answered so far was right." : "Answer some questions and any you miss will appear here with explanations."} />
        )}
      </Card>
      <Card title="Past rounds" icon={History}>
        {rounds.length ? (
          <ul className="-mx-4 divide-y divide-line/70 border-y border-line/70 sm:-mx-5">
            {rounds.slice(0, 40).map((s) => {
              const xs = t.data.attempts.filter((a) => a.session_id === s.id);
              const ok = xs.filter((a) => a.correct).length;
              const xp = xs.reduce((n, a) => n + a.xp, 0) + s.bonus_xp;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => go({ tab: "review", session: s.id })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{s.lesson_id && LESSON_BY_ID[s.lesson_id] ? `Check · ${LESSON_BY_ID[s.lesson_id].title}` : MODE_LABEL[s.mode]}</span>
                      <span className="block text-[12px] text-ink-3">{formatDate(s.day, "medium")} · {xs.length} question{xs.length === 1 ? "" : "s"}</span>
                    </span>
                    <span className="num text-right text-[13px]">
                      <span className={cn("block font-semibold", ok === xs.length ? "text-ok" : ok / xs.length >= 0.5 ? "text-ink" : "text-danger")}>{ok}/{xs.length}</span>
                      <span className="block text-[11.5px] text-ink-3">+{xp} XP</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13.5px] text-ink-3">Finished quizzes and practice rounds appear here so you can revisit your answers.</p>
        )}
      </Card>
    </div>
  );
}

function SessionReview({ id }: { id: string }) {
  const t = useTraining();
  const [, go] = useTrainingView();
  const s = t.data.sessions.find((x) => x.id === id);
  const xs = t.data.attempts.filter((a) => a.session_id === id).sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => go({ tab: "review" })} aria-label="Back to review" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 hover:text-ink">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <h2 className="text-[18px] font-semibold">{s ? MODE_LABEL[s.mode] : "Round"}</h2>
          {s && <p className="text-[13px] text-ink-3">{formatDate(s.day, "long")} · {xs.filter((a) => a.correct).length}/{xs.length} right</p>}
        </div>
      </div>
      {xs.length ? (
        <ul className="divide-y divide-line/70 overflow-hidden rounded-2xl border border-line bg-surface">
          {xs.map((a, i) => <AttemptRow key={a.id} a={a} index={i} />)}
        </ul>
      ) : (
        <EmptyState icon={History} title="This round has no saved answers" />
      )}
    </div>
  );
}
