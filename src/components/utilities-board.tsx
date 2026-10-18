"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MasterSelect } from "@/components/master-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api-client";
import { defaultHomeId } from "@/lib/homes";
import type { MasterRow } from "@/lib/masters";
import type { BillDTO } from "@/lib/bill-types";
import { addMonths, formatDisplayDate, formatLongMonth, todayInChicago } from "@/lib/dates";
import { formatMoney, fromCents, toCents } from "@/lib/money";
import { cn } from "cn";

const HOME_KEY = "billboard.utilities.home";
const selectClass = "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm";

type UtilityType = { id: string; name: string };
type UtilityRow = {
  id: string;
  billId: string;
  propertyName: string;
  categoryName: string;
  groupName: string;
  payeeName: string;
  usualAmount: string | null;
  paymentMode: string;
  status: string;
  amount: string | null;
  paidOn: string | null;
  dueDate: string | null;
  prompt: boolean;
  band: string;
  excluded: boolean;
};
type Checklist = { yearMonth: string; archived: boolean; rows: UtilityRow[] };
type FormState = {
  propertyId: string;
  payeeName: string;
  oneTime: boolean;
  dueDay: string;
  dueDate: string;
  amountKind: "fixed" | "variable";
  amount: string;
  paymentMode: string;
  notes: string;
};

const blankForm = (propertyId: string): FormState => ({
  propertyId,
  payeeName: "",
  oneTime: false,
  dueDay: "",
  dueDate: "",
  amountKind: "variable",
  amount: "",
  paymentMode: "",
  notes: "",
});

function statusLabel(row: UtilityRow): string {
  if (row.status === "done") return row.paidOn ? `Paid ${formatDisplayDate(row.paidOn)}` : "Paid";
  if (row.status === "not_applicable") return "N/A";
  if (row.status === "skipped") return "Skipped";
  if (row.status === "pending") return "Pending";
  if (row.status === "failed") return "Failed";
  if (row.status === "included") return "Included";
  return "Due";
}

function sortRows(rows: UtilityRow[]): UtilityRow[] {
  return [...rows].sort((a, b) => {
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return a.categoryName.localeCompare(b.categoryName);
  });
}

export function UtilitiesBoard() {
  const pathname = usePathname();
  const [properties, setProperties] = useState<MasterRow[]>([]);
  const [types, setTypes] = useState<UtilityType[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [groupId, setGroupId] = useState("");
  const [homeId, setHomeId] = useState("");
  const [month, setMonth] = useState(() => todayInChicago().slice(0, 7));
  const [showOther, setShowOther] = useState(false);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<UtilityRow[]>([]);
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [typeQuery, setTypeQuery] = useState("");
  const [form, setForm] = useState<FormState>(blankForm(""));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [payRow, setPayRow] = useState<UtilityRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [payWarning, setPayWarning] = useState<string | null>(null);
  const [deleteRow, setDeleteRow] = useState<UtilityRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const payOpened = useRef(false);
  const newOpened = useRef(false);

  const homeName = homeId === "all" ? "All homes" : properties.find((property) => property.id === homeId)?.name ?? "Home";

  useEffect(() => {
    let cancel = false;
    Promise.all([
      api<{ rows: MasterRow[] }>("/api/v1/masters?table=homes"),
      api<{ rows: MasterRow[] }>("/api/v1/masters?table=utility-types"),
      api<{ rows: MasterRow[] }>("/api/v1/masters?table=categories"),
      api<{ rows: { name: string }[] }>("/api/v1/masters?table=payees&active=1"),
    ])
      .then(([homes, types, categories, payees]) => {
        if (cancel) return;
        const list = homes.rows;
        setProperties(list);
        setTypes(types.rows.filter((type) => type.isActive).map((type) => ({ id: type.id, name: type.name })));
        setProviders(payees.rows.map((row) => row.name));
        setGroupId(categories.rows.find((row) => row.key === "utilities" && !row.parentId)?.id ?? "");
        const saved = window.localStorage.getItem(HOME_KEY);
        setHomeId(defaultHomeId(list, saved));
        setReady(true);
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof ApiError ? caught.message : "Could not load utilities.");
        setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !groupId || !homeId) return;
    let cancel = false;
    const params = new URLSearchParams({ yearMonth: month, excludeCards: "1" });
    if (homeId !== "all") params.set("propertyId", homeId);
    if (!showOther) params.set("categoryId", groupId);
    api<Checklist>(`/api/v1/months?${params.toString()}`)
      .then((data) => {
        if (cancel) return;
        const visible = sortRows(data.rows.filter((row) => row.dueDate?.startsWith(month)));
        setRows(visible);
        setArchived(data.archived);
        setDrafts({});
        setError(null);
        if (new URLSearchParams(window.location.search).get("pay") === "1" && !payOpened.current) {
          const row = visible.find((item) => item.status !== "done" && item.status !== "skipped" && item.status !== "not_applicable");
          if (row) {
            payOpened.current = true;
            setPayRow(row);
            setPayAmount(row.amount ?? row.usualAmount ?? "");
            setPayDate(todayInChicago());
            setPayError(null);
            setPayWarning(null);
          }
        }
      })
      .catch((caught: unknown) => {
        if (!cancel) setError(caught instanceof ApiError ? caught.message : "Could not load this month.");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [ready, groupId, homeId, month, showOther, reloadKey]);

  useEffect(() => {
    if (!ready || newOpened.current) return;
    if (new URLSearchParams(window.location.search).get("new") !== "1") return;
    const propertyId = homeId !== "all" ? homeId : properties.find((property) => property.isActive)?.id ?? "";
    const timer = window.setTimeout(() => {
      newOpened.current = true;
      setEditing(null);
      setTypeQuery("");
      setForm(blankForm(propertyId));
      setFormError(null);
      setEditor(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, pathname, homeId, properties]);

  function chooseHome(id: string) {
    setHomeId(id);
    window.localStorage.setItem(HOME_KEY, id);
    setLoading(true);
  }

  function refresh() {
    setLoading(true);
    setReloadKey((value) => value + 1);
  }

  const visible = rows;
  const cents = visible.reduce(
    (sum, row) => {
      if (row.excluded || row.amount == null) return sum;
      const due = toCents(row.amount);
      return { due: sum.due + due, paid: sum.paid + (row.status === "done" ? due : 0) };
    },
    { due: 0, paid: 0 },
  );
  const matchedType = types.find((type) => type.name.toLowerCase() === typeQuery.trim().toLowerCase());

  async function saveUtility() {
    setSaving(true);
    setFormError(null);
    const body = {
      categoryId: matchedType?.id ?? null,
      categoryName: matchedType ? null : typeQuery.trim(),
      propertyId: form.propertyId,
      payeeName: form.payeeName,
      dueDay: form.oneTime ? null : form.dueDay,
      dueDate: form.oneTime ? form.dueDate : null,
      yearMonth: month,
      amountKind: form.amountKind,
      amount: form.amount,
      paymentMode: form.paymentMode || null,
      notes: form.notes,
    };
    try {
      if (form.payeeName.trim()) {
        await api("/api/v1/masters", { method: "POST", body: JSON.stringify({ table: "payees", name: form.payeeName.trim() }) });
      }
      if (editing) {
        await api(`/api/v1/utilities/${editing}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/v1/utilities", { method: "POST", body: JSON.stringify(body) });
      }
      const catalog = await api<{ rows: MasterRow[] }>("/api/v1/masters?table=utility-types&active=1");
      setTypes(catalog.rows.map((row) => ({ id: row.id, name: row.name })));
      setEditor(false);
      refresh();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : "Could not save the utility.");
    } finally {
      setSaving(false);
    }
  }

  async function openEdit(row: UtilityRow) {
    setFormError(null);
    try {
      const data = await api<{ bill: BillDTO }>(`/api/v1/bills/${row.billId}`);
      const bill = data.bill;
      setEditing(bill.id);
      setTypeQuery(bill.categoryName);
      setForm({
        propertyId: bill.propertyId,
        payeeName: bill.payeeName,
        oneTime: bill.frequency === "once",
        dueDay: bill.dayOfMonth && bill.dayOfMonth > 0 ? String(bill.dayOfMonth) : "",
        dueDate: bill.frequency === "once" ? bill.anchorDate : "",
        amountKind: bill.amountKind === "fixed" ? "fixed" : "variable",
        amount: bill.amount ?? "",
        paymentMode: bill.autopay ? "auto" : bill.paymentMode === "check" ? "check" : bill.paymentMode === "manual" ? "manual" : "",
        notes: bill.notes ?? "",
      });
      setEditor(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not open that utility.");
    }
  }

  function openPay(row: UtilityRow) {
    setPayRow(row);
    setPayAmount(row.amount ?? row.usualAmount ?? "");
    setPayDate(todayInChicago());
    setPayError(null);
    setPayWarning(null);
  }

  async function saveAmount(row: UtilityRow, value: string) {
    if ((row.amount ?? "") === value.trim()) return;
    try {
      await api(`/api/v1/months/${row.id}`, { method: "POST", body: JSON.stringify({ action: "amount", amount: value }) });
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save this month's amount.");
    }
  }

  async function markPaid(confirm: boolean) {
    if (!payRow) return;
    if (!payAmount.trim()) {
      setPayError("Enter the amount that was paid.");
      return;
    }
    setPayError(null);
    try {
      await api(`/api/v1/months/${payRow.id}`, {
        method: "POST",
        body: JSON.stringify({ amount: payAmount, paidOn: payDate, confirm }),
      });
      setPayRow(null);
      refresh();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setPayWarning(caught.message);
        return;
      }
      setPayError(caught instanceof ApiError ? caught.message : "Could not mark this paid.");
    }
  }

  async function setStatus(row: UtilityRow, status: string) {
    try {
      const action = status === "undo" ? "undo" : "status";
      await api(`/api/v1/months/${row.id}`, { method: "POST", body: JSON.stringify({ action, status }) });
      refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update the status.");
    }
  }

  async function removeUtility() {
    if (!deleteRow) return;
    setDeleteError(null);
    try {
      await api(`/api/v1/bills/${deleteRow.billId}`, { method: "DELETE" });
      setDeleteRow(null);
      refresh();
    } catch (caught) {
      setDeleteError(caught instanceof ApiError ? caught.message : "Could not delete it.");
    }
  }

  async function archiveUtility() {
    if (!deleteRow) return;
    setDeleteError(null);
    try {
      await api("/api/v1/bills/bulk", { method: "POST", body: JSON.stringify({ ids: [deleteRow.billId], archived: true }) });
      setDeleteRow(null);
      refresh();
    } catch (caught) {
      setDeleteError(caught instanceof ApiError ? caught.message : "Could not archive it.");
    }
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight">Utilities</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Electric, gas, water, and the other household utilities for {formatLongMonth(month)}. A due day keeps the reminders on the Due tab.
          </p>
        </div>
        <Button type="button" className="bg-brand text-white" onClick={() => {
          setEditing(null);
          setTypeQuery("");
          setForm(blankForm(homeId !== "all" ? homeId : properties.find((property) => property.isActive)?.id ?? ""));
          setFormError(null);
          setEditor(true);
        }}>
          Add utility
        </Button>
      </div>

      <div className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <div className="grid gap-1">
          <Label htmlFor="utility-home">Home</Label>
          <select id="utility-home" aria-label="Home" className={selectClass} value={homeId} onChange={(event) => chooseHome(event.target.value)}>
            <option value="all">All homes</option>
            {properties.filter((property) => property.isActive || property.id === homeId).map((property) => (
              <option key={property.id} value={property.id}>{property.isActive ? property.name : `${property.name} (inactive)`}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="utility-month">Month</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="Previous month" onClick={() => { setLoading(true); setMonth((current) => addMonths(`${current}-01`, -1).slice(0, 7)); }}>
              <ChevronLeft className="size-4" />
            </Button>
            <Input id="utility-month" aria-label="Month" type="month" value={month} onChange={(event) => { setLoading(true); setMonth(event.target.value || todayInChicago().slice(0, 7)); }} className="h-11!" />
            <Button type="button" variant="outline" size="icon" aria-label="Next month" onClick={() => { setLoading(true); setMonth((current) => addMonths(`${current}-01`, 1).slice(0, 7)); }}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={showOther} onChange={(event) => { setLoading(true); setShowOther(event.target.checked); }} />
          Show other bills
        </label>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">Due</p>
          <p className="font-display text-3xl">{formatMoney(fromCents(cents.due))}</p>
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">Paid</p>
          <p className="font-display text-3xl">{formatMoney(fromCents(cents.paid))}</p>
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm text-muted-foreground">Remaining</p>
          <p className="font-display text-3xl">{formatMoney(fromCents(cents.due - cents.paid))}</p>
        </div>
      </section>
      <p className="text-sm text-muted-foreground">{homeName} · {formatLongMonth(month)}{showOther ? " · utilities and other bills" : ""}</p>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {archived ? <p className="text-sm text-muted-foreground">This month is archived, so amounts and paid marks stay as they are.</p> : null}

      {loading ? <div className="h-40 animate-pulse rounded-2xl bg-muted" /> : null}

      {!loading && visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">{showOther ? `No bills are due for ${homeName} in ${formatLongMonth(month)}.` : `No utilities are due for ${homeName} in ${formatLongMonth(month)}.`}</p>
          <p className="mt-1 text-sm text-muted-foreground">Add a utility for this home, or turn on Show other bills for mortgage, HOA, insurance, and the rest.</p>
        </div>
      ) : null}

      {showOther ? (
        <Link href="/bills/new" className="text-sm text-primary hover:underline">Add other bill</Link>
      ) : null}

      <ul className="grid gap-3">
        {visible.map((row) => {
          const utility = row.groupName === "Utilities";
          const closed = row.status === "done" || row.status === "skipped" || row.status === "not_applicable";
          return (
            <li
              key={row.id}
              className={cn(
                "grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 md:grid-cols-[1.1fr_1fr_0.8fr_9rem_1fr]",
                row.band === "overdue" && "border-l-4 border-l-[#C2412F] bg-red-50",
                row.band === "due_soon" && "border-l-4 border-l-amber-500 bg-amber-50",
              )}
            >
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="font-medium">{row.categoryName}</p>
                {homeId === "all" ? <p className="text-xs text-muted-foreground">{row.propertyName}</p> : null}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Provider</p>
                <p>{row.payeeName || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due</p>
                <p>{row.dueDate ? formatDisplayDate(row.dueDate) : "—"}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground" htmlFor={`amount-${row.id}`}>This month</label>
                <Input
                  id={`amount-${row.id}`}
                  inputMode="decimal"
                  aria-label={`${row.categoryName} amount`}
                  disabled={archived}
                  placeholder={row.prompt ? "Enter amount" : "0.00"}
                  value={row.id in drafts ? drafts[row.id] : row.amount ?? ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                  onBlur={(event) => void saveAmount(row, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                  }}
                  className="mt-1 h-10!"
                />
              </div>
              <div className="grid content-start gap-2">
                <p className={cn("text-sm font-medium", row.status === "done" && "text-primary")}>{statusLabel(row)}</p>
                <div className="flex flex-wrap gap-2">
                  {row.status === "done" ? (
                    <Button type="button" variant="outline" size="sm" disabled={archived} onClick={() => void setStatus(row, "undo")}>Undo</Button>
                  ) : (
                    <Button type="button" size="sm" className="bg-brand text-white" disabled={archived || closed} onClick={() => openPay(row)}>Mark paid</Button>
                  )}
                  {utility ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => void openEdit(row)}>Edit</Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" nativeButton={false} render={<Link href={`/bills/${row.billId}/edit`} />}>Edit</Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => { setDeleteError(null); setDeleteRow(row); }}>Delete</Button>
                </div>
                {closed ? null : (
                  <div className="flex gap-3 text-xs">
                    <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" disabled={archived} onClick={() => void setStatus(row, "not_applicable")}>N/A</button>
                    <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" disabled={archived} onClick={() => void setStatus(row, "skipped")}>Skip</button>
                  </div>
                )}
                {row.status === "skipped" || row.status === "not_applicable" ? (
                  <button type="button" className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline" disabled={archived} onClick={() => void setStatus(row, "not_done")}>Reopen</button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={editor} onOpenChange={setEditor}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit utility" : "Add utility"}</DialogTitle>
            <DialogDescription>The utility type and a due day are required. Everything else can wait.</DialogDescription>
          </DialogHeader>
          <form
            id="utility-form"
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveUtility();
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor="utility-type">Utility type</Label>
              <Input id="utility-type" list="utility-types" value={typeQuery} onChange={(event) => setTypeQuery(event.target.value)} placeholder="Electric, Gas, Water…" required className="h-11!" />
              <datalist id="utility-types">
                {types.map((type) => <option key={type.id} value={type.name} />)}
              </datalist>
              {typeQuery.trim() && !matchedType ? (
                <p className="text-xs text-muted-foreground">“{typeQuery.trim()}” will be added as a new utility type.</p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="utility-provider">Provider</Label>
                <Input id="utility-provider" list="utility-providers" value={form.payeeName} onChange={(event) => setForm({ ...form, payeeName: event.target.value })} placeholder="Optional" className="h-11!" />
                <datalist id="utility-providers">
                  {providers.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="utility-property">Home</Label>
                <MasterSelect id="utility-property" table="homes" value={form.propertyId} onChange={(value) => setForm({ ...form, propertyId: value })} required />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.oneTime} onChange={(event) => setForm({ ...form, oneTime: event.target.checked })} />
              One-time charge
            </label>
            {form.oneTime ? (
              <div className="grid gap-1">
                <Label htmlFor="utility-due-date">Due date</Label>
                <Input id="utility-due-date" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} required className="h-11!" />
              </div>
            ) : (
              <div className="grid gap-1">
                <Label htmlFor="utility-due-day">Due day of month</Label>
                <Input id="utility-due-day" inputMode="numeric" value={form.dueDay} onChange={(event) => setForm({ ...form, dueDay: event.target.value })} placeholder="1–31" required className="h-11!" />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="utility-kind">Amount</Label>
                <select id="utility-kind" className={selectClass} value={form.amountKind} onChange={(event) => setForm({ ...form, amountKind: event.target.value === "fixed" ? "fixed" : "variable" })}>
                  <option value="variable">Varies each month</option>
                  <option value="fixed">Fixed</option>
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="utility-usual">Usual amount</Label>
                <Input id="utility-usual" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="Optional" className="h-11!" />
              </div>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="utility-mode">Autopay / payment</Label>
              <MasterSelect id="utility-mode" table="payment-modes" value={form.paymentMode} onChange={(value) => setForm({ ...form, paymentMode: value })} valueField="key" creatable={false} emptyLabel="Not set" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="utility-notes">Notes</Label>
              <textarea id="utility-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="min-h-20 rounded-lg border border-border p-2 text-sm" />
            </div>
            {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditor(false)}>Cancel</Button>
              <Button type="submit" className="bg-brand text-white" disabled={saving}>{saving ? "Saving…" : "Save utility"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(payRow)} onOpenChange={(open) => { if (!open) setPayRow(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark paid</DialogTitle>
            <DialogDescription>
              {payRow ? `${payRow.categoryName}${payRow.payeeName ? ` · ${payRow.payeeName}` : ""}` : "Confirm the amount and the date it was paid."}
            </DialogDescription>
          </DialogHeader>
          <form
            id="mark-paid-form"
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void markPaid(Boolean(payWarning));
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor="paid-amount">Amount</Label>
              <Input id="paid-amount" inputMode="decimal" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} placeholder="Enter amount" required className="h-11!" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="paid-date">Paid date</Label>
              <Input id="paid-date" type="date" value={payDate} onChange={(event) => setPayDate(event.target.value)} required className="h-11!" />
            </div>
            {payError ? <p role="alert" className="text-sm text-destructive">{payError}</p> : null}
            {payWarning ? <p className="text-sm text-muted-foreground">{payWarning}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayRow(null)}>Cancel</Button>
              <Button type="submit" className="bg-brand text-white">{payWarning ? "Confirm and mark paid" : "Mark paid"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteRow)} onOpenChange={(open) => { if (!open) setDeleteRow(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {deleteRow?.groupName === "Utilities" ? "utility" : "bill"}?</DialogTitle>
            <DialogDescription>
              Deleting removes its history. Archive keeps the history and hides it from this list.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? <p role="alert" className="text-sm text-destructive">{deleteError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteRow(null)}>Cancel</Button>
            <Button type="button" variant="outline" onClick={() => void archiveUtility()}>Archive instead</Button>
            <Button type="button" variant="destructive" onClick={() => void removeUtility()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
