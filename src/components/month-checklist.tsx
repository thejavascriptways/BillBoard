"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { usePropertyScope } from "@/components/property-scope";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api-client";
import { addMonths, formatLongMonth, todayInChicago } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { CategoryDTO } from "@/lib/types";

type Row = {
  id: string;
  billId: string;
  billName: string;
  propertyName: string;
  groupName: string;
  categoryName: string;
  categoryColor: string;
  paymentMode: string;
  status: string;
  amount: string | null;
  paidOn: string | null;
  dueDate: string | null;
  prompt: boolean;
  missing: boolean;
  coveredBy: string | null;
  cardholderName: string | null;
  personName: string | null;
  flags: { paidBelowStatement: boolean; balanceCarried: boolean; zeroBalance: boolean } | null;
  band: string;
  yearDots: string[];
  excluded: boolean;
};

type Checklist = {
  yearMonth: string;
  today: string;
  archived: boolean;
  due: string;
  paid: string;
  remaining: string;
  rows: Row[];
};

type Person = { id: string; name: string; archived: boolean };

const BANDS = [
  ["annual", "Annual and non-monthly"],
  ["overdue", "Overdue"],
  ["due_soon", "Due soon"],
  ["upcoming", "Upcoming"],
  ["paid", "Paid"],
  ["reference", "Reference"],
] as const;

const DOT: Record<string, string> = {
  done: "bg-brand-indigo",
  missed: "bg-coral-ink",
  na: "bg-muted-foreground/30",
  pending: "bg-secondary",
  open: "bg-foreground/20",
  empty: "bg-transparent ring-1 ring-foreground/15",
};

const MODE_LABEL: Record<string, string> = {
  auto: "Auto paid",
  manual: "Manual",
  check: "By check",
  paycheck: "Paid in paycheck",
  covered: "Included in another bill",
};

export function MonthChecklist() {
  const { propertyId, ready } = usePropertyScope();
  const [month, setMonth] = useState(() => todayInChicago().slice(0, 7));
  const [data, setData] = useState<Checklist | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [personId, setPersonId] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  function load(next = month) {
    const params = new URLSearchParams({ yearMonth: next });
    if (propertyId && propertyId !== "all") params.set("propertyId", propertyId);
    if (categoryId) params.set("categoryId", categoryId);
    if (personId) params.set("personId", personId);
    if (mode) params.set("paymentMode", mode);
    if (status) params.set("status", status);
    api<Checklist>(`/api/v1/months?${params.toString()}`)
      .then((checklist) => {
        setData(checklist);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load this month."));
  }

  useEffect(() => {
    if (!ready) return;
    load(month);
    api<{ people: Person[] }>("/api/v1/people").then((result) => setPeople(result.people)).catch(() => setPeople([]));
    api<{ categories: CategoryDTO[] }>("/api/v1/categories").then((result) => setCategories(result.categories)).catch(() => setCategories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters and month drive the checklist
  }, [month, propertyId, ready, categoryId, personId, mode, status]);

  const progress = useMemo(() => {
    if (!data) return 0;
    const due = Number(data.due);
    if (!due) return data.rows.some((row) => row.status === "done") ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round((Number(data.paid) / due) * 100)));
  }, [data]);

  return (
    <div id="due-board" className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight">This month</h1>
          <p className="text-sm text-muted-foreground">Due dates for the household, one row per bill.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="h-10 rounded-lg border border-border px-3 text-sm" onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}>
            Previous
          </button>
          <label className="sr-only" htmlFor="month-nav">Month</label>
          <input id="month-nav" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-2" />
          <button type="button" className="h-10 rounded-lg border border-border px-3 text-sm" onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}>
            Next
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {data ? (
        <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">{formatLongMonth(data.yearMonth)}</p>
          <div className="mt-2 flex flex-wrap gap-6">
            <p><span className="text-sm text-muted-foreground">Due </span><span className="font-medium">{formatMoney(data.due)}</span></p>
            <p><span className="text-sm text-muted-foreground">Paid </span><span className="font-medium">{formatMoney(data.paid)}</span></p>
            <p><span className="text-sm text-muted-foreground">Remaining </span><span className="font-medium">{formatMoney(data.remaining)}</span></p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-label={`${progress}% paid`}>
            <div className="h-full bg-brand-indigo" style={{ width: `${progress}%` }} />
          </div>
          {data.archived ? <p className="mt-2 text-sm text-muted-foreground">This month is archived and read-only.</p> : null}
        </section>
      ) : (
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      )}
      <div className="grid gap-2 sm:grid-cols-4">
        <select aria-label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm">
          <option value="">All categories</option>
          {categories.filter((category) => !category.archived).map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select aria-label="Cardholder" value={personId} onChange={(event) => setPersonId(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm">
          <option value="">All people</option>
          {people.filter((person) => !person.archived).map((person) => (
            <option key={person.id} value={person.id}>{person.name}</option>
          ))}
        </select>
        <select aria-label="Payment mode" value={mode} onChange={(event) => setMode(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm">
          <option value="">All payment modes</option>
          {Object.entries(MODE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-2 text-sm">
          <option value="">All statuses</option>
          <option value="not_done">Not done</option>
          <option value="pending">Pending confirmation</option>
          <option value="done">Done</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
          <option value="not_applicable">Not applicable</option>
          <option value="included">Included in another bill</option>
        </select>
      </div>
      {data && data.rows.length === 0 ? (
        <section className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="font-medium">Nothing due this month</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add a bill with Quick add. It will show up here next time this month is opened. No sample bills are included.</p>
          <Button type="button" className="mt-3" nativeButton={false} render={<Link href="/bills/new" />}>Quick add bill</Button>
        </section>
      ) : null}
      {BANDS.map(([band, label]) => {
        const rows = data?.rows.filter((row) => row.band === band) ?? [];
        if (rows.length === 0) return null;
        const groups = new Map<string, Row[]>();
        for (const row of rows) {
          const list = groups.get(row.groupName) ?? [];
          list.push(row);
          groups.set(row.groupName, list);
        }
        return (
          <section key={band} className="grid gap-3">
            <h2 className="font-display text-2xl tracking-tight">{label}</h2>
            {[...groups.entries()].map(([group, items]) => {
              const key = `${band}:${group}`;
              const subtotal = items.reduce((sum, row) => sum + (row.excluded || row.amount == null ? 0 : Number(row.amount)), 0);
              return (
                <div key={key} className="rounded-2xl bg-card ring-1 ring-foreground/10">
                  <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setClosed({ ...closed, [key]: !closed[key] })}>
                    <span className="font-medium">{group}</span>
                    <span className="text-sm text-muted-foreground">{formatMoney(subtotal.toFixed(2))}</span>
                  </button>
                  {closed[key] ? null : (
                    <ul className="border-t border-border">
                      {items.map((row) => (
                        <ChecklistRow key={row.id} row={row} readOnly={Boolean(data?.archived)} onChange={() => load()} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
      {data && !data.archived ? (
        <Button type="button" variant="outline" onClick={() => void api("/api/v1/months", { method: "POST", body: JSON.stringify({ action: "archive", yearMonth: month }) }).then(() => load())}>
          Archive {formatLongMonth(month)}
        </Button>
      ) : null}
    </div>
  );
}

function ChecklistRow({ row, readOnly, onChange }: { row: Row; readOnly: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(row.amount ?? "");
  const [paidOn, setPaidOn] = useState(row.paidOn ?? todayInChicago());
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const grey = row.band === "reference" || row.excluded;

  async function pay() {
    setMessage(null);
    try {
      await api(`/api/v1/months/${row.id}`, {
        method: "POST",
        body: JSON.stringify({ amount, paidOn, confirm }),
      });
      setOpen(false);
      onChange();
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Could not mark this paid.";
      if (caught instanceof ApiError && caught.status === 409) setConfirm(true);
      setMessage(text);
    }
  }

  return (
    <li className={`grid gap-2 border-b border-border px-4 py-3 last:border-0 ${grey ? "text-muted-foreground" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.categoryColor }} aria-hidden />
        <div className="min-w-0 flex-1">
          <Link href={`/bills/${row.billId}`} className="font-medium hover:underline">{row.billName}</Link>
          <p className="text-xs text-muted-foreground">
            {row.propertyName}
            {row.dueDate ? ` · due ${row.dueDate}` : ""}
            {` · ${MODE_LABEL[row.paymentMode] ?? row.paymentMode}`}
            {row.cardholderName ? ` · ${row.cardholderName}` : ""}
            {row.personName ? ` · ${row.personName}` : ""}
            {row.coveredBy ? ` · included in ${row.coveredBy}` : ""}
          </p>
        </div>
        <p className="text-sm">{row.amount == null ? (row.prompt ? "Amount needed" : "—") : formatMoney(row.amount)}</p>
        <div className="flex gap-1" aria-label="Year at a glance">
          {row.yearDots.map((dot, index) => (
            <span key={index} className={`h-2 w-2 rounded-full ${DOT[dot] ?? DOT.empty}`} />
          ))}
        </div>
        {readOnly || grey || row.status === "done" ? null : (
          <Button type="button" className="h-9" onClick={() => setOpen(true)}>Mark paid</Button>
        )}
      </div>
      {row.missing ? <p className="text-xs text-coral-ink">Missing amount after the due date.</p> : null}
      {row.flags?.paidBelowStatement ? <p className="text-xs text-coral-ink">Paid below the statement. Balance carried.</p> : null}
      {row.flags?.zeroBalance ? <p className="text-xs text-muted-foreground">$0.00 balance this month.</p> : null}
      {open ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input aria-label="Amount" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-10!" />
          <Input aria-label="Date paid" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className="h-10!" />
          <Button type="button" onClick={() => void pay()}>{confirm ? "Confirm and save" : "Save"}</Button>
          {confirm ? <p className="text-xs text-muted-foreground sm:col-span-3">Confirm to save despite the warning.</p> : null}
          {message ? <p className="text-xs text-destructive sm:col-span-3">{message}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
