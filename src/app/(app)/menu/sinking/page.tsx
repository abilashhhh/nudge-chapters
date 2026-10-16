"use client";

import { Suspense } from "react";
import { SinkingScreen } from "@/components/v2/sinking";

export default function Page() {
  return (
    <Suspense>
      <SinkingScreen />
    </Suspense>
  );
}
