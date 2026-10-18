"use client";

import { Suspense } from "react";
import { TradingTrainingScreen } from "@/components/training/training-screen";

export default function Page() {
  return (
    <Suspense>
      <TradingTrainingScreen />
    </Suspense>
  );
}
