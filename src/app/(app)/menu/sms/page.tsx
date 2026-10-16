"use client";

import { Suspense } from "react";
import { SmsScreen } from "@/components/v2/sms";

export default function Page() {
  return (
    <Suspense>
      <SmsScreen />
    </Suspense>
  );
}
