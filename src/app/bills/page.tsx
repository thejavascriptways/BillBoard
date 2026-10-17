import type { Metadata } from "next";

import { BillList } from "@/components/bill-list";

export const metadata: Metadata = { title: "Bills" };

export default function BillsPage() {
  return <BillList />;
}
