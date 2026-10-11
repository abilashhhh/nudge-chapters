"use client";

import { Suspense } from "react";
import { ToPayScreen } from "@/components/v2/to-pay";

export default function Page() {
  return (
    <Suspense>
      <ToPayScreen />
    </Suspense>
  );
}
