"use client";

import { Suspense } from "react";
import { HoldingDetailScreen } from "@/components/v2/detail-pages";

export default function Page() {
  return (
    <Suspense>
      <HoldingDetailScreen />
    </Suspense>
  );
}
