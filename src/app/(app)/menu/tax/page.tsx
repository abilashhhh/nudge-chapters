"use client";

import { Suspense } from "react";
import { TaxScreen } from "@/components/v2/tax";

export default function Page() {
  return (
    <Suspense>
      <TaxScreen />
    </Suspense>
  );
}
