"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Tab state kept in the URL (?tab=…) so it survives refreshes and can be linked to. */
export function useTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab") as T | null;
  const tab = raw && tabs.includes(raw) ? raw : fallback;
  const set = useCallback(
    (t: T) => {
      const p = new URLSearchParams(params.toString());
      p.set("tab", t);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [params, router, pathname],
  );
  return [tab, set];
}
