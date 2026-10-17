"use client";

import { Suspense } from "react";
import { ContactsScreen } from "@/components/v2/contacts";

export default function Page() {
  return (
    <Suspense>
      <ContactsScreen />
    </Suspense>
  );
}
