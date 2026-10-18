"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChoiceSelect } from "@/components/choice-select";
import { ApiError, api } from "@/lib/api-client";
import { formatDisplayDate, lastDayIso, monthRange, todayInChicago } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { MasterRow } from "@/lib/masters";
import type { ExpenseDTO, ExpenseListDTO } from "@/lib/types";
import { cn } from "cn";

export function ExpenseList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [properties, setProperties] = useState<MasterRow[]>([]);
  const [categories, setCategories] = useState<MasterRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(searchParams.get("propertyId") || searchParams.get("categoryId") || searchParams.get("from") || searchParams.get("to")),
  );

  const propertyId = searchParams.get("propertyId") ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const notice = searchParams.get("deleted") === "1" ? "Expense deleted." : searchParams.get("updated") === "1" ? "Expense updated." : null;

  function replaceParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("deleted");
    params.delete("updated");
    for (const [key, value] of Object.entries(updates)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if ((searchParams.get("q") ?? "") === query) return;
      replaceParams({ q: query || null });
    }, 250);
    return () => window.clearTimeout(handle);
    // replaceParams changes with the URL; the debounce only cares about the typed query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("deleted");
    params.delete("updated");
    Promise.all([
      api<ExpenseListDTO>(`/api/v1/expenses?${params.toString()}`),
      api<{ rows: MasterRow[] }>("/api/v1/masters?table=homes"),
      api<{ rows: MasterRow[] }>("/api/v1/masters?table=categories"),
    ])
      .then(([list, propertyData, categoryData]) => {
        if (cancelled) return;
        setExpenses(list.expenses);
        setTotal(list.total);
        setNextCursor(list.nextCursor);
        setProperties(propertyData.rows);
        setCategories(categoryData.rows);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Could not load expenses.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams(searchParams.toString());
      params.set("cursor", nextCursor);
      const list = await api<ExpenseListDTO>(`/api/v1/expenses?${params.toString()}`);
      setExpenses((current) => [...current, ...list.expenses]);
      setNextCursor(list.nextCursor);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load more.");
    } finally {
      setLoadingMore(false);
    }
  }

  const monthValue = useMemo(() => {
    if (!from.endsWith("-01") || !to) return "";
    const [year, month] = from.split("-");
    const end = lastDayIso(Number(year), Number(month));
    return to === end ? `${year}-${month}` : "";
  }, [from, to]);

  const exportParams = new URLSearchParams();
  if (propertyId) exportParams.set("propertyId", propertyId);
  if (categoryId) exportParams.set("categoryId", categoryId);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  if (searchParams.get("q")) exportParams.set("q", searchParams.get("q") ?? "");
  const exportHref = `/api/v1/exports/expenses?${exportParams.toString()}`;
  const activeFilters = [propertyId, categoryId, from, to].filter(Boolean).length;

  function setMonth(value: string) {
    const range = monthRange(value);
    if (!range) {
      replaceParams({ from: null, to: null });
      return;
    }
    replaceParams({ from: range.from, to: range.to });
  }

  function setShortcut(kind: "month" | "year" | "all") {
    const today = todayInChicago();
    if (kind === "all") {
      replaceParams({ from: null, to: null });
      return;
    }
    if (kind === "month") {
      const range = monthRange(today.slice(0, 7));
      replaceParams({ from: range?.from ?? null, to: range?.to ?? null });
      return;
    }
    replaceParams({ from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` });
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Expenses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading…" : `${total} ${total === 1 ? "expense" : "expenses"}`}
          </p>
        </div>
        <Link href="/expenses/new" className={cn(buttonVariants(), "hidden h-11! md:inline-flex")}>
          Add expense
        </Link>
      </div>

      {notice ? (
        <p role="status" className="rounded-xl bg-secondary px-3 py-2 text-sm text-brand-indigo">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-3">
        <Label htmlFor="search" className="sr-only">
          Search expenses
        </Label>
        <Input
          id="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search payee, notes, property…"
          className="h-12! text-base"
        />
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-11! flex-1" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            Filters{activeFilters ? ` · ${activeFilters}` : ""}
          </Button>
          <a href={exportHref} className={cn(buttonVariants({ variant: "outline" }), "h-11! flex-1")}>
            Export CSV
          </a>
        </div>
        {filtersOpen ? (
          <div className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="filter-property">Property</Label>
                <ChoiceSelect
                  id="filter-property"
                  value={propertyId || "all"}
                  onChange={(value) => replaceParams({ propertyId: value === "all" ? null : value })}
                  options={[{ value: "all", label: "All properties" }, ...properties.map((property) => ({ value: property.id, label: property.isActive ? property.name : `${property.name} (inactive)` }))]}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filter-category">Category</Label>
                <ChoiceSelect
                  id="filter-category"
                  value={categoryId || "all"}
                  onChange={(value) => replaceParams({ categoryId: value === "all" ? null : value })}
                  options={[{ value: "all", label: "All categories" }, ...categories.map((category) => ({ value: category.id, label: category.isActive ? category.name : `${category.name} (inactive)` }))]}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="filter-month">Month</Label>
              <Input
                id="filter-month"
                type="month"
                value={monthValue}
                onChange={(event) => setMonth(event.target.value)}
                className="h-12! text-base"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="filter-from">From</Label>
                <Input id="filter-from" type="date" value={from} onChange={(event) => replaceParams({ from: event.target.value || null })} className="h-12! text-base" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="filter-to">To</Label>
                <Input id="filter-to" type="date" value={to} onChange={(event) => replaceParams({ to: event.target.value || null })} className="h-12! text-base" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setShortcut("month")}>
                This month
              </Button>
              <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setShortcut("year")}>
                This year
              </Button>
              <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setShortcut("all")}>
                All dates
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!loading && expenses.length === 0 ? (
        <div className="rounded-2xl bg-card px-4 py-10 text-center ring-1 ring-foreground/10">
          <p className="font-medium">No expenses match.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try another filter, or log the next bill.</p>
          <Link href="/expenses/new" className={cn(buttonVariants(), "mt-4 h-11!")}>
            Add expense
          </Link>
        </div>
      ) : (
        <ul className="grid gap-2">
          {expenses.map((expense) => (
            <li key={expense.id}>
              <Link href={`/expenses/${expense.id}`} className="block rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{expense.payee}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {expense.propertyName} · {expense.categoryName}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium tabular-nums">{formatMoney(expense.amount)}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatDisplayDate(expense.expenseDate)}</span>
                  <span aria-hidden>·</span>
                  <span>{expense.paymentMethod}</span>
                  {expense.isSample ? <Badge variant="outline">Sample</Badge> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {nextCursor ? (
        <Button type="button" variant="outline" className="h-11!" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
