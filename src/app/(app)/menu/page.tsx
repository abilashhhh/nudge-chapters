"use client";

import { Suspense } from "react";
import { MenuScreen } from "@/components/v2/menu";

export default function Page() {
  return (
    <Suspense>
      <MenuScreen />
    </Suspense>
  );
}
