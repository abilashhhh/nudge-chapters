"use client";

import { Suspense } from "react";
import { CardDetailScreen } from "@/components/v2/detail-pages";

export default function Page() {
  return (
    <Suspense>
      <CardDetailScreen />
    </Suspense>
  );
}
