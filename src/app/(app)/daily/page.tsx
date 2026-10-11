"use client";

import { Suspense } from "react";
import { DailyScreen } from "@/components/v2/daily";

export default function Page() {
  return (
    <Suspense>
      <DailyScreen />
    </Suspense>
  );
}
