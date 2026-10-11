"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface Drag {
  from: number;
  over: number;
  startY: number;
  dy: number;
  /** Row boxes when the drag began (the list doesn't scroll while dragging). */
  rects: { top: number; height: number }[];
}

/**
 * A list you reorder by dragging the grip — with a finger or a mouse (pointer events, so no extra library).
 * The grip also works from the keyboard: focus it and press ↑ / ↓.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  label,
  className,
  disabled,
}: {
  items: T[];
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  /** Name for the grip, e.g. (item) => item.name */
  label: (item: T) => string;
  className?: string;
  disabled?: boolean;
}) {
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Keep the shown order while the save goes through, so the row doesn't jump back for a moment.
  const [pending, setPending] = useState<string[] | null>(null);
  const ids = items.map((i) => i.id).join("|");
  useEffect(() => setPending(null), [ids]);
  const shown = pending ? (pending.map((id) => items.find((i) => i.id === id)).filter(Boolean) as T[]) : items;

  const commit = (from: number, to: number) => {
    if (from === to || to < 0 || to >= shown.length) return;
    const next = shown.map((i) => i.id);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPending(next);
    onReorder(next);
  };

  const onDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rects = shown.map((_, k) => {
      const r = rows.current[k]?.getBoundingClientRect();
      return { top: r?.top ?? 0, height: r?.height ?? 0 };
    });
    setDrag({ from: i, over: i, startY: e.clientY, dy: 0, rects });
  };

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const r = drag.rects[drag.from];
    const centre = r.top + r.height / 2 + dy;
    let over = drag.from;
    drag.rects.forEach((b, j) => {
      const mid = b.top + b.height / 2;
      if (j > drag.from && centre > mid) over = Math.max(over, j);
      if (j < drag.from && centre < mid) over = Math.min(over, j);
    });
    setDrag({ ...drag, dy, over });
  };

  const onUp = () => {
    if (!drag) return;
    const { from, over } = drag;
    setDrag(null);
    commit(from, over);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      commit(i, i - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      commit(i, i + 1);
    }
  };

  /** How far a row moves to make room for the dragged one. */
  const shift = (j: number) => {
    if (!drag || j === drag.from) return 0;
    const h = drag.rects[drag.from].height;
    if (drag.from < drag.over && j > drag.from && j <= drag.over) return -h;
    if (drag.from > drag.over && j < drag.from && j >= drag.over) return h;
    return 0;
  };

  return (
    <ul className={cn("relative", className)} aria-label="Drag the handles to reorder">
      {shown.map((item, i) => {
        const dragging = drag?.from === i;
        const handle = (
          <button
            type="button"
            aria-label={`Reorder ${label(item)} — drag, or use the up and down arrow keys`}
            disabled={disabled}
            onPointerDown={(e) => onDown(e, i)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "flex h-10 w-7 shrink-0 touch-none select-none items-center justify-center rounded-lg text-ink-3 hover:bg-surface-3/70 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-future disabled:opacity-30",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        );
        return (
          <li
            key={item.id}
            ref={(el) => {
              rows.current[i] = el;
            }}
            style={{ transform: dragging ? `translateY(${drag!.dy}px)` : `translateY(${shift(i)}px)` }}
            className={cn(
              "relative bg-surface",
              drag && !dragging && "transition-transform duration-150 ease-out",
              dragging && "z-10 rounded-xl shadow-panel ring-1 ring-line-strong",
            )}
          >
            {renderItem(item, handle)}
          </li>
        );
      })}
    </ul>
  );
}
