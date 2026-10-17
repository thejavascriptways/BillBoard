import type { Metadata } from "next";

import { EditExpense } from "@/components/edit-expense";

export const metadata: Metadata = {
  title: "Edit expense",
};

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditExpense id={id} />;
}
