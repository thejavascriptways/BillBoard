"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { scopeQuery, usePropertyScope } from "@/components/property-scope";
import { ApiError, api } from "@/lib/api-client";
import type { DueBoardDTO, OccurrenceDTO } from "@/lib/bill-types";
import { formatDisplayDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

const STATUS_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  due_soon: "Due soon",
  due_today: "Due today",
  overdue: "Overdue",
  partial: "Partial",
  paid: "Paid",
  skipped: "Skipped",
};

function tone(status: string): string {
  if (status === "overdue") return "bg-accent text-coral-ink";
  if (status === "due_today" || status === "partial") return "bg-secondary text-brand-indigo";
  if (status === "paid") return "bg-muted text-muted-foreground";
  return "bg-muted text-foreground";
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone(status)}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function OccurrenceRow({ row, onPaid }: { row: OccurrenceDTO; onPaid: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setPending(true);
    setError(null);
    try {
      await api(`/api/v1/occurrences/${row.id}/pay`, { method: "POST", body: "{}" });
      onPaid();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not mark this paid.");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <Link href={`/bills/${row.billId}`} className="font-medium hover:underline">
          {row.billName}
        </Link>
        <p className="text-sm text-muted-foreground">
          {row.propertyName} · {row.payeeName} · {formatDisplayDate(row.dueDate)}
          {row.autopay ? " · Autopay" : ""}
        </p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>
      <StatusPill status={row.status} />
      <p className="w-24 text-right font-medium tabular-nums">{formatMoney(row.remaining)}</p>
      <Button type="button" className="h-10!" onClick={pay} disabled={pending}>
        {pending ? "Saving…" : "Pay"}
      </Button>
    </li>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl tracking-tight">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function DueBoard() {
  const { propertyId, ready } = usePropertyScope();
  const [board, setBoard] = useState<DueBoardDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    if (!ready) return;
    api<DueBoardDTO>(`/api/v1/dashboard${scopeQuery(propertyId)}`)
      .then((data) => {
        setBoard(data);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load due dates."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the home filter changes
  }, [propertyId, ready]);

  if (!ready || loading) {
    return (
      <div className="grid gap-3" aria-hidden>
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }
  if (error || !board) {
    return (
      <div role="alert" className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
        <p>{error ?? "Could not load due dates."}</p>
        <Button type="button" variant="outline" className="mt-4" onClick={load}>
          Try again
        </Button>
      </div>
    );
  }

  const empty = board.overdue.length + board.dueToday.length + board.next7.length + board.next30.length === 0;
  const next30Count = board.next7.length + board.next30.length;

  return (
    <div id="due-board" className="grid gap-6">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Due dates</h1>
        <p className="mt-1 text-muted-foreground">What is overdue, due today, and coming up. Press N to add a bill.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Overdue" value={String(board.overdue.length)} />
        <Stat label="Due today" value={String(board.dueToday.length)} />
        <Stat label="Next 7 days" value={String(board.next7.length)} />
        <Stat label="Next 30 days" value={String(next30Count)} hint="Not counting today" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">This month</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">
            {formatMoney(board.month.paid)} <span className="text-base text-muted-foreground">paid of {formatMoney(board.month.due)} due</span>
          </p>
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">Credit cards</p>
          <p className="mt-1 text-2xl font-medium">{board.cards.items.length}</p>
          <Link href="/cards" className="text-sm text-primary hover:underline">
            Open cards
          </Link>
        </div>
      </div>
      {board.byProperty.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-3">
          {board.byProperty.map((row) => (
            <li key={row.id} className="rounded-xl bg-muted px-3 py-2 text-sm">
              <p className="font-medium">{row.name}</p>
              <p className="text-muted-foreground">
                {formatMoney(row.paid)} of {formatMoney(row.due)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {empty ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">No bills yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Add the next bill that comes due. The board stays empty until you do.</p>
          <Link href="/bills/new" className="mt-4 inline-flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white">
            Quick add bill
          </Link>
        </div>
      ) : (
        <div className="grid gap-6">
          <Section title="Overdue" rows={board.overdue} onPaid={load} />
          <Section title="Due today" rows={board.dueToday} onPaid={load} />
          <Section title="Next 7 days" rows={board.next7} onPaid={load} />
          <Section title="Days 8–30" rows={board.next30} onPaid={load} />
        </div>
      )}
    </div>
  );
}

function Section({ title, rows, onPaid }: { title: string; rows: OccurrenceDTO[]; onPaid: () => void }) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <ul className="mt-2 rounded-2xl bg-card px-4 ring-1 ring-foreground/10">
        {rows.map((row) => (
          <OccurrenceRow key={row.id} row={row} onPaid={onPaid} />
        ))}
      </ul>
    </section>
  );
}
