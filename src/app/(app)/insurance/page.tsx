"use client";

import { Suspense } from "react";
import { InsuranceScreen } from "@/components/v2/insurance";

export default function Page() {
  return (
    <Suspense>
      <InsuranceScreen />
    </Suspense>
  );
}
