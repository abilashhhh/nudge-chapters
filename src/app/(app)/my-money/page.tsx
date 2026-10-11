"use client";

import { Suspense } from "react";
import { MyMoneyScreen } from "@/components/v2/my-money";

export default function Page() {
  return (
    <Suspense>
      <MyMoneyScreen />
    </Suspense>
  );
}
