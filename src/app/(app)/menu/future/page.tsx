"use client";

import { Suspense } from "react";
import { FutureScreen } from "@/components/v2/future";

export default function Page() {
  return (
    <Suspense>
      <FutureScreen />
    </Suspense>
  );
}
