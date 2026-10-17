import type { Metadata } from "next";

import { BillForm } from "@/components/bill-form";

export const metadata: Metadata = { title: "Edit bill" };

export default async function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BillForm billId={id} />;
}
