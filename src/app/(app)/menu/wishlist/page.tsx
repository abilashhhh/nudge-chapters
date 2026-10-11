"use client";

import { Suspense } from "react";
import { DailyScreen } from "@/components/v2/daily";

// Old address: the app shell sends it on to /daily (the matching tab). Kept so bookmarks and alarms still work.
export default function Page() {
  return (
    <Suspense>
      <DailyScreen />
    </Suspense>
  );
}
