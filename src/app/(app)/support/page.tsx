"use client";

import { Suspense } from "react";
import { OldAddress } from "@/components/shell/old-address";

export default function Page() {
  return (
    <Suspense>
      <OldAddress />
    </Suspense>
  );
}
