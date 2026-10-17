"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, CircleHelp, Clock, HelpCircle, Lightbulb, Lock, Minus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { hashSeed, shuffle } from "@/lib/training/candles";
import { grade, gradePrediction, type AnswerValue, type Grade, type PredictAnswer } from "@/lib/training/engine";
import { DIFFICULTY_LABEL, PREDICT_LABEL, QUESTION_TYPE_LABEL, type ChartSpec, type PredictChoice, type Question } from "@/lib/training/types";
import { Button } from "../ui/button";
import { CandleChart, MiniCandles } from "./candle-chart";
import { topicLabel } from "@/lib/training/content";

export interface Submitted {
  answer: AnswerValue;
  grade: Grade;
  timeMs: number;
  xp?: number;
}

const DIFF_CLS = { 1: "bg-ok-soft text-ok", 2: "bg-warn-soft text-warn", 3: "bg-danger-soft text-danger" } as const;

/** Type, difficulty and (once answered) topic. The topic waits: for pattern and chart questions it would give the answer away. */
export function QuestionMeta({ q, className, answered }: { q: Question; className?: string; answered?: boolean }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-[12px]", className)}>
      <span className="rounded-full bg-surface-3 px-2 py-0.5 font-medium text-ink-2">{QUESTION_TYPE_LABEL[q.type]}</span>
      <span className={cn("rounded-full px-2 py-0.5 font-medium", DIFF_CLS[q.difficulty])}>{DIFFICULTY_LABEL[q.difficulty]}</span>
      {answered && <span className="anim-fade truncate text-ink-3">{topicLabel(q.topic)}</span>}
    </div>
  );
}

/**
 * One question, any format. Nothing about the answer shows before you submit; after that the answer is locked and
 * the feedback explains the right answer and why yours was or wasn't it. Pass `review` to show a past answer.
 */
export function QuestionCard({
  q,
  onSubmit,
  review,
  timeLimit,
  footer,
}: {
  q: Question;
  onSubmit?: (s: Submitted) => Promise<{ xp: number } | void> | void;
  review?: Submitted;
  /** Seconds; when it runs out the current answer is submitted as it stands. */
  timeLimit?: number;
  footer?: ReactNode;
}) {
  const [answer, setAnswer] = useState<AnswerValue | null>(review?.answer ?? null);
  const [done, setDone] = useState<Submitted | null>(review ?? null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);
  const started = useRef(Date.now());
  const [left, setLeft] = useState(timeLimit ?? 0);

  const submit = async (value: AnswerValue | null) => {
    if (done || busy) return;
    const a = value ?? emptyAnswer(q);
    const g = grade(q, a);
    const s: Submitted = { answer: a, grade: g, timeMs: Date.now() - started.current };
    setBusy(true);
    setDone(s);
    try {
      const r = await onSubmit?.(s);
      if (r && typeof r.xp === "number") setDone({ ...s, xp: r.xp });
    } catch {
      /* the store already said why; the answer stays locked on screen */
    } finally {
      setBusy(false);
    }
  };

  // Challenge timer
  const answerRef = useRef(answer);
  answerRef.current = answer;
  useEffect(() => {
    if (!timeLimit || done) return;
    const t = setInterval(() => {
      const remaining = Math.max(0, timeLimit - Math.floor((Date.now() - started.current) / 1000));
      setLeft(remaining);
      if (remaining <= 0) void submit(answerRef.current);
    }, 250);
    return () => clearInterval(t);
  }, [timeLimit, done]);

  if (q.type === "predict") return <PredictCard q={q} onSubmit={submit} done={done} busy={busy} footer={footer} />;

  const ready = isAnswered(q, answer);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <QuestionMeta q={q} answered={!!done} />
        {timeLimit && !done ? (
          <span className={cn("num inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12.5px] font-semibold", left <= 10 ? "bg-danger-soft text-danger" : "bg-surface-3 text-ink-2")} aria-live="polite">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {left}s
          </span>
        ) : null}
      </div>
      <p className="text-[16.5px] font-semibold leading-snug text-ink">{q.prompt}</p>
      {q.chart && <CandleChart spec={q.chart} height={230} />}

      <AnswerInput q={q} value={answer} onChange={setAnswer} locked={!!done} result={done} />

      {!done && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="lg" disabled={!ready} loading={busy} onClick={() => submit(answer)}>
            Check answer
          </Button>
          {q.hint && (
            <Button variant="ghost" icon={<Lightbulb className="h-4 w-4" />} onClick={() => setHint((h) => !h)} aria-expanded={hint}>
              {hint ? "Hide hint" : "Hint"}
            </Button>
          )}
        </div>
      )}
      {hint && !done && q.hint && <p className="anim-fade rounded-xl bg-warn-soft px-3 py-2 text-[13.5px] text-ink">💡 {q.hint}</p>}
      {done && <Feedback q={q} s={done} />}
      {done && footer}
    </div>
  );
}

function emptyAnswer(q: Question): AnswerValue {
  if (q.type === "multi" || q.type === "errors" || q.type === "order") return [];
  if (q.type === "match") return q.pairs.map(() => -1);
  if (q.type === "calc") return Number.NaN;
  if (q.type === "truefalse") return "" as unknown as boolean;
  return "";
}

function isAnswered(q: Question, a: AnswerValue | null): boolean {
  if (a == null) return false;
  if (q.type === "multi" || q.type === "errors") return (a as string[]).length > 0;
  if (q.type === "order") return (a as string[]).length === q.items.length;
  if (q.type === "match") return (a as number[]).every((x) => x >= 0);
  if (q.type === "calc") return typeof a === "number" && Number.isFinite(a);
  if (q.type === "truefalse") return typeof a === "boolean";
  return a !== "";
}

// ---------------------------------------------------------------------------

function OptionButton({ selected, state, onClick, disabled, children, multi }: { selected: boolean; state?: "right" | "wrong" | "missed" | null; onClick: () => void; disabled?: boolean; children: ReactNode; multi?: boolean }) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[14.5px] transition-all",
        !state && (selected ? "border-future bg-future-soft/60 ring-2 ring-future/25" : "border-line bg-surface hover:-translate-y-px hover:border-line-strong"),
        state === "right" && "border-ok bg-ok-soft",
        state === "wrong" && "border-danger bg-danger-soft",
        state === "missed" && "border-ok border-dashed bg-surface",
        disabled && !state && "opacity-70",
      )}
    >
      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center border-2", multi ? "rounded-md" : "rounded-full", selected ? "border-future bg-future text-white" : "border-line-strong")} aria-hidden>
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className="flex-1">{children}</span>
      {state === "right" && <Check className="h-4 w-4 shrink-0 text-ok" aria-label="Correct" />}
      {state === "wrong" && <X className="h-4 w-4 shrink-0 text-danger" aria-label="Incorrect" />}
      {state === "missed" && <span className="shrink-0 text-[12px] font-medium text-ok">Also right</span>}
    </button>
  );
}

function AnswerInput({ q, value, onChange, locked, result }: { q: Question; value: AnswerValue | null; onChange: (v: AnswerValue) => void; locked: boolean; result: Submitted | null }) {
  switch (q.type) {
    case "single":
    case "pattern":
    case "chart":
    case "level": {
      const opts = q.type === "level" ? q.options : shuffle(q.options, hashSeed(q.id));
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Answers">
          {opts.map((o) => (
            <OptionButton key={o.id} selected={value === o.id} disabled={locked} onClick={() => onChange(o.id)} state={result ? (o.id === q.answer ? "right" : value === o.id ? "wrong" : null) : null}>
              {o.label}
            </OptionButton>
          ))}
        </div>
      );
    }
    case "multi":
    case "errors": {
      const picked = (value as string[] | null) ?? [];
      return (
        <div className="grid grid-cols-1 gap-2" role="group" aria-label="Choose all that apply">
          {q.options.map((o) => {
            const on = picked.includes(o.id);
            const right = q.answer.includes(o.id);
            return (
              <OptionButton key={o.id} multi selected={on} disabled={locked} onClick={() => onChange(on ? picked.filter((x) => x !== o.id) : [...picked, o.id])} state={result ? (on && right ? "right" : on ? "wrong" : right ? "missed" : null) : null}>
                {o.label}
              </OptionButton>
            );
          })}
        </div>
      );
    }
    case "truefalse":
      return (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="True or false">
          {[true, false].map((v) => (
            <OptionButton key={String(v)} selected={value === v} disabled={locked} onClick={() => onChange(v)} state={result ? (v === q.answer ? "right" : value === v ? "wrong" : null) : null}>
              {v ? "True" : "False"}
            </OptionButton>
          ))}
        </div>
      );
    case "calc":
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            disabled={locked}
            aria-label="Your answer"
            value={typeof value === "number" && Number.isFinite(value) ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))}
            className={cn("num h-12 w-44 rounded-xl border bg-surface px-3 text-[17px] font-semibold outline-none focus:border-future focus:ring-2 focus:ring-future/20", result ? (result.grade.correct ? "border-ok" : "border-danger") : "border-line")}
          />
          {q.unit && <span className="text-[14px] text-ink-2">{q.unit}</span>}
          {result && !result.grade.correct && <span className="num text-[14px] font-medium text-ok">Answer: {q.answer}</span>}
        </div>
      );
    case "match":
      return <MatchInput q={q} value={(value as number[] | null) ?? q.pairs.map(() => -1)} onChange={onChange} locked={locked} />;
    case "order":
      return <OrderInput q={q} value={(value as string[] | null) ?? []} onChange={onChange} locked={locked} />;
    default:
      return null;
  }
}

function MatchInput({ q, value, onChange, locked }: { q: Extract<Question, { type: "match" }>; value: number[]; onChange: (v: number[]) => void; locked: boolean }) {
  const order = useMemo(() => shuffle(q.pairs.map((_, i) => i), hashSeed(q.id)), [q]);
  return (
    <div className="flex flex-col gap-2">
      {q.pairs.map((p, i) => {
        const v = value[i];
        const state = locked ? (v === i ? "right" : "wrong") : null;
        return (
          <div key={i} className={cn("grid grid-cols-1 gap-2 rounded-xl border p-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-center", state === "right" ? "border-ok bg-ok-soft" : state === "wrong" ? "border-danger bg-danger-soft" : "border-line bg-surface")}>
            <span className="text-[14.5px] font-semibold">{p.left}</span>
            <select
              aria-label={`Match for ${p.left}`}
              disabled={locked}
              value={v}
              onChange={(e) => onChange(value.map((x, k) => (k === i ? Number(e.target.value) : x)))}
              className="h-11 w-full rounded-lg border border-line bg-surface px-2 text-[14px] outline-none focus:border-future"
            >
              <option value={-1}>Choose…</option>
              {order.map((j) => (
                <option key={j} value={j} disabled={value.includes(j) && v !== j}>
                  {q.pairs[j].right}
                </option>
              ))}
            </select>
            {state === "wrong" && <span className="text-[12.5px] text-ok sm:col-start-2">Correct: {p.right}</span>}
          </div>
        );
      })}
    </div>
  );
}

function OrderInput({ q, value, onChange, locked }: { q: Extract<Question, { type: "order" }>; value: string[]; onChange: (v: string[]) => void; locked: boolean }) {
  const pool = useMemo(() => {
    let s = shuffle(q.items, hashSeed(q.id));
    if (s.every((x, i) => x.id === q.answer[i])) s = [...s.slice(1), s[0]];
    return s;
  }, [q]);
  const all = q.items.map((i) => i.candle);
  const scale: [number, number] = [Math.min(...all.map((c) => c.l)), Math.max(...all.map((c) => c.h))];
  const placed = value.map((id) => q.items.find((i) => i.id === id)!).filter(Boolean);
  const letter = (id: string) => String.fromCharCode(65 + pool.findIndex((p) => p.id === id));
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="mb-1.5 text-[12.5px] text-ink-3">Tap the candles in the order they happen (left to right). Tap a placed candle to take it back.</p>
        <div className="flex flex-wrap gap-2">
          {pool.map((it) => {
            const used = value.includes(it.id);
            return (
              <button key={it.id} type="button" disabled={locked || used} onClick={() => onChange([...value, it.id])} aria-label={`Candle ${letter(it.id)}`} className={cn("flex flex-col items-center rounded-xl border bg-surface px-3 pb-1.5 pt-2 transition-all", used ? "opacity-30" : "border-line hover:-translate-y-0.5 hover:border-future")}>
                <MiniCandles candles={[it.candle]} width={36} height={84} scale={scale} />
                <span className="text-[12px] font-semibold text-ink-2">{letter(it.id)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-end gap-2 rounded-xl border border-dashed border-line-strong bg-surface-2 p-2.5" aria-label="Your order">
        {q.items.map((_, k) => {
          const it = placed[k];
          const right = locked && it && it.id === q.answer[k];
          return (
            <button key={k} type="button" disabled={locked || !it} onClick={() => onChange(value.filter((id) => id !== it?.id))} className={cn("flex h-[116px] w-16 flex-col items-center justify-end rounded-lg border bg-surface pb-1", !it && "border-dashed border-line", locked && (right ? "border-ok bg-ok-soft" : "border-danger bg-danger-soft"))} aria-label={it ? `Position ${k + 1}: candle ${letter(it.id)} (tap to remove)` : `Position ${k + 1}: empty`}>
              {it ? <MiniCandles candles={[it.candle]} width={36} height={84} scale={scale} /> : <span className="mb-8 text-[18px] text-ink-3">{k + 1}</span>}
              <span className="text-[11px] text-ink-3">{k + 1}</span>
            </button>
          );
        })}
        {placed.length === q.items.length && (
          <div className="ml-2 hidden sm:block">
            <p className="text-[11px] text-ink-3">Together</p>
            <MiniCandles candles={placed.map((p) => p.candle)} width={70} height={84} scale={scale} />
          </div>
        )}
      </div>
      {locked && (
        <div className="flex items-center gap-2 text-[13px] text-ok">
          Correct order: <MiniCandles candles={q.answer.map((id) => q.items.find((i) => i.id === id)!.candle)} width={60} height={60} scale={scale} />
        </div>
      )}
    </div>
  );
}

function Feedback({ q, s }: { q: Question; s: Submitted }) {
  const g = s.grade;
  const partial = !g.correct && g.score > 0;
  const picked = "options" in q && typeof s.answer === "string" ? q.options.find((o) => o.id === s.answer) : null;
  const wrongPicks = "options" in q && Array.isArray(s.answer) && (q.type === "multi" || q.type === "errors") ? q.options.filter((o) => (s.answer as string[]).includes(o.id) && !q.answer.includes(o.id) && o.why) : [];
  return (
    <div className={cn("anim-rise rounded-2xl border p-4", g.correct ? "border-ok/40 bg-ok-soft" : partial ? "border-warn/40 bg-warn-soft" : "border-danger/40 bg-danger-soft")} role="status">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full text-white", g.correct ? "bg-ok" : partial ? "bg-warn" : "bg-danger")}>
          {g.correct ? <Check className="h-4 w-4" strokeWidth={3} /> : partial ? <Minus className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}
        </span>
        <p className="text-[16px] font-semibold">{g.correct ? pick(["Correct!", "Nailed it.", "Spot on."], q.id) : partial ? `Partly right — ${Math.round(g.score * 100)}%` : "Not quite."}</p>
        <span className="ml-auto flex items-center gap-2 text-[12.5px] text-ink-2">
          {s.xp != null && <span className="num rounded-full bg-surface px-2 py-0.5 font-semibold text-ink">+{s.xp} XP</span>}
          <span className="num">{(s.timeMs / 1000).toFixed(0)}s</span>
        </span>
      </div>
      {picked && !g.correct && picked.why && (
        <p className="mt-2 text-[14px] text-ink">
          <span className="font-semibold">Why not “{picked.label}”: </span>
          {picked.why}
        </p>
      )}
      {wrongPicks.map((o) => (
        <p key={o.id} className="mt-2 text-[14px] text-ink">
          <span className="font-semibold">“{o.label}” </span>— {o.why}
        </p>
      ))}
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
        <span className="font-semibold text-ink">{g.correct ? "Why: " : "The right answer: "}</span>
        {q.explanation}
      </p>
      {s.xp === 0 && g.score > 0 && <p className="mt-1.5 text-[12px] text-ink-3">No XP this time — repeat answers earn less (half on the 2nd try, none after).</p>}
    </div>
  );
}

const pick = (xs: string[], seed: string) => xs[hashSeed(seed) % xs.length];

// ---------------------------------------------------------------------------
// Predict the next move
// ---------------------------------------------------------------------------

const CHOICES: { id: PredictChoice; icon: typeof ArrowUpRight; cls: string }[] = [
  { id: "bullish", icon: ArrowUpRight, cls: "text-candle-up" },
  { id: "bearish", icon: ArrowDownRight, cls: "text-candle-down" },
  { id: "sideways", icon: ArrowRight, cls: "text-ink-2" },
  { id: "uncertain", icon: CircleHelp, cls: "text-future-ink" },
];

function PredictCard({ q, onSubmit, done, busy, footer }: { q: Extract<Question, { type: "predict" }>; onSubmit: (a: AnswerValue) => void; done: Submitted | null; busy: boolean; footer?: ReactNode }) {
  const s = q.scenario;
  const prior = done?.answer as PredictAnswer | undefined;
  const [choice, setChoice] = useState<PredictChoice | null>(prior?.choice ?? null);
  const [signals, setSignals] = useState<string[]>(prior?.signals ?? []);
  const [note, setNote] = useState(prior?.note ?? "");
  const hidden = s.candles.length - s.visible;
  const [revealed, setRevealed] = useState(done ? hidden : 0);
  useEffect(() => {
    if (!done || revealed >= hidden) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), 420);
    return () => clearTimeout(t);
  }, [done, revealed, hidden]);
  const spec: ChartSpec = { candles: s.candles, source: s.source, timeframe: s.timeframe, hideFrom: s.visible, annotations: s.annotations, afterReveal: s.afterReveal, overlays: s.overlays, panel: s.panel };
  const shuffledSignals = useMemo(() => shuffle(s.signals, hashSeed(q.id)), [s.signals, q.id]);
  const finished = done && revealed >= hidden;
  const p = done ? gradePrediction(s, done.answer as PredictAnswer) : null;

  return (
    <div className="flex flex-col gap-4">
      <QuestionMeta q={q} answered={!!done} />
      <p className="text-[16px] font-semibold leading-snug">{s.setup}</p>
      {s.higher && (
        <div className="rounded-xl border border-line bg-surface-2 p-2">
          <p className="mb-1 text-[12px] font-medium text-ink-3">{s.higher.title ?? "Higher timeframe"}</p>
          <CandleChart spec={s.higher} height={130} compact />
        </div>
      )}
      <CandleChart spec={spec} height={270} revealed={revealed} />
      {!done && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Lock className="h-3.5 w-3.5" aria-hidden /> The next {hidden} candles are hidden. Your answer locks when you submit; then they're revealed. We judge the move over the next {s.horizon} candles.
        </p>
      )}

      <fieldset disabled={!!done} className="flex flex-col gap-2">
        <legend className="mb-2 text-[14px] font-semibold">1. What happens next?</legend>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label="Your prediction">
          {CHOICES.map((c) => {
            const on = choice === c.id;
            const accepted = p?.accepted.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChoice(c.id)}
                className={cn(
                  "flex min-h-[72px] flex-col items-start justify-between gap-1 rounded-xl border p-3 text-left transition-all",
                  !done && (on ? "border-future bg-future-soft/60 ring-2 ring-future/25" : "border-line bg-surface hover:-translate-y-px hover:border-line-strong"),
                  done && accepted && "border-ok bg-ok-soft",
                  done && on && !accepted && "border-danger bg-danger-soft",
                  done && !on && !accepted && "opacity-60",
                )}
              >
                <c.icon className={cn("h-5 w-5", c.cls)} aria-hidden />
                <span className="text-[13.5px] font-semibold leading-tight">{PREDICT_LABEL[c.id]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={!!done} className="flex flex-col gap-2">
        <legend className="mb-1 text-[14px] font-semibold">
          2. Why? <span className="font-normal text-ink-3">Tick what you see (optional — but reasons earn up to 30% of the score)</span>
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {shuffledSignals.map((x) => {
            const on = signals.includes(x.id);
            const state = done ? (on && x.valid ? "right" : on ? "wrong" : x.valid ? "missed" : null) : null;
            return (
              <OptionButton key={x.id} multi selected={on} state={state} onClick={() => setSignals(on ? signals.filter((y) => y !== x.id) : [...signals, x.id])}>
                <span className="block text-[14px]">{x.label}</span>
                {done && (on || x.valid) && <span className="mt-0.5 block text-[12.5px] text-ink-2">{x.why}</span>}
              </OptionButton>
            );
          })}
        </div>
        {!done ? (
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={2} placeholder="Anything else you noticed? (optional, saved with your answer)" className="mt-1 w-full rounded-xl border border-line bg-surface px-3 py-2 text-[14px] outline-none focus:border-future" aria-label="Your notes" />
        ) : note ? (
          <p className="text-[13px] text-ink-2">Your note: “{note}”</p>
        ) : null}
      </fieldset>

      {!done && (
        <Button variant="primary" size="lg" disabled={!choice} loading={busy} icon={<Lock className="h-4 w-4" />} onClick={() => onSubmit({ choice: choice!, signals, note: note.trim() || undefined })} className="self-start">
          Lock in & reveal
        </Button>
      )}

      {done && !finished && <p className="anim-fade text-[14px] font-medium text-ink-2">Revealing candles… {revealed}/{hidden}</p>}
      {done && finished && p && (
        <div className={cn("anim-rise rounded-2xl border p-4", p.directionCorrect ? "border-ok/40 bg-ok-soft" : "border-danger/40 bg-danger-soft")} role="status">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-full text-white", p.directionCorrect ? "bg-ok" : "bg-danger")}>{p.directionCorrect ? <Check className="h-4 w-4" strokeWidth={3} /> : <X className="h-4 w-4" strokeWidth={3} />}</span>
            <p className="text-[16px] font-semibold">What happened: {PREDICT_LABEL[p.move.direction]}</p>
            <span className="ml-auto flex items-center gap-2 text-[12.5px]">
              {done.xp != null && <span className="num rounded-full bg-surface px-2 py-0.5 font-semibold">+{done.xp} XP</span>}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <Score label="You said" value={PREDICT_LABEL[(done.answer as PredictAnswer).choice]} />
            <Score label="Direction" value={p.directionCorrect ? "Right ✓" : "Wrong ✗"} tone={p.directionCorrect ? "ok" : "danger"} />
            <Score label="Reasoning" value={`${Math.round(p.reasoningScore * 100)}%`} tone={p.reasoningScore >= 0.67 ? "ok" : p.reasoningScore > 0 ? "warn" : "danger"} />
          </div>
          <p className="num mt-3 text-[13px] text-ink-2">
            The close {p.move.horizon} candles later moved {p.move.change >= 0 ? "+" : ""}
            {p.move.change.toFixed(2)} ({p.move.changePct >= 0 ? "+" : ""}
            {p.move.changePct.toFixed(2)}%) = {p.move.changeAtr >= 0 ? "+" : ""}
            {p.move.changeAtr} ATR. Rule: ≥ +{p.move.threshold} ATR bullish, ≤ −{p.move.threshold} ATR bearish, otherwise sideways.
            {s.ambiguous && " Signals competed here, so “Uncertain” also counted as right."}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed">{s.outcomeNote}</p>
          <p className="mt-2 flex items-start gap-1.5 text-[12px] text-ink-3">
            <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Simulated practice data. Markets are probabilistic — the same setup can play out differently, and no pattern guarantees a move.
          </p>
        </div>
      )}
      {done && finished && footer}
    </div>
  );
}

function Score({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <p className={cn("text-[14.5px] font-semibold", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}

