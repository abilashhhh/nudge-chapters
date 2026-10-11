"use client";

import { Suspense } from "react";
import { SavingsScreen } from "@/components/v2/savings";

export default function Page() {
  return (
    <Suspense>
      <SavingsScreen />
    </Suspense>
  );
}
