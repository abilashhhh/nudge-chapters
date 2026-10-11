"use client";

import { Suspense } from "react";
import { SettingsScreen } from "@/components/v2/settings";

export default function Page() {
  return (
    <Suspense>
      <SettingsScreen />
    </Suspense>
  );
}
