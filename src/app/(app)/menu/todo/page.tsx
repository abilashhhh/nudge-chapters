"use client";

import { Suspense } from "react";
import { TodoScreen } from "@/components/v2/life-pages";

export default function Page() {
  return (
    <Suspense>
      <TodoScreen />
    </Suspense>
  );
}
