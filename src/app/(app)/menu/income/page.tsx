"use client";

import { Suspense } from "react";
import { IncomeScreen } from "@/components/v2/income";

export default function Page() {
  return (
    <Suspense>
      <IncomeScreen />
    </Suspense>
  );
}
