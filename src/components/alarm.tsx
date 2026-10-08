"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { completionPatch } from "@/lib/engine/life";
import { useFinance } from "@/lib/finance";
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
  const track = useRef<HTMLDivElement>(null);
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

  const travel = () => (track.current ? track.current.clientHeight - 72 : 1);
  const onDown = (e: React.PointerEvent) => {
    start.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (start.current == null) return;
    setDrag(Math.max(0, Math.min(1, (start.current - e.clientY) / travel())));
  };
  const onUp = () => {
    start.current = null;
    if (drag > 0.85) onOff();
    else setDrag(0);
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

      <div ref={track} className="relative mt-auto h-[42vh] max-h-80 w-20 rounded-full bg-white/10">
        <div aria-hidden className="absolute inset-x-0 top-3 text-center text-[12px] text-[#9fb2a9]" style={{ opacity: 1 - drag }}>
          ↑
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Slide up to turn off the alarm"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(drag * 100)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "Enter") onOff();
          }}
          className="absolute left-1 h-[72px] w-[72px] cursor-grab touch-none rounded-full bg-[#eef1ec] p-2 shadow-lg active:cursor-grabbing"
          style={{ bottom: 4 + drag * travel(), transition: start.current == null ? "bottom 200ms" : "none" }}
        >
          <BrandMark className="h-full w-full" />
        </div>
      </div>
      <p className="mt-4 text-[14px] text-[#b8c6bf]">Slide up to turn off</p>
      <button type="button" onClick={onDone} className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-[14px]">
        <Check className="h-4 w-4" aria-hidden /> Turn off and mark done
      </button>
    </div>
  );
}
