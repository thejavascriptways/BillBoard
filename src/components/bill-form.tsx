"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api-client";
import type { BillDTO } from "@/lib/bill-types";
import { todayInChicago } from "@/lib/dates";
import type { CategoryDTO, PaymentMethodDTO, PropertyDTO } from "@/lib/types";
import type { PayeeDTO } from "@/lib/bill-types";

const selectClass = "h-12 w-full rounded-lg border border-border bg-background px-3 text-base";

export function BillForm({ billId }: { billId?: string }) {
  const router = useRouter();
  const [properties, setProperties] = useState<PropertyDTO[]>([]);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [methods, setMethods] = useState<PaymentMethodDTO[]>([]);
  const [payees, setPayees] = useState<PayeeDTO[]>([]);
  const [name, setName] = useState("");
  const [payeeId, setPayeeId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [last4, setLast4] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [amountKind, setAmountKind] = useState("fixed");
  const [anchorDate, setAnchorDate] = useState(todayInChicago());
  const [frequency, setFrequency] = useState("monthly");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [lastDay, setLastDay] = useState(false);
  const [interval, setInterval] = useState("1");
  const [unit, setUnit] = useState("months");
  const [endDate, setEndDate] = useState("");
  const [endCount, setEndCount] = useState("");
  const [shiftWeekends, setShiftWeekends] = useState("none");
  const [autopay, setAutopay] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [notes, setNotes] = useState("");
  const [portalUrl, setPortalUrl] = useState("");
  const [reminders, setReminders] = useState<number[]>([7, 3, 1, 0]);
  const [paymentMode, setPaymentMode] = useState("manual");
  const [dueOnNote, setDueOnNote] = useState("");
  const [personId, setPersonId] = useState("");
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [muted, setMuted] = useState(false);
  const [lastBusiness, setLastBusiness] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ properties: PropertyDTO[] }>("/api/v1/properties"),
      api<{ categories: CategoryDTO[] }>("/api/v1/categories"),
      api<{ paymentMethods: PaymentMethodDTO[] }>("/api/v1/payment-methods"),
      api<{ payees: PayeeDTO[] }>("/api/v1/payees"),
      api<{ people: { id: string; name: string }[] }>("/api/v1/people"),
    ])
      .then(([propertyData, categoryData, methodData, payeeData, peopleData]) => {
        const openProperties = propertyData.properties.filter((item) => !item.archived);
        const openCategories = categoryData.categories.filter((item) => !item.archived);
        setProperties(openProperties);
        setCategories(openCategories);
        setMethods(methodData.paymentMethods.filter((item) => !item.archived));
        setPayees(payeeData.payees.filter((item) => !item.archived));
        setPeople(peopleData.people);
        setPropertyId((current) => current || openProperties[0]?.id || "");
        setCategoryId((current) => current || openCategories[0]?.id || "");
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load the form."));
  }, []);

  useEffect(() => {
    if (!billId) return;
    api<{ bill: BillDTO }>(`/api/v1/bills/${billId}`)
      .then(({ bill }) => {
        setName(bill.name);
        setPayeeId(bill.payeeId);
        setPropertyId(bill.propertyId);
        setCategoryId(bill.categoryId);
        setAmount(bill.amount);
        setAmountKind(bill.amountKind);
        setAnchorDate(bill.anchorDate);
        setFrequency(bill.frequency);
        setLastDay(bill.dayOfMonth === -1);
        setDayOfMonth(bill.dayOfMonth && bill.dayOfMonth > 0 ? String(bill.dayOfMonth) : "");
        setInterval(String(bill.interval));
        setUnit(bill.unit);
        setEndDate(bill.endDate ?? "");
        setEndCount(bill.endCount ? String(bill.endCount) : "");
        setShiftWeekends(bill.shiftWeekends);
        setAutopay(bill.autopay);
        setPaymentMethodId(bill.paymentMethodId ?? "");
        setNotes(bill.notes ?? "");
        setPortalUrl(bill.portalUrl ?? "");
        setReminders(bill.reminderDays);
        setPaymentMode(bill.paymentMode);
        setDueOnNote(bill.dueOnNote ?? "");
        setPersonId(bill.personId ?? "");
        setMuted(bill.muted);
        setLastBusiness(bill.dayOfMonth === -2);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not load the bill."));
  }, [billId]);

  function toggleReminder(day: number) {
    setReminders((current) => (current.includes(day) ? current.filter((item) => item !== day) : [...current, day].sort((a, b) => b - a)));
  }

  async function save() {
    setPending(true);
    setError(null);
    const body = {
      name,
      payeeId: payeeId || null,
      payeeName: payeeId ? null : payeeName,
      accountLast4: last4 || null,
      propertyId,
      categoryId,
      amount,
      amountKind,
      anchorDate,
      frequency,
      interval: Number(interval || 1),
      unit,
      dayOfMonth: lastBusiness ? -2 : lastDay ? -1 : dayOfMonth ? Number(dayOfMonth) : null,
      paymentMode,
      dueOnNote,
      dueRuleKind: lastBusiness ? "last_business_day" : lastDay ? "last_day" : frequency === "monthly" ? "day_of_month" : "schedule",
      personId: personId || null,
      muted,
      endDate: endDate || null,
      endCount: endCount ? Number(endCount) : null,
      shiftWeekends,
      autopay,
      paymentMethodId: paymentMethodId || null,
      notes,
      portalUrl,
      reminderDays: reminders,
    };
    try {
      const result = billId
        ? await api<{ bill: BillDTO }>(`/api/v1/bills/${billId}`, { method: "PATCH", body: JSON.stringify(body) })
        : await api<{ bill: BillDTO }>("/api/v1/bills", { method: "POST", body: JSON.stringify(body) });
      router.push(`/bills/${result.bill.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save the bill.");
      setPending(false);
    }
  }

  return (
    <form
      id="bill-form"
      className="mx-auto grid max-w-2xl gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div>
        <h1 className="font-display text-4xl tracking-tight">{billId ? "Edit bill" : "Quick add bill"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Name, home, amount, and the first due date. Recurrence fills in the dates after that.</p>
      </div>
      <Field label="Bill name" id="bill-name">
        <Input id="bill-name" value={name} onChange={(event) => setName(event.target.value)} className="h-12! text-base" required />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Payee" id="bill-payee">
          <select id="bill-payee" className={selectClass} value={payeeId} onChange={(event) => setPayeeId(event.target.value)}>
            <option value="">New payee…</option>
            {payees.map((payee) => (
              <option key={payee.id} value={payee.id}>
                {payee.name}
              </option>
            ))}
          </select>
        </Field>
        {payeeId ? null : (
          <Field label="New payee name" id="bill-payee-name">
            <Input id="bill-payee-name" value={payeeName} onChange={(event) => setPayeeName(event.target.value)} className="h-12! text-base" />
          </Field>
        )}
      </div>
      {payeeId ? null : (
        <Field label="Account last 4" id="bill-last4">
          <Input id="bill-last4" inputMode="numeric" value={last4} onChange={(event) => setLast4(event.target.value)} placeholder="Optional" className="h-12! text-base" />
        </Field>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Property" id="bill-property">
          <select id="bill-property" className={selectClass} value={propertyId} onChange={(event) => setPropertyId(event.target.value)} required>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category" id="bill-category">
          <select id="bill-category" className={selectClass} value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Amount" id="bill-amount">
          <Input id="bill-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-12! text-base" required />
        </Field>
        <Field label="Amount type" id="bill-kind">
          <select id="bill-kind" className={selectClass} value={amountKind} onChange={(event) => setAmountKind(event.target.value)}>
            <option value="fixed">Fixed</option>
            <option value="variable">Variable</option>
            <option value="estimated">Estimated</option>
          </select>
        </Field>
        <Field label="First due date" id="bill-due">
          <Input id="bill-due" type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} className="h-12! text-base" required />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Repeats" id="bill-frequency">
          <select id="bill-frequency" className={selectClass} value={frequency} onChange={(event) => setFrequency(event.target.value)}>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="semiannual">Twice a year</option>
            <option value="annual">Yearly</option>
            <option value="every_n">Every N…</option>
            <option value="once">One time</option>
          </select>
        </Field>
        <Field label="Payment method" id="bill-method">
          <select id="bill-method" className={selectClass} value={paymentMethodId} onChange={(event) => setPaymentMethodId(event.target.value)}>
            <option value="">None</option>
            {methods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {frequency === "every_n" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Every" id="bill-interval">
            <Input id="bill-interval" inputMode="numeric" value={interval} onChange={(event) => setInterval(event.target.value)} className="h-12! text-base" />
          </Field>
          <Field label="Unit" id="bill-unit">
            <select id="bill-unit" className={selectClass} value={unit} onChange={(event) => setUnit(event.target.value)}>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
          </Field>
        </div>
      ) : null}
      {frequency === "monthly" || frequency === "quarterly" || frequency === "semiannual" || frequency === "annual" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Day of month" id="bill-day">
            <Input id="bill-day" inputMode="numeric" value={dayOfMonth} disabled={lastDay} onChange={(event) => setDayOfMonth(event.target.value)} placeholder="Same as the first due date" className="h-12! text-base" />
          </Field>
          <label className="mt-7 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lastDay} onChange={(event) => setLastDay(event.target.checked)} />
            Last day of the month
          </label>
          <label className="mt-7 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lastBusiness} onChange={(event) => setLastBusiness(event.target.checked)} />
            Last business day
          </label>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Payment mode" id="bill-mode">
          <select id="bill-mode" className={selectClass} value={paymentMode} onChange={(event) => setPaymentMode(event.target.value)}>
            <option value="manual">Manual</option>
            <option value="auto">Auto paid</option>
            <option value="check">By check</option>
            <option value="paycheck">Paid in paycheck</option>
            <option value="covered">Paid through another bill</option>
          </select>
        </Field>
        <Field label="Person" id="bill-person">
          <select id="bill-person" className={selectClass} value={personId} onChange={(event) => setPersonId(event.target.value)}>
            <option value="">None</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Due on note" id="bill-due-on">
        <Input id="bill-due-on" value={dueOnNote} onChange={(event) => setDueOnNote(event.target.value)} placeholder="6th of every month (auto paid)" className="h-12! text-base" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="End date" id="bill-end">
          <Input id="bill-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-12! text-base" />
        </Field>
        <Field label="Or stop after" id="bill-count">
          <Input id="bill-count" inputMode="numeric" value={endCount} onChange={(event) => setEndCount(event.target.value)} placeholder="Count" className="h-12! text-base" />
        </Field>
        <Field label="Weekends" id="bill-shift">
          <select id="bill-shift" className={selectClass} value={shiftWeekends} onChange={(event) => setShiftWeekends(event.target.value)}>
            <option value="none">Keep the date</option>
            <option value="earlier">Shift to the previous business day</option>
            <option value="later">Shift to the next business day</option>
          </select>
        </Field>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Reminders</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {[7, 3, 1, 0].map((day) => (
            <label key={day} className="flex items-center gap-2">
              <input type="checkbox" checked={reminders.includes(day)} onChange={() => toggleReminder(day)} />
              {day === 0 ? "Due day" : `${day} day${day === 1 ? "" : "s"} before`}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Leave these unchecked to use the household defaults in Settings.</p>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={autopay} onChange={(event) => setAutopay(event.target.checked)} />
        Autopay is on. It stays pending until you confirm the charge.
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />
        Mute reminders for this bill
      </label>
      <Field label="Portal link" id="bill-portal">
        <Input id="bill-portal" value={portalUrl} onChange={(event) => setPortalUrl(event.target.value)} placeholder="https://" className="h-12! text-base" />
      </Field>
      <Field label="Notes" id="bill-notes">
        <Textarea id="bill-notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24 text-base" />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" className="h-11!" disabled={pending}>
          {pending ? "Saving…" : "Save bill"}
        </Button>
        <Link href={billId ? `/bills/${billId}` : "/bills"} className="inline-flex h-11 items-center rounded-lg px-3 text-sm">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
