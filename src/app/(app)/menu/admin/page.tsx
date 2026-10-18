"use client";

import { Suspense } from "react";
import { AdminScreen } from "@/components/v2/admin";

export default function Page() {
  return (
    <Suspense>
      <AdminScreen />
    </Suspense>
  );
}
