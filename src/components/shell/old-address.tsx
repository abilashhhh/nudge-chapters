"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { toV2Href } from "@/lib/v2/routes";

/** An address from the old version of the app: go to where that screen lives now (bookmarks and alarms keep working). */
export function OldAddress() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  useEffect(() => {
    router.replace(toV2Href(pathname, typeof window !== "undefined" ? window.location.search : "") ?? "/");
  }, [pathname, router]);
  return null;
}
