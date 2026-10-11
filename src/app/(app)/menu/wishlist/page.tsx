"use client";

import { Suspense } from "react";
import { WishlistScreen } from "@/components/v2/life-pages";

export default function Page() {
  return (
    <Suspense>
      <WishlistScreen />
    </Suspense>
  );
}
