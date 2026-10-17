import type { Metadata } from "next";

import { MonthChecklist } from "@/components/month-checklist";

export const metadata: Metadata = { title: "This month" };

export default function HomePage() {
  return <MonthChecklist />;
}
