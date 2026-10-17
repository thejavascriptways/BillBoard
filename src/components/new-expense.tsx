"use client";

import Link from "next/link";
import { useState } from "react";

import { ExpenseForm } from "@/components/expense-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/money";
import type { ExpenseDTO, ExpenseInput } from "@/lib/types";
import { cn } from "cn";

export function NewExpense() {
  const [saved, setSaved] = useState<ExpenseDTO | null>(null);
  const [formKey, setFormKey] = useState(0);

  if (saved) {
    return (
      <div className="mx-auto w-full max-w-lg rounded-3xl bg-card px-5 py-8 ring-1 ring-foreground/10">
        <p className="text-sm text-muted-foreground">Saved</p>
        <p className="mt-1 font-display text-5xl tabular-nums tracking-tight">{formatMoney(saved.amount)}</p>
        <p className="mt-2">
          {saved.payee} · {saved.propertyName}
        </p>
        <div className="mt-6 grid gap-2">
          <Button
            type="button"
            className="h-12!"
            onClick={() => {
              setSaved(null);
              setFormKey((key) => key + 1);
            }}
          >
            Add another
          </Button>
          <Link href="/expenses" className={cn(buttonVariants({ variant: "outline" }), "h-12!")}>
            View expenses
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Add expense</h1>
        <p className="mt-1 text-sm text-muted-foreground">One bill, one row. Date is a calendar day in Chicago time.</p>
      </div>
      <ExpenseForm
        key={formKey}
        submitLabel="Save expense"
        onSubmit={async (input: ExpenseInput) => {
          const result = await api<{ expense: ExpenseDTO }>("/api/v1/expenses", {
            method: "POST",
            body: JSON.stringify(input),
          });
          setSaved(result.expense);
        }}
      />
    </div>
  );
}
