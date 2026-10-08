"use client";

import { useEffect } from "react";
import { Dashboard } from "@/components/dashboard";
import { useUI } from "@/lib/ui";

export default function DashboardPage() {
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("add") === "expense") useUI.getState().openTx({ type: "expense" });
  }, []);
  return <Dashboard />;
}
