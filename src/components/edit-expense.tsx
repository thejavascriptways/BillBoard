"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ExpenseForm } from "@/components/expense-form";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, api } from "@/lib/api-client";
import type { ExpenseDTO, ExpenseInput } from "@/lib/types";
import { cn } from "cn";

export function EditExpense({ id }: { id: string }) {
  const router = useRouter();
  const [expense, setExpense] = useState<ExpenseDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ expense: ExpenseDTO }>(`/api/v1/expenses/${id}`)
      .then((data) => {
        if (!cancelled) setExpense(data.expense);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Could not load that expense.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/v1/expenses/${id}`, { method: "DELETE" });
      router.push("/expenses?deleted=1");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete that expense.");
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading expense…</p>;
  if (!expense) {
    return (
      <div role="alert" className="grid gap-3">
        <p>{error ?? "Expense not found."}</p>
        <Link href="/expenses" className={cn(buttonVariants({ variant: "outline" }), "h-11! w-fit")}>
          Back to expenses
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <Link href="/expenses" className="text-sm text-muted-foreground">
          Expenses
        </Link>
        <h1 className="mt-1 font-display text-4xl tracking-tight">Edit expense</h1>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ExpenseForm
        initial={expense}
        submitLabel="Save changes"
        onSubmit={async (input: ExpenseInput) => {
          await api(`/api/v1/expenses/${id}`, { method: "PATCH", body: JSON.stringify(input) });
          router.push("/expenses?updated=1");
        }}
      />
      <Button type="button" variant="destructive" className="mx-auto h-11! w-full max-w-lg" onClick={() => setConfirming(true)}>
        Delete expense
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this expense?</DialogTitle>
            <DialogDescription>This removes {expense.payee} for {expense.expenseDate}. It can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-none! bg-coral-ink! text-white!" onClick={remove} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
