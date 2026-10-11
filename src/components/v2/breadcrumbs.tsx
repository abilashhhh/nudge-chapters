"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment } from "react";
import { v2Crumbs } from "@/lib/v2/routes";

/** "‹ Home › To Pay › Credit cards" — where you are, and one tap back to any level above it. */
export function Breadcrumbs() {
  const pathname = usePathname() ?? "/";
  const params = useSearchParams();
  const crumbs = v2Crumbs(pathname, params?.toString() ?? "");
  if (crumbs.length < 2) return null;
  const parent = crumbs[crumbs.length - 2];
  // Daily is in the bottom bar and its tabs say where you are, so phones skip the trail there.
  const phoneHidden = pathname.replace(/\/+$/, "") === "/daily";
  return (
    <nav aria-label="Breadcrumb" className={`no-print -mt-1 mb-3 min-w-0 items-center gap-1 text-[13px] ${phoneHidden ? "hidden lg:flex" : "flex"}`}>
      <Link
        href={parent.href}
        aria-label={`Back to ${parent.label}`}
        className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Link>
      <ol className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto whitespace-nowrap">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={c.href}>
              <li className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden />}
                {last ? (
                  <span aria-current="page" className="font-medium text-ink">
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} className="text-ink-2 hover:text-ink hover:underline">
                    {c.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
