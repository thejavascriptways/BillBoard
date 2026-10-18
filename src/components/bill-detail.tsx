"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { StatusPill } from "@/components/due-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api-client";
import { applyDialogSave } from "@/lib/dialog-save";
import type { BillDTO, OccurrenceDTO, PaymentDTO } from "@/lib/bill-types";
import { formatDisplayDate, todayInChicago } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

export function BillDetail({ billId }: { billId: string }) {
  const [bill, setBill] = useState<BillDTO | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceDTO[]>([]);
  const [payments, setPayments] = useState<PaymentDTO[]>([]);
  const [methods, setMethods] = useState<{ id: string; label: string }[]>([]);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayInChicago());
  const [methodId, setMethodId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const [reschedule, setReschedule] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<{ yearMonth: string; amount: string | null; paidOn: string | null; status: string }[]>([]);
  const [audit, setAudit] = useState<{ id: string; summary: string; createdAt: string }[]>([]);

  function load() {
    Promise.all([
      api<{ bill: BillDTO }>(`/api/v1/bills/${billId}`),
      api<{ occurrences: OccurrenceDTO[] }>(`/api/v1/occurrences?from=2020-01-01&to=2035-12-31`),
      api<{ payments: PaymentDTO[] }>(`/api/v1/payments?billId=${billId}`),
      api<{ rows: { id: string; name: string; detail: string | null; isActive: boolean }[] }>("/api/v1/masters?table=payment-methods&active=1"),
      api<{ entries: { yearMonth: string; amount: string | null; paidOn: string | null; status: string }[]; audit: { id: string; summary: string; createdAt: string }[] }>(`/api/v1/months?billId=${billId}`),
    ])
      .then(([billData, occurrenceData, paymentData, methodData, monthData]) => {
        setBill(billData.bill);
        const mine = occurrenceData.occurrences.filter((row) => row.billId === billId);
        setOccurrences(mine);
        setPayments(paymentData.payments);
        setMethods(methodData.rows.map((row) => ({ id: row.id, label: row.detail ? `${row.name} · ${row.detail}` : row.name })));
        setTimeline(monthData.entries);
        setAudit(monthData.audit);
        const open = mine.find((row) => row.status !== "paid" && row.status !== "skipped");
        if (open) {
          setTarget(open.id);
          setAmount(open.remaining);
          setReschedule(open.dueDate);
        }
        setError(null);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load this bill."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bill id is the page
  }, [billId]);

  async function pay() {
    const effects = {
      close: () => {
        setConfirmation("");
        setNote("");
        setMessage(null);
      },
      refresh: () => load(),
      notify: (text: string) => toast.success(text),
      showError: setError,
    };
    if (!amount.trim()) {
      applyDialogSave({ ok: false, message: "Enter the amount that was paid." }, effects);
      return;
    }
    try {
      await api(`/api/v1/occurrences/${target}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paidOn,
          paymentMethodId: methodId || null,
          confirmationNumber: confirmation || null,
          note: note || null,
        }),
      });
      applyDialogSave({ ok: true, message: "Marked paid." }, effects);
    } catch (caught) {
      applyDialogSave(
        { ok: false, message: caught instanceof ApiError ? caught.message : "Could not record the payment." },
        effects,
      );
    }
  }

  async function undo(id: string) {
    await api(`/api/v1/payments/${id}/undo`, { method: "POST", body: "{}" });
    setMessage("Payment undone.");
    load();
  }

  async function skip() {
    await api(`/api/v1/occurrences/${target}/skip`, { method: "POST", body: "{}" });
    setMessage("That date was skipped.");
    load();
  }

  async function move() {
    await api(`/api/v1/occurrences/${target}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ dueDate: reschedule }),
    });
    setMessage("That date was moved.");
    load();
  }

  if (error && !bill) return <p role="alert">{error}</p>;
  if (!bill) return <div className="h-40 animate-pulse rounded-2xl bg-muted" />;

  return (
    <div id="bill-detail" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{bill.propertyName}</p>
          <h1 className="font-display text-4xl tracking-tight">{bill.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {bill.payeeName ? `${bill.payeeName} · ` : ""}
            {bill.categoryName} · {bill.amount ? formatMoney(bill.amount) : "No usual amount"} {bill.amountKind} · {bill.frequency}
            {bill.autopay ? " · Autopay" : ""} · {bill.paymentMode.replaceAll("_", " ")}
            {bill.dueOnNote ? ` · ${bill.dueOnNote}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/bills/${bill.id}/edit`} className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm">
            Edit
          </Link>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              api(`/api/v1/bills/${bill.id}/duplicate`, { method: "POST", body: "{}" }).then(() => setMessage("A copy was added."))
            }
          >
            Duplicate
          </Button>
        </div>
      </div>
      <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-medium">Monthly timeline</h2>
        <div className="mt-3 flex h-16 items-end gap-1">
          {timeline.map((entry) => (
            <div key={entry.yearMonth} className="flex-1 rounded-t bg-brand-indigo/80" style={{ height: `${Math.min(100, Number(entry.amount ?? 0) / 5)}%` }} title={`${entry.yearMonth} ${entry.amount ?? "blank"}`} />
          ))}
        </div>
        <ul className="mt-3 grid gap-1 text-sm">
          {timeline.map((entry) => (
            <li key={entry.yearMonth} className="flex justify-between gap-3">
              <span>{entry.yearMonth}</span>
              <span>{entry.amount == null ? "Blank" : formatMoney(entry.amount)} · {entry.status.replaceAll("_", " ")}{entry.paidOn ? ` · ${entry.paidOn}` : ""}</span>
            </li>
          ))}
        </ul>
        {audit.length > 0 ? (
          <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">
            {audit.map((entry) => <li key={entry.id}>{entry.summary}</li>)}
          </ul>
        ) : null}
      </section>
      {message ? <p className="text-sm text-brand-indigo">{message}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-medium">Mark paid</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="pay-target">Due date</Label>
            <select
              id="pay-target"
              className="h-12 rounded-lg border border-border bg-background px-3"
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
                const row = occurrences.find((item) => item.id === event.target.value);
                if (row) setAmount(row.remaining);
              }}
            >
              {occurrences.map((row) => (
                <option key={row.id} value={row.id}>
                  {formatDisplayDate(row.dueDate)} · {row.status} · {formatMoney(row.remaining)} left
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-amount">Amount</Label>
            <Input id="pay-amount" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-date">Paid on</Label>
            <Input id="pay-date" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className="h-12!" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-method">Method</Label>
            <select id="pay-method" className="h-12 rounded-lg border border-border bg-background px-3" value={methodId} onChange={(event) => setMethodId(event.target.value)}>
              <option value="">None</option>
              {methods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pay-confirm">Confirmation #</Label>
            <Input id="pay-confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="h-12!" />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="pay-note">Note</Label>
            <Input id="pay-note" value={note} onChange={(event) => setNote(event.target.value)} className="h-12!" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" className="h-11!" onClick={() => void pay()} disabled={!target}>
            Mark paid
          </Button>
          <Button type="button" variant="outline" onClick={() => void skip()} disabled={!target}>
            Skip this date
          </Button>
          <Input type="date" aria-label="Reschedule date" value={reschedule} onChange={(event) => setReschedule(event.target.value)} className="h-11! w-44" />
          <Button type="button" variant="outline" onClick={() => void move()} disabled={!target || !reschedule}>
            Reschedule
          </Button>
        </div>
      </section>
      <section>
        <h2 className="font-medium">Due dates</h2>
        <ul className="mt-2 divide-y divide-border rounded-2xl bg-card px-4 ring-1 ring-foreground/10">
          {occurrences.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{formatDisplayDate(row.dueDate)}</span>
              <StatusPill status={row.status} />
              <span className="tabular-nums">{formatMoney(row.paidAmount)} / {formatMoney(row.expectedAmount)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section id="payment-history">
        <h2 className="font-medium">Payment history</h2>
        {payments.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p> : null}
        <ul className="mt-2 divide-y divide-border">
          {payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                {formatDisplayDate(payment.paidOn)} · {formatMoney(payment.amount)}
                {payment.confirmationNumber ? ` · ${payment.confirmationNumber}` : ""}
                {payment.undone ? " · undone" : ""}
              </span>
              {payment.undone ? null : (
                <button type="button" className="text-primary" onClick={() => void undo(payment.id)}>
                  Undo
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
