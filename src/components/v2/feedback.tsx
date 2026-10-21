"use client";

import { Bug, Lightbulb, MessageCircleHeart, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { KIND_LABEL, STATUS_LABEL, deleteFeedback, sendFeedback, useFeedback, type Feedback, type FeedbackKind, type FeedbackStatus } from "@/lib/feedback";
import { useStore } from "@/lib/store";
import { Button } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/form";
import { EmptyState } from "../ui/misc";
import { V2PageHeader } from "./ui";

const KINDS: { id: FeedbackKind; icon: typeof Bug; hint: string }[] = [
  { id: "feature", icon: Lightbulb, hint: "Something you'd like the app to do" },
  { id: "feedback", icon: MessageCircleHeart, hint: "What you like, what feels off" },
  { id: "bug", icon: Bug, hint: "Something that doesn't work" },
];
const AREAS = ["Home", "My Money", "To Pay", "Markets", "Daily", "Bank SMS", "Passwords", "Other"];

export const STATUS_CLS: Record<FeedbackStatus, string> = {
  new: "bg-surface-3 text-ink-2",
  planned: "bg-future-soft text-future-ink",
  in_progress: "bg-warn-soft text-warn",
  done: "bg-ok-soft text-ok",
  declined: "bg-danger-soft text-danger",
};

export function FeedbackScreen() {
  const { list, error, reload } = useFeedback();
  const cloud = useStore((s) => s.repo?.kind === "supabase");
  const [kind, setKind] = useState<FeedbackKind>("feature");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [area, setArea] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) return toast.error("Add a short title.");
    setBusy(true);
    try {
      await sendFeedback({ kind, title: title.trim(), body: body.trim() || null, area: area || null, rating: kind === "feedback" ? rating : null });
      setTitle("");
      setBody("");
      setRating(null);
      toast.success(kind === "feature" ? "Request sent — thank you!" : "Thanks — we read every message.");
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <V2PageHeader title="Feature requests & feedback" shortTitle="Feedback" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-3 text-[16px] font-semibold">Tell us</h2>
          <div className="mb-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kind">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                className={cn("flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors", kind === k.id ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong")}
              >
                <k.icon className={cn("h-5 w-5", kind === k.id ? "text-brand" : "text-ink-3")} aria-hidden />
                <span className="text-[13.5px] font-semibold leading-tight">{KIND_LABEL[k.id]}</span>
                <span className="hidden text-[11.5px] text-ink-3 sm:block">{k.hint}</span>
              </button>
            ))}
          </div>
          <div className="space-y-4">
            <Field label={kind === "feature" ? "What would you like?" : kind === "bug" ? "What went wrong?" : "In one line"}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={kind === "feature" ? "e.g. Split a bill with friends" : kind === "bug" ? "e.g. SMS from Kotak isn't picked up" : "e.g. Love the card designs"} />
            </Field>
            <Field label="Details" optional>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={4000} placeholder={kind === "bug" ? "What you did, what you expected, what happened instead" : "Anything that helps us understand"} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Part of the app" optional>
                <Select value={area} onChange={(e) => setArea(e.target.value)}>
                  <option value="">—</option>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </Select>
              </Field>
              {kind === "feedback" && (
                <Field label="How's the app?" optional>
                  <div className="flex h-11 items-center gap-1" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => setRating(rating === n ? null : n)}>
                        <Star className={cn("h-6 w-6", rating != null && n <= rating ? "fill-warn text-warn" : "text-ink-3")} />
                      </button>
                    ))}
                  </div>
                </Field>
              )}
            </div>
            <Button variant="primary" loading={busy} onClick={submit}>
              Send
            </Button>
            {!cloud && <p className="text-[12.5px] text-ink-3">You're not signed in, so this stays on this device. Sign in to send it to us.</p>}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-[16px] font-semibold">What you've sent</h2>
          {error && <p className="mb-3 text-[13.5px] text-danger">{error}</p>}
          {list == null ? (
            <p className="text-[13.5px] text-ink-3">Loading…</p>
          ) : list.length === 0 ? (
            <EmptyState icon={Lightbulb} title="Nothing yet" body="Your requests and their status (planned, being built, done) show here." />
          ) : (
            <ul className="flex flex-col gap-3">
              {list.map((f) => (
                <FeedbackCard key={f.id} f={f} onChanged={reload} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

export function FeedbackCard({ f, onChanged, admin }: { f: Feedback; onChanged: () => void; admin?: { email?: string | null; onReply: (f: Feedback) => void } }) {
  const K = KINDS.find((k) => k.id === f.kind)!;
  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[30%] bg-brand-soft text-brand">
          <K.icon className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug">{f.title}</p>
          <p className="text-[12px] text-ink-3">
            {[KIND_LABEL[f.kind], f.area, formatDate(f.created_at.slice(0, 10), "medium"), admin?.email].filter(Boolean).join(" · ")}
            {f.rating ? ` · ${"★".repeat(f.rating)}` : ""}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold", STATUS_CLS[f.status])}>{STATUS_LABEL[f.status]}</span>
      </div>
      {f.body && <p className="mt-2 whitespace-pre-wrap text-[14px] text-ink-2">{f.body}</p>}
      {f.admin_reply && (
        <div className="mt-3 rounded-xl bg-surface-2 p-3 text-[13.5px]">
          <p className="mb-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Reply from the team</p>
          <p className="whitespace-pre-wrap">{f.admin_reply}</p>
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        {admin ? (
          <Button size="sm" variant="primary" onClick={() => admin.onReply(f)}>
            Reply / set status
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            onClick={async () => {
              await deleteFeedback(f.id).catch((e) => toast.error(e.message));
              onChanged();
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </li>
  );
}

export const FEEDBACK_STATUSES = Object.keys(STATUS_LABEL) as FeedbackStatus[];
