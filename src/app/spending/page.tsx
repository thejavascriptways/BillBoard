import type { Metadata } from "next";

import { DashboardView } from "@/components/dashboard-view";

export const metadata: Metadata = { title: "Spending" };

export default function SpendingPage() {
  return <DashboardView />;
}
