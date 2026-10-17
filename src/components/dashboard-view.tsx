"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api-client";
import { propertyColor } from "@/lib/colors";
import { formatDisplayDate, lastDayIso } from "@/lib/dates";
import { formatMoney, toCents } from "@/lib/money";
import type { CategoryTotal, SummaryDTO, TrendMonth } from "@/lib/types";
import { cn } from "cn";

export function DashboardView() {
  const [summary, setSummary] = useState<SummaryDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"month" | "year">("month");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  function applySummary(data: SummaryDTO) {
    setSummary(data);
    setSelectedMonth(data.monthlyTrend.at(-1)?.month ?? null);
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;
    api<SummaryDTO>("/api/v1/reports/summary")
      .then((data) => {
        if (!cancelled) applySummary(data);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : "Could not load the board.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-3" aria-hidden>
        <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }
  if (error || !summary) {
    return (
      <div role="alert" className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
        <p>{error ?? "Could not load the board."}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => {
            setLoading(true);
            setError(null);
            api<SummaryDTO>("/api/v1/reports/summary")
              .then(applySummary)
              .catch((caught: unknown) => {
                setError(caught instanceof ApiError ? caught.message : "Could not load the board.");
              })
              .finally(() => setLoading(false));
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const monthEnd = lastDayIso(Number(summary.asOf.slice(0, 4)), Number(summary.asOf.slice(5, 7)));
  const throughToday = summary.asOf !== monthEnd;
  const categories = scope === "month" ? summary.categories.month : summary.categories.yearToDate;
  const selected = summary.monthlyTrend.find((month) => month.month === selectedMonth) ?? summary.monthlyTrend.at(-1);
  const max = Math.max(...summary.monthlyTrend.map((month) => toCents(month.total)), 1);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 md:grid-cols-2">
      <section className="rounded-3xl bg-brand px-5 py-6 text-white md:col-span-2 md:px-8">
        <p className="text-sm">{summary.month.label}</p>
        <p className="mt-1 font-display text-5xl tracking-tight tabular-nums md:text-6xl">
          {formatMoney(summary.month.total)}
        </p>
        <p className="mt-2 text-sm">
          {throughToday ? `This month, through ${formatDisplayDate(summary.asOf)}` : "This month"}
        </p>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-white/20 pt-4">
          <div>
            <p className="text-xs tracking-wide uppercase">Year to date</p>
            <p className="font-display text-2xl tabular-nums">{formatMoney(summary.yearToDate.total)}</p>
          </div>
          <Link
            href="/expenses/new"
            className={cn(buttonVariants(), "h-11! bg-none! bg-coral! text-coral-foreground! hover:brightness-95")}
          >
            Log an expense
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">By property</h2>
        <ul className="mt-3 grid gap-2">
          {summary.month.byProperty.map((row, index) => {
            const yearRow = summary.yearToDate.byProperty.find((item) => item.id === row.id);
            return (
              <li key={row.id} className="flex items-center gap-3 rounded-xl bg-muted px-3 py-3">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: propertyColor(index) }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Year to date {formatMoney(yearRow?.total ?? "0.00")}
                  </p>
                </div>
                <p className="text-right font-medium tabular-nums">{formatMoney(row.total)}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Categories</h2>
          <div className="flex rounded-full bg-muted p-1 text-xs">
            <button
              type="button"
              aria-pressed={scope === "month"}
              className={cn("rounded-full px-3 py-1.5", scope === "month" && "bg-card font-medium shadow-sm")}
              onClick={() => setScope("month")}
            >
              Month
            </button>
            <button
              type="button"
              aria-pressed={scope === "year"}
              className={cn("rounded-full px-3 py-1.5", scope === "year" && "bg-card font-medium shadow-sm")}
              onClick={() => setScope("year")}
            >
              Year
            </button>
          </div>
        </div>
        {categories.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No expenses in this period yet.</p>
        ) : (
          <ul className="mt-4 grid gap-3">
            {categories.map((row) => (
              <CategoryBar key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10 md:col-span-2 md:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Monthly trend</h2>
            <p className="mt-1 font-medium">
              {selected ? `${selected.label} · ${formatMoney(selected.total)}` : "No months yet"}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">{summary.asOf.slice(0, 4)}</p>
        </div>
        <div className="mt-4 flex h-44 items-end gap-1.5" role="group" aria-label="Monthly totals">
          {summary.monthlyTrend.map((month) => (
            <TrendBar
              key={month.month}
              month={month}
              max={max}
              selected={month.month === selected?.month}
              properties={summary.month.byProperty}
              onSelect={() => setSelectedMonth(month.month)}
            />
          ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {summary.month.byProperty.map((property, index) => (
            <li key={property.id} className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ backgroundColor: propertyColor(index) }} />
              {property.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CategoryBar({ row }: { row: CategoryTotal }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate">{row.name}</span>
        <span className="shrink-0 tabular-nums">
          {formatMoney(row.total)}
          <span className="ml-2 text-xs text-muted-foreground">{row.share}%</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${row.share}%` }} />
      </div>
    </li>
  );
}

function TrendBar({
  month,
  max,
  selected,
  properties,
  onSelect,
}: {
  month: TrendMonth;
  max: number;
  selected: boolean;
  properties: { id: string }[];
  onSelect: () => void;
}) {
  const height = Math.max((toCents(month.total) / max) * 100, toCents(month.total) > 0 ? 4 : 0);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${month.label} ${formatMoney(month.total)}`}
      onClick={onSelect}
      className={cn("flex h-full min-w-0 flex-1 flex-col justify-end rounded-md", selected && "bg-muted/70")}
    >
      <span className="flex w-full flex-col justify-end px-0.5" style={{ height: `${height}%` }}>
        {properties.map((property, index) => {
          const slice = month.byProperty.find((item) => item.id === property.id);
          const cents = slice ? toCents(slice.total) : 0;
          if (cents <= 0) return null;
          const share = toCents(month.total) > 0 ? (cents / toCents(month.total)) * 100 : 0;
          return (
            <span
              key={property.id}
              className="block w-full first:rounded-t-sm last:rounded-b-sm"
              style={{ height: `${share}%`, backgroundColor: propertyColor(index), minHeight: 2 }}
            />
          );
        })}
      </span>
      <span className="mt-1 truncate text-center text-[10px] text-muted-foreground">{month.label}</span>
    </button>
  );
}
