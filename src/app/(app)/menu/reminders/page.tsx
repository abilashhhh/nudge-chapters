"use client";

import { Suspense } from "react";
import { RemindersScreen } from "@/components/v2/life-pages";

export default function Page() {
  return (
    <Suspense>
      <RemindersScreen />
    </Suspense>
  );
}
