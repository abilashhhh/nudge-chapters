"use client";

import { useEffect } from "react";

/**
 * iOS Safari (26) sometimes keeps the shorter viewport after the on-screen keyboard closes, so bars pinned to the
 * bottom (the tab bar, the + button) float where the keyboard's top edge was, with the page showing underneath.
 * Two fixes: after typing ends, nudge the scroll position so Safari re-measures; and if the visible area still
 * reaches below the layout viewport, push bottom-pinned bars down by the difference (--vv-gap).
 */
export function ViewportFix() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const gap = vv ? Math.round(vv.height + vv.offsetTop - window.innerHeight) : 0;
        // Only ever move bars down into a stale gap; never up (keyboard open, pinch zoom).
        root.style.setProperty("--vv-gap", `${gap > 1 ? gap : 0}px`);
      });
    };
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    const onFocusOut = (e: FocusEvent) => {
      if (!typing(e.target) || typing(e.relatedTarget)) return;
      // Let the keyboard finish closing, then make Safari re-measure the viewport.
      window.setTimeout(() => {
        window.scrollTo(window.scrollX, window.scrollY + 1);
        window.scrollTo(window.scrollX, window.scrollY - 1);
        measure();
      }, 120);
    };
    measure();
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("pageshow", measure);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("pageshow", measure);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);
  return null;
}
