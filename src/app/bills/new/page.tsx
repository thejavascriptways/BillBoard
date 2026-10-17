import type { Metadata } from "next";

import { BillForm } from "@/components/bill-form";

export const metadata: Metadata = { title: "Add bill" };

export default function NewBillPage() {
  return <BillForm />;
}
