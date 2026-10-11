"use client";

import { Suspense } from "react";
import { HelpScreen } from "@/components/v2/help";

export default function Page() {
  return (
    <Suspense>
      <HelpScreen />
    </Suspense>
  );
}
