"use client";

import { Suspense } from "react";
import { TradingScreen } from "@/components/v2/trading";

export default function Page() {
  return (
    <Suspense>
      <TradingScreen />
    </Suspense>
  );
}
