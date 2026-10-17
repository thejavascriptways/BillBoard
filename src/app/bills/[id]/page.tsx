import type { Metadata } from "next";

import { BillDetail } from "@/components/bill-detail";

export const metadata: Metadata = { title: "Bill" };

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BillDetail billId={id} />;
}
