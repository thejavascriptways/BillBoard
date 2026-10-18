import { Suspense } from "react";
import type { Metadata } from "next";

import { UtilitiesBoard } from "@/components/utilities-board";

export const metadata: Metadata = { title: "Utilities" };

export default function UtilitiesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading utilities…</p>}>
      <UtilitiesBoard />
    </Suspense>
  );
}
