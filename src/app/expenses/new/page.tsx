import type { Metadata } from "next";

import { NewExpense } from "@/components/new-expense";

export const metadata: Metadata = {
  title: "Add expense",
};

export default function NewExpensePage() {
  return <NewExpense />;
}
