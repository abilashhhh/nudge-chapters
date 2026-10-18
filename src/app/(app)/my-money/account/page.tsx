"use client";

import { Suspense } from "react";
import { AccountDetailScreen } from "@/components/v2/detail-pages";

export default function Page() {
  return (
    <Suspense>
      <AccountDetailScreen />
    </Suspense>
  );
}
