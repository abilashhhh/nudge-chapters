"use client";

import { Suspense } from "react";
import { PaperTradingScreen } from "@/components/sim/paper-screen";

export default function Page() {
  return (
    <Suspense>
      <PaperTradingScreen />
    </Suspense>
  );
}
