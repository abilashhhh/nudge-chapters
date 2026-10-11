"use client";

import { Suspense } from "react";
import { CalendarScreen } from "@/components/v2/calendar";

export default function Page() {
  return (
    <Suspense>
      <CalendarScreen />
    </Suspense>
  );
}
