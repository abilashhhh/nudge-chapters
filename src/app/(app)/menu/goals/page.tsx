"use client";

import { Suspense } from "react";
import { GoalsScreen } from "@/components/v2/future";

export default function Page() {
  return (
    <Suspense>
      <GoalsScreen />
    </Suspense>
  );
}
