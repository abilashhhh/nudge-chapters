"use client";

import { Suspense } from "react";
import { VaultScreen } from "@/components/v2/vault";

export default function Page() {
  return (
    <Suspense>
      <VaultScreen />
    </Suspense>
  );
}
