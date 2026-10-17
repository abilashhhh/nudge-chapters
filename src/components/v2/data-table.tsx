"use client";

import { ChevronDown, LayoutGrid, List } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useStore } from "@/lib/store";

type Look = "list" | "tiles";

/** List or tiles for one list, saved with your settings (per list), so it stays as you left it. */
function useLook(key: string): [Look, (l: Look) => void] {
  const saved = useStore((s) => s.ds?.profile.preferences?.listViews?.[key]);
  const set = (l: Look) => {
    const prefs = useStore.getState().ds?.profile.preferences;
    void useStore.getState().updatePrefs({ listViews: { ...(prefs?.listViews ?? {}), [key]: l } }).catch(() => undefined);
  };
  return [saved === "tiles" ? "tiles" : "list", set];
}

function LookToggle({ value, onChange, label }: { value: Look; onChange: (l: Look) => void; label: string }) {
  return (
    <div className="inline-flex rounded-xl bg-surface-3 p-0.5" role="radiogroup" aria-label={`Show ${label} as`}>
      {(
        [
          ["list", "List", List],
          ["tiles", "Tiles", LayoutGrid],
        ] as const
      ).map(([id, text, Icon]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          aria-label={text}
          title={text}
          onClick={() => onChange(id)}
          className={cn("inline-flex h-7 w-8 items-center justify-center rounded-lg", value === id ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink")}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "right";
  /** Hide on phones (the value stays available in the row's details). */
  wide?: boolean;
  /** In the tiles look, the big number on each tile (default: the last right-aligned column). */
  main?: boolean;
  className?: string;
}

/**
 * The Version 2 table: only the few columns that matter are shown. Tap a row to open its details and actions
 * underneath it. Works one-handed at 360 px without sideways scrolling.
 */
export function DataTable<T>({
  rows,
  rowKey,
  columns,
  details,
  footer,
  label,
  rowClassName,
  initiallyOpen,
  noLookToggle,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  columns: Column<T>[];
  /** Shown under a row when it's tapped. */
  details?: (row: T) => ReactNode;
  /** Cells for a total row, one per column (null for empty). */
  footer?: (ReactNode | null)[];
  label: string;
  rowClassName?: (row: T) => string | undefined;
  initiallyOpen?: string | null;
  /** Lists where tiles make no sense (e.g. one-line totals). */
  noLookToggle?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(initiallyOpen ?? null);
  const [look, setLook] = useLook(label);
  const span = columns.length + (details ? 1 : 0);
  const hide = (c: Column<T>) => (c.wide ? "hidden sm:table-cell" : "");
  const toggle = !noLookToggle && rows.length > 0 && (
    <div className="mb-2 flex justify-end">
      <LookToggle value={look} onChange={setLook} label={label} />
    </div>
  );

  if (look === "tiles" && !noLookToggle) {
    const [title, ...rest] = columns;
    const main = rest.find((c) => c.main) ?? [...rest].reverse().find((c) => c.align === "right");
    const others = rest.filter((c) => c !== main);
    return (
      <div>
        {toggle}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label={label}>
          {rows.map((r) => {
            const k = rowKey(r);
            const isOpen = open === k;
            return (
              <li key={k} className={cn("rounded-2xl border border-line bg-surface", isOpen && "sm:col-span-2 lg:col-span-3", rowClassName?.(r))}>
                <button type="button" className="block w-full p-4 text-left" aria-expanded={details ? isOpen : undefined} onClick={details ? () => setOpen(isOpen ? null : k) : undefined}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-[14px]">{title.cell(r)}</span>
                    {details && <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-ink-3 transition-transform", isOpen && "rotate-180")} aria-hidden />}
                  </span>
                  {main && <span className="num mt-2 block text-[20px] font-semibold leading-tight">{main.cell(r)}</span>}
                  {others.length > 0 && (
                    <span className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
                      {others.map((c) => (
                        <span key={c.key} className="min-w-0">
                          <span className="block text-ink-3">{c.header}</span>
                          <span className="num block truncate text-ink">{c.cell(r)}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                {isOpen && details && <div className="px-3 pb-3">{details(r)}</div>}
              </li>
            );
          })}
        </ul>
        {footer && (
          <div className="num mt-2 flex flex-wrap justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-[14px] font-bold">
            {footer.map((f, i) => (f != null ? <span key={i}>{f}</span> : null))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
    {toggle}
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <table className="w-full table-auto text-[13.5px]" aria-label={label}>
        <thead className="text-left text-[12px] text-ink-3">
          <tr className="border-b border-line">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-3 py-2.5 font-medium", c.align === "right" && "text-right", hide(c))}>
                {c.header}
              </th>
            ))}
            {details && (
              <th scope="col" className="w-8 px-1">
                <span className="sr-only">Details</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="num">
          {rows.map((r) => {
            const k = rowKey(r);
            const isOpen = open === k;
            return (
              <Fragment key={k}>
                <tr
                  className={cn("border-t border-line align-middle", details && "cursor-pointer hover:bg-surface-2", isOpen && "bg-surface-2", rowClassName?.(r))}
                  onClick={details ? () => setOpen(isOpen ? null : k) : undefined}
                >
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("px-3 py-3", c.align === "right" && "text-right", hide(c), i === 0 && "min-w-0", c.className)}>
                      {i === 0 && details ? (
                        <button type="button" className="text-left" aria-expanded={isOpen} onClick={(e) => (e.stopPropagation(), setOpen(isOpen ? null : k))}>
                          {c.cell(r)}
                        </button>
                      ) : (
                        c.cell(r)
                      )}
                    </td>
                  ))}
                  {details && (
                    <td className="w-8 px-1 text-ink-3">
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
                    </td>
                  )}
                </tr>
                {isOpen && details && (
                  <tr className="bg-surface-2">
                    <td colSpan={span} className="px-3 pb-3 pt-0">
                      {details(r)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        {footer && (
          <tfoot className="num">
            <tr className="border-t-2 border-ink font-bold">
              {columns.map((c, i) => (
                <td key={c.key} className={cn("px-3 py-2.5", c.align === "right" && "text-right", hide(c))}>
                  {footer[i]}
                </td>
              ))}
              {details && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
    </div>
  );
}

/** Label → value pairs and action buttons for an opened row. */
export function Details({ items, actions, children }: { items?: [ReactNode, ReactNode][]; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3" onClick={(e) => e.stopPropagation()}>
      {items && items.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map(([k, v], i) => (
            <div key={i} className="min-w-0">
              <dt className="text-[11.5px] text-ink-3">{k}</dt>
              <dd className="num truncate text-[13.5px] font-medium text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {actions && <div className={cn("flex flex-wrap gap-2", (!!items?.length || !!children) && "mt-3")}>{actions}</div>}
    </div>
  );
}

/** Main text plus a muted second line, for the first column. */
export function Cell2({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <span className="block min-w-0">
      <span className="block font-medium text-ink">{main}</span>
      {sub && <span className="block text-[12px] font-normal text-ink-3">{sub}</span>}
    </span>
  );
}
