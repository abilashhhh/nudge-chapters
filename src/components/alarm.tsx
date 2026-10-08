"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { completionPatch } from "@/lib/engine/life";
import { useFinance } from "@/lib/finance";
import { enableAlarmPush } from "@/lib/push";
import { useStore } from "@/lib/store";
import type { LifeItem } from "@/lib/types";
import { BrandMark } from "./brand";

const keyOf = (i: LifeItem) => `${i.due_date} ${i.due_time}`;
const whenOf = (i: LifeItem) => new Date(`${i.due_date}T${i.due_time}:00`).getTime();

/** Items whose alarm time has passed (within the last 12 hours) and that you haven't turned off. */
function dueAlarms(items: LifeItem[], now: number): LifeItem[] {
  return items
    .filter((i) => i.status === "open" && (i.kind === "task" || i.kind === "checklist" || i.kind === "reminder") && i.due_date && i.due_time)
    .filter((i) => {
      const t = whenOf(i);
      return t <= now && now - t < 12 * 3600_000 && i.data?.alarm_ack !== keyOf(i);
    })
    .sort((a, b) => whenOf(a) - whenOf(b));
}

/**
 * Full-screen alarm for tasks, checklists and reminders with a time. Turn it off by sliding the
 * icon to the top. Rings while the app is open; when the app is in the background (but still
 * running) it also shows a system notification.
 */
export function AlarmWatcher() {
  const { ds } = useFinance();
  const patch = useStore((s) => s.patch);
  const [now, setNow] = useState(() => Date.now());
  const notified = useRef(new Set<string>());

  // Keep this phone registered for alarm pushes if permission was already given.
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") void enableAlarmPush().catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    const onVis = () => setNow(Date.now());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const due = dueAlarms(ds.life_items ?? [], now);
  const current = due[0];

  // System notification when the app isn't on screen.
  useEffect(() => {
    if (!current || notified.current.has(current.id + keyOf(current))) return;
    notified.current.add(current.id + keyOf(current));
    if (document.visibilityState === "visible" || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    void navigator.serviceWorker?.ready
      .then((reg) => reg.showNotification(current.title, { body: "Open Nudge Chapters to turn it off.", tag: `alarm-${current.id}`, requireInteraction: true } as NotificationOptions))
      .catch(() => new Notification(current.title));
  }, [current]);

  const ack = useCallback(
    async (item: LifeItem, done: boolean) => {
      const p = done ? completionPatch(item, item.due_date!) : {};
      await patch("life_items", item.id, { ...p, data: { ...(p.data ?? item.data), alarm_ack: keyOf(item) } });
    },
    [patch],
  );

  if (!current || typeof document === "undefined") return null;
  return createPortal(<AlarmScreen key={current.id + keyOf(current)} item={current} more={due.length - 1} onOff={() => ack(current, false)} onDone={() => ack(current, true)} />, document.body);
}

function AlarmScreen({ item, more, onOff, onDone }: { item: LifeItem; more: number; onOff: () => void; onDone: () => void }) {
  const [drag, setDrag] = useState(0); // 0..1 of the way to the top
  const start = useRef<number | null>(null);

  // Sound + vibration until turned off.
  useEffect(() => {
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
    } catch {
      ctx = null;
    }
    const beep = () => {
      navigator.vibrate?.([400, 200, 400]);
      if (!ctx) return;
      void ctx.resume().catch(() => undefined);
      for (const [i, f] of [880, 660, 880].entries()) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.25 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.22);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.25);
        o.stop(ctx.currentTime + i * 0.25 + 0.24);
      }
    };
    beep();
    const t = setInterval(beep, 2000);
    return () => {
      clearInterval(t);
      navigator.vibrate?.(0);
      void ctx?.close().catch(() => undefined);
    };
  }, []);

  // n-shaped track: up the left side, over the top, down the right side.
  const W = 220, H = 300, PAD = 40, R = (W - 2 * PAD) / 2;
  const D = `M ${PAD} ${H - PAD} L ${PAD} ${PAD + R} A ${R} ${R} 0 0 1 ${W - PAD} ${PAD + R} L ${W - PAD} ${H - PAD}`;
  const pathRef = useRef<SVGPathElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const samples = useRef<{ x: number; y: number }[]>([]);
  const [pt, setPt] = useState({ x: PAD, y: H - PAD });
  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    samples.current = Array.from({ length: 201 }, (_, i) => {
      const q = el.getPointAtLength((len * i) / 200);
      return { x: q.x, y: q.y };
    });
  }, [D]);
  const setProgress = (p: number) => {
    const sm = samples.current;
    const q = sm[Math.round(Math.max(0, Math.min(1, p)) * 200)] ?? { x: PAD, y: H - PAD };
    setDrag(p);
    setPt(q);
  };
  const onDown = (e: React.PointerEvent) => {
    start.current = 1;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (start.current == null || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // Follow the finger, but only along the track and only a little at a time (no jumping across the gap).
    const cur = Math.round(drag * 200);
    let best = cur, bestD = Infinity;
    for (let i = Math.max(0, cur - 25); i <= Math.min(200, cur + 25); i++) {
      const q = samples.current[i];
      if (!q) continue;
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bestD) (bestD = d), (best = i);
    }
    setProgress(best / 200);
  };
  const onUp = () => {
    start.current = null;
    if (drag > 0.95) onOff();
    else setProgress(0);
  };
  const time = item.due_time;
  const steps = item.data?.items ?? [];

  return (
    <div role="alertdialog" aria-modal="true" aria-label={`Alarm: ${item.title}`} className="fixed inset-0 z-[80] flex flex-col items-center bg-[#13241d] px-6 pb-10 pt-[12vh] text-[#e6ede9]" style={{ touchAction: "none" }}>
      <p className="display text-[64px] font-semibold leading-none tabular-nums">{time}</p>
      <p className="mt-3 text-[14px] uppercase tracking-wide text-[#9fb2a9]">{item.kind === "reminder" ? "Reminder" : item.kind === "checklist" ? "Checklist" : "Task"}</p>
      <h1 className="display mt-2 max-w-md text-center text-[28px] font-semibold leading-tight">{item.title}</h1>
      {steps.length > 0 && <p className="mt-2 text-[14px] text-[#b8c6bf]">{steps.filter((s) => !s.done).length} of {steps.length} items left</p>}
      {more > 0 && <p className="mt-1 text-[13px] text-[#9fb2a9]">+{more} more after this</p>}

      <div ref={boxRef} className="relative mt-auto" style={{ width: W, height: H }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="absolute inset-0">
          <path ref={pathRef} d={D} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={76} strokeLinecap="round" strokeLinejoin="round" />
          <path d={D} fill="none" stroke="#4cbf8e" strokeOpacity={0.35} strokeWidth={76} strokeLinecap="round" pathLength={1} strokeDasharray={`${drag} 1`} />
          <text x={W / 2} y={PAD + R + 6} textAnchor="middle" fill="#9fb2a9" fontSize="13">
            ↑ ⌒ ↓
          </text>
        </svg>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Slide up, over and down to turn off the alarm"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(drag * 100)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowRight") {
              const n = Math.min(1, drag + 0.1);
              if (n >= 1) onOff();
              else setProgress(n);
            }
          }}
          className="absolute h-[68px] w-[68px] cursor-grab touch-none rounded-full bg-[#eef1ec] p-2 shadow-lg active:cursor-grabbing"
          style={{ left: pt.x - 34, top: pt.y - 34, transition: start.current == null ? "left 200ms, top 200ms" : "none" }}
        >
          <BrandMark className="h-full w-full" />
        </div>
      </div>
      <p className="mt-4 text-[14px] text-[#b8c6bf]">Slide up, over and down to turn off</p>
      <button type="button" onClick={onDone} className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-[14px]">
        <Check className="h-4 w-4" aria-hidden /> Turn off and mark done
      </button>
    </div>
  );
}
