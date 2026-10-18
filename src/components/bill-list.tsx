"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusPill } from "@/components/due-board";
import { scopeQuery, usePropertyScope } from "@/components/property-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api-client";
import type { OccurrenceDTO } from "@/lib/bill-types";
import type { MasterRow } from "@/lib/masters";
import { formatDisplayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export function BillList() {
  const { propertyId, ready } = usePropertyScope();
  const [rows, setRows] = useState<OccurrenceDTO[]>([]);
  const [categories, setCategories] = useState<MasterRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    if (!ready) return;
    const params = new URLSearchParams();
    if (propertyId && propertyId !== "all") params.set("propertyId", propertyId);
    if (categoryId) params.set("categoryId", categoryId);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (q.trim()) params.set("q", q.trim());
    api<{ occurrences: OccurrenceDTO[] }>(`/api/v1/occurrences?${params.toString()}`)
      .then((data) => {
        setRows(data.occurrences);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load bills."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api<{ rows: MasterRow[] }>("/api/v1/masters?table=categories").then((data) => setCategories(data.rows)).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters drive the list
  }, [propertyId, ready, status, categoryId, from, to]);

  async function archiveSelected() {
    const ids = [...new Set(rows.filter((row) => selected.includes(row.id)).map((row) => row.billId))];
    await api("/api/v1/bills/bulk", { method: "POST", body: JSON.stringify({ ids, archived: true }) });
    setSelected([]);
    load();
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Bills</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every due date, with the home filter from the header.</p>
        </div>
        <Link href="/bills/new" className="inline-flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white">
          Quick add bill
        </Link>
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        <Input value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load()} placeholder="Search bills or payees" className="h-11! md:col-span-2" aria-label="Search" />
        <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Any status</option>
          <option value="overdue">Overdue</option>
          <option value="due_today">Due today</option>
          <option value="due_soon">Due soon</option>
          <option value="upcoming">Upcoming</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="skipped">Skipped</option>
        </select>
        <select aria-label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-11 rounded-lg border border-border bg-background px-3 text-sm">
          <option value="">Any category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.isActive ? category.name : `${category.name} (inactive)`}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" className="h-11!" onClick={load}>
          Search
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input type="date" aria-label="From" value={from} onChange={(event) => setFrom(event.target.value)} className="h-11!" />
        <Input type="date" aria-label="To" value={to} onChange={(event) => setTo(event.target.value)} className="h-11!" />
      </div>
      {selected.length > 0 ? (
        <Button type="button" variant="outline" onClick={() => void archiveSelected()}>
          Archive selected bills
        </Button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : null}
      {!loading && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">Nothing matches.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Widen the dates or add a bill. The list uses {scopeQuery(propertyId) ? "the selected home" : "all homes"}.
          </p>
        </div>
      ) : null}
      <ul className="divide-y divide-border rounded-2xl bg-card px-4 ring-1 ring-foreground/10">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
            <input
              type="checkbox"
              aria-label={`Select ${row.billName}`}
              checked={selected.includes(row.id)}
              onChange={(event) =>
                setSelected((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))
              }
            />
            <div className="min-w-0 flex-1">
              <Link href={`/bills/${row.billId}`} className="font-medium hover:underline">
                {row.billName}
              </Link>
              <p className="text-sm text-muted-foreground">
                {formatDisplayDate(row.dueDate)} · {row.propertyName} · {row.categoryName}
              </p>
            </div>
            <StatusPill status={row.status} />
            <span className="tabular-nums">{formatMoney(row.remaining)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
