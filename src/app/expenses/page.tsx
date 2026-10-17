import type { Metadata } from "next";
import { Suspense } from "react";

import { ExpenseList } from "@/components/expense-list";

export const metadata: Metadata = {
  title: "Expenses",
};

export default function ExpensesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading expenses…</p>}>
      <ExpenseList />
    </Suspense>
  );
}
