"use client";

import { Suspense } from "react";
import { NotesScreen } from "@/components/v2/life-pages";

export default function Page() {
  return (
    <Suspense>
      <NotesScreen />
    </Suspense>
  );
}
