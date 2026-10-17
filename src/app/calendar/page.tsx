import type { Metadata } from "next";

import { BillCalendar } from "@/components/bill-calendar";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return <BillCalendar />;
}
