"use client";

import { Suspense } from "react";
import { BudgetsScreen } from "@/components/v2/budgets";

export default function Page() {
  return (
    <Suspense>
      <BudgetsScreen />
    </Suspense>
  );
}
