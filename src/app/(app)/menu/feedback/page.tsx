"use client";

import { Suspense } from "react";
import { FeedbackScreen } from "@/components/v2/feedback";

export default function Page() {
  return (
    <Suspense>
      <FeedbackScreen />
    </Suspense>
  );
}
