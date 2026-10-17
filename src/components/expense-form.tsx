"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ChoiceSelect } from "@/components/choice-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api-client";
import { todayInChicago } from "@/lib/dates";
import { archivedChoiceLabel } from "@/lib/labels";
import type { CategoryDTO, ExpenseDTO, ExpenseInput, PaymentMethodDTO, PropertyDTO } from "@/lib/types";

type FieldErrors = Record<string, string | undefined>;

export function ExpenseForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<ExpenseDTO>;
  submitLabel: string;
  onSubmit: (input: ExpenseInput) => Promise<void>;
}) {
  const [properties, setProperties] = useState<PropertyDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodDTO[]>([]);
  const [expenseDate, setExpenseDate] = useState(initial?.expenseDate ?? todayInChicago());
  const [propertyId, setPropertyId] = useState(initial?.propertyId ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [payee, setPayee] = useState(initial?.payee ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState(initial?.paymentMethodId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<{ properties: PropertyDTO[] }>("/api/v1/properties"),
      api<{ categories: CategoryDTO[] }>("/api/v1/categories"),
      api<{ paymentMethods: PaymentMethodDTO[] }>("/api/v1/payment-methods"),
    ])
      .then(([propertyData, categoryData, methodData]) => {
        if (cancelled) return;
        setProperties(propertyData.properties);
        setCategories(categoryData.categories);
        setPaymentMethods(methodData.paymentMethods);
        setPropertyId((current) => current || propertyData.properties.find((property) => !property.archived)?.id || "");
        setCategoryId((current) => current || categoryData.categories.find((category) => !category.archived)?.id || "");
        setPaymentMethodId((current) => current || methodData.paymentMethods.find((method) => !method.archived)?.id || "");
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load the form.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    if (!expenseDate) nextErrors.expenseDate = "Enter a date.";
    if (!propertyId) nextErrors.propertyId = "Choose a property.";
    if (!categoryId) nextErrors.categoryId = "Choose a category.";
    if (!payee.trim()) nextErrors.payee = "Enter a payee.";
    if (!amount.trim()) nextErrors.amount = "Enter an amount.";
    if (!paymentMethodId) nextErrors.paymentMethodId = "Choose a payment method.";
    setFieldErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;
    setPending(true);
    try {
      await onSubmit({
        expenseDate,
        propertyId,
        categoryId,
        payee: payee.trim(),
        amount: amount.trim(),
        paymentMethodId,
        notes: notes.trim() || null,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors ?? {});
        setFormError(error.message);
      } else {
        setFormError("Could not save that expense.");
      }
      setPending(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading the form…</p>;
  }
  if (loadError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {loadError}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto grid w-full max-w-lg gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="amount">Amount</Label>
        <div className="flex items-center gap-2 rounded-xl bg-card px-3 ring-1 ring-foreground/10 focus-within:ring-2 focus-within:ring-ring">
          <span className="font-display text-2xl text-muted-foreground">$</span>
          <Input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={Boolean(fieldErrors.amount)}
            className="h-16! border-0 px-0 text-3xl tabular-nums shadow-none focus-visible:ring-0"
          />
        </div>
        {fieldErrors.amount ? <FieldError message={fieldErrors.amount} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="expense-date">Date</Label>
        <Input
          id="expense-date"
          type="date"
          value={expenseDate}
          onChange={(event) => setExpenseDate(event.target.value)}
          aria-invalid={Boolean(fieldErrors.expenseDate)}
          className="h-12! text-base"
        />
        {fieldErrors.expenseDate ? <FieldError message={fieldErrors.expenseDate} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="property">Property</Label>
        {properties.some((property) => !property.archived) || propertyId ? (
          <ChoiceSelect
            id="property"
            value={propertyId}
            onChange={setPropertyId}
            options={properties
              .filter((property) => !property.archived || property.id === propertyId)
              .map((property) => ({ value: property.id, label: archivedChoiceLabel(property.name, property.archived) }))}
            placeholder="Property"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/settings" className="font-medium text-primary">
              Add a property
            </Link>{" "}
            before logging this expense.
          </p>
        )}
        {fieldErrors.propertyId ? <FieldError message={fieldErrors.propertyId} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="category">Category</Label>
        {categories.some((category) => !category.archived) || categoryId ? (
          <ChoiceSelect
            id="category"
            value={categoryId}
            onChange={setCategoryId}
            options={categories
              .filter((category) => !category.archived || category.id === categoryId)
              .map((category) => ({ value: category.id, label: archivedChoiceLabel(category.name, category.archived) }))}
            placeholder="Category"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/settings" className="font-medium text-primary">
              Add a category
            </Link>{" "}
            before logging this expense.
          </p>
        )}
        {fieldErrors.categoryId ? <FieldError message={fieldErrors.categoryId} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="payee">Payee</Label>
        <Input
          id="payee"
          value={payee}
          onChange={(event) => setPayee(event.target.value)}
          placeholder="Oncor, HOA, Home Depot"
          autoComplete="organization"
          aria-invalid={Boolean(fieldErrors.payee)}
          className="h-12! text-base"
        />
        {fieldErrors.payee ? <FieldError message={fieldErrors.payee} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="payment-method">Payment method</Label>
        {paymentMethods.some((method) => !method.archived) || paymentMethodId ? (
          <ChoiceSelect
            id="payment-method"
            value={paymentMethodId}
            onChange={setPaymentMethodId}
            options={paymentMethods
              .filter((method) => !method.archived || method.id === paymentMethodId)
              .map((method) => ({ value: method.id, label: archivedChoiceLabel(method.label, method.archived) }))}
            placeholder="Payment method"
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link href="/settings" className="font-medium text-primary">
              Add a payment method
            </Link>{" "}
            before logging this expense.
          </p>
        )}
        <p className="text-xs text-muted-foreground">Nicknames and last 4 are managed in Settings.</p>
        {fieldErrors.paymentMethodId ? <FieldError message={fieldErrors.paymentMethodId} /> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes ?? ""}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional"
          className="min-h-24 text-base"
        />
        {fieldErrors.notes ? <FieldError message={fieldErrors.notes} /> : null}
      </div>

      {formError && !Object.keys(fieldErrors).length ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="h-12! text-base" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
