"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { usePropertyScope } from "@/components/property-scope";
import { StatusPill } from "@/components/due-board";
import { ApiError, api } from "@/lib/api-client";
import type { OccurrenceDTO } from "@/lib/bill-types";
import { formatMoney } from "@/lib/money";

function monthCells(yearMonth: string): Array<string | null> {
  const [year, month] = yearMonth.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: first.getUTCDay() }, () => null);
  for (let day = 1; day <= days; day += 1) {
    cells.push(`${yearMonth}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function BillCalendar() {
  const { propertyId, ready } = usePropertyScope();
  const [cursor, setCursor] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<OccurrenceDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load(month = cursor) {
    const [year, monthNumber] = month.split("-").map(Number);
    const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const params = new URLSearchParams({ from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` });
    if (propertyId && propertyId !== "all") params.set("propertyId", propertyId);
    api<{ occurrences: OccurrenceDTO[] }>(`/api/v1/occurrences?${params.toString()}`)
      .then((data) => {
        setRows(data.occurrences);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load the calendar."));
  }

  useEffect(() => {
    if (ready) load(cursor);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- month and home filter
  }, [cursor, propertyId, ready]);

  const byDay = useMemo(() => {
    const map = new Map<string, OccurrenceDTO[]>();
    for (const row of rows) {
      const list = map.get(row.dueDate) ?? [];
      list.push(row);
      map.set(row.dueDate, list);
    }
    return map;
  }, [rows]);

  async function pay(row: OccurrenceDTO) {
    setMessage(null);
    try {
      await api(`/api/v1/occurrences/${row.id}/pay`, { method: "POST", body: "{}" });
      setMessage(`${row.billName} marked paid.`);
      load();
    } catch (caught) {
      setMessage(caught instanceof ApiError ? caught.message : "Could not mark that paid.");
    }
  }

  function shift(delta: number) {
    const [year, month] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setCursor(`${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${cursor}-01T00:00:00Z`),
  );

  return (
    <div id="calendar" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl tracking-tight">Calendar</h1>
        <div className="flex items-center gap-2">
          <button type="button" className="h-10 rounded-lg border border-border px-3 text-sm" onClick={() => shift(-1)}>
            Previous
          </button>
          <p className="min-w-36 text-center font-medium">{label}</p>
          <button type="button" className="h-10 rounded-lg border border-border px-3 text-sm" onClick={() => shift(1)}>
            Next
          </button>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p className="text-sm text-brand-indigo">{message}</p> : null}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {monthCells(cursor).map((day, index) => (
          <div key={day ?? `empty-${index}`} className="min-h-28 rounded-xl bg-card p-1.5 ring-1 ring-foreground/10">
            {day ? <p className="text-xs text-muted-foreground">{Number(day.slice(-2))}</p> : null}
            <ul className="mt-1 grid gap-1">
              {(day ? (byDay.get(day) ?? []) : []).map((row) => (
                <li key={row.id} className="rounded-md bg-muted px-1 py-1 text-left">
                  <Link href={`/bills/${row.billId}`} className="block truncate text-xs font-medium hover:underline">
                    {row.billName}
                  </Link>
                  <p className="text-[10px] text-muted-foreground">{formatMoney(row.remaining)}</p>
                  {row.status === "paid" || row.status === "skipped" ? (
                    <StatusPill status={row.status} />
                  ) : (
                    <button type="button" className="text-[11px] font-semibold text-primary" onClick={() => void pay(row)}>
                      Pay
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No bills on this month yet.</p> : null}
    </div>
  );
}
