"use client";

import { ArrowLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { v2Crumbs } from "@/lib/v2/routes";
import { Button } from "./button";

// Page scroll is locked while any sheet is open. A shared counter (instead of each sheet saving
// and restoring the style) keeps stacked sheets that close together, in any order, from leaving
// the page stuck unscrollable.
let scrollLocks = 0;
let savedOverflow = "";
function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}
// Open sheets, newest last: Escape and focus trapping belong to the top one only.
const openStack: symbol[] = [];

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = savedOverflow;
}

/**
 * Forms and details open as a full-width page over the current screen (beside the sidebar on desktop), with a back
 * button and the breadcrumb of where you are; the phone's / browser's Back closes it too. Small confirmations
 * (size "sm") stay a dialog. Escape closes either; focus moves in on open and returns on close.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // Latest onClose without re-running the open/close effect (which would steal focus mid-typing).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    lockScroll();
    const token = Symbol("sheet");
    openStack.push(token);
    const isTop = () => openStack[openStack.length - 1] === token;
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button:not([data-close])");
      el?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    // A page gets its own history entry, so Back closes it instead of leaving the screen. The router's own state is
    // kept on the entry so Next.js treats going back to it as staying on the same page.
    const asPage = sizeRef.current !== "sm";
    const mark = Math.random().toString(36).slice(2);
    let pushed = false;
    const onPop = () => {
      if (pushed && (window.history.state as { nudgeSheet?: string } | null)?.nudgeSheet !== mark) {
        pushed = false;
        onCloseRef.current();
      }
    };
    if (asPage) {
      try {
        window.history.pushState({ ...(window.history.state ?? {}), nudgeSheet: mark }, "");
        pushed = true;
        window.addEventListener("popstate", onPop);
      } catch {
        /* history unavailable: Back just leaves the page */
      }
    }
    return () => {
      clearTimeout(t);
      window.removeEventListener("popstate", onPop);
      if (pushed && (window.history.state as { nudgeSheet?: string } | null)?.nudgeSheet === mark) window.history.back();
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      openStack.splice(openStack.indexOf(token), 1);
      prev?.focus?.();
    };
  }, [open]);

  if (!mounted || !open) return null;
  if (size !== "sm") {
    const found = v2Crumbs(window.location.pathname, window.location.search);
    const crumbs = found.length ? found : [{ label: "Home", href: "/" }];
    const inner = size === "xl" ? "max-w-5xl" : "max-w-3xl";
    return createPortal(
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className="animate-fade fixed inset-0 z-50 flex flex-col bg-paper lg:left-60"
      >
        <header className="border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className={cn("mx-auto flex w-full items-center gap-3 px-4 py-3 sm:px-6", inner)}>
            <button
              type="button"
              data-close
              onClick={onClose}
              aria-label="Back"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-2 hover:text-ink"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 overflow-hidden text-[12px] text-ink-3">
                {crumbs.map((c) => (
                  <span key={c.href + c.label} className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={onClose} className="hover:text-ink">
                      {c.label}
                    </button>
                    <ChevronRight className="h-3 w-3" aria-hidden />
                  </span>
                ))}
                <span className="truncate text-ink-2">{title}</span>
              </nav>
              <h2 className="display truncate text-[19px] font-semibold leading-tight text-ink sm:text-[22px]">{title}</h2>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          <div className={cn("mx-auto w-full px-4 py-5 sm:px-6", inner)}>
            {description && <p className="mb-4 text-[14px] text-ink-2">{description}</p>}
            {children}
          </div>
        </div>
        {footer && (
          <div className="border-t border-line bg-surface-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:pb-4">
            <div className={cn("mx-auto w-full px-4 sm:px-6", inner)}>{footer}</div>
          </div>
        )}
      </div>,
      document.body,
    );
  }
  const width = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="animate-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cn(
          "animate-sheet relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface shadow-panel sm:rounded-2xl",
          width,
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" aria-hidden />
        <div className="flex items-start gap-3 px-5 pb-3 pt-4 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="display text-[20px] font-semibold leading-tight text-ink">{title}</h2>
            {description && <p className="mt-1 text-[13.5px] text-ink-2">{description}</p>}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-3 hover:bg-surface-3 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {/* Own bottom padding (not .pb-safe, which would zero it on desktop) so buttons never sit on the edge. */}
        {footer && <div className="border-t border-line bg-surface-2 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="text-[14.5px] text-ink-2">{body}</div>
    </Sheet>
  );
}
