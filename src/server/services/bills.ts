import { Prisma, type Bill, type PaymentMethod } from "@prisma/client";

import { parseDueOn, type DueRuleKind, type PaymentMode } from "@/core/due-on";
import { events } from "@/core/events";
import { FREQUENCIES, generateDueDates, type Frequency, type IntervalUnit, type WeekendShift } from "@/core/recurrence";
import { occurrenceStatus } from "@/core/status";
import { dateRejection } from "@/core/validation";
import type {
  AmountKind,
  BillDTO,
  OccurrenceDTO,
  PayeeDTO,
  PaymentDTO,
} from "@/lib/bill-types";
import { addDays, formatIsoDate, isIsoDate, parseIsoDate, todayInChicago } from "@/lib/dates";
import { fromCents, parseAmountInput, toCents } from "@/lib/money";
import { prisma } from "@/server/db";
import { ServiceError, fieldError } from "@/server/errors";
import { getHousehold } from "@/server/services/household";
import { getPrefs } from "@/server/services/prefs";
import { cleanLast4, cleanOptional, cleanRequired } from "@/server/text";

const HORIZON_DAYS = 400;
const SHIFTS = ["none", "earlier", "later"] as const;
const KINDS = ["fixed", "variable", "estimated"] as const;
const UNITS = ["days", "weeks", "months"] as const;

type BillGraph = Bill & {
  payee: { id: string; name: string } | null;
  property: { id: string; name: string };
  category: { id: string; name: string };
  occurrences: { dueDate: Date; skippedAt: Date | null; payments: { amount: Prisma.Decimal; undoneAt: Date | null }[] }[];
};

function money(cents: number): string {
  return fromCents(cents);
}

function asCents(value: Prisma.Decimal | string): number {
  return toCents(typeof value === "string" ? value : value.toFixed(2));
}

function requireDate(field: string, value: string): Date {
  const rejected = dateRejection(value);
  if (rejected) throw fieldError(field, rejected);
  return parseIsoDate(value);
}

function optionalDate(field: string, value: string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  return requireDate(field, value);
}

function requireFrequency(value: string): Frequency {
  if ((FREQUENCIES as readonly string[]).includes(value)) return value as Frequency;
  throw fieldError("frequency", "Choose how often this bill repeats.");
}

function requireKind(value: string): AmountKind {
  if ((KINDS as readonly string[]).includes(value)) return value as AmountKind;
  throw fieldError("amountKind", "Choose fixed, variable, or estimated.");
}

function requireShift(value: string | undefined): WeekendShift {
  if (!value) return "none";
  if ((SHIFTS as readonly string[]).includes(value)) return value as WeekendShift;
  throw fieldError("shiftWeekends", "Choose how weekends should move.");
}

function requireUnit(value: string | undefined): IntervalUnit {
  if (!value || (UNITS as readonly string[]).includes(value)) return (value as IntervalUnit) || "months";
  throw fieldError("unit", "Choose days, weeks, or months.");
}

function cleanReminders(days: number[] | undefined): number[] {
  if (!days) return [];
  const unique = [...new Set(days.map((day) => Math.trunc(day)))].filter((day) => day >= 0 && day <= 90);
  return unique.sort((a, b) => b - a);
}

function cleanDay(value: number | null | undefined): number | null {
  if (value == null) return null;
  const day = Math.trunc(value);
  if (day === -1 || day === -2 || (day >= 1 && day <= 31)) return day;
  throw fieldError("dayOfMonth", "Use a day from 1 to 31, the last day, or the last business day.");
}

const MODES = ["auto", "manual", "check", "paycheck", "covered"] as const;
const RULES = [
  "schedule",
  "day_of_month",
  "last_day",
  "last_business_day",
  "every_n_months",
  "quarterly",
  "semiannual",
  "annual",
  "fixed_range",
  "usage",
  "balance",
  "on_demand",
  "event",
  "statement",
] as const;
const UNSCHEDULED = new Set(["usage", "balance", "on_demand", "event", "statement"]);

function requireMode(value: string): PaymentMode {
  if ((MODES as readonly string[]).includes(value)) return value as PaymentMode;
  throw fieldError("paymentMode", "Choose a payment mode.");
}

function requireRule(value: string): DueRuleKind {
  if ((RULES as readonly string[]).includes(value)) return value as DueRuleKind;
  throw fieldError("dueRuleKind", "Choose a due-on rule.");
}

function portal(value: string | null | undefined): string | null {
  if (value == null || value.trim() === "") return null;
  const trimmed = value.trim();
  if (trimmed.length > 300) throw fieldError("portalUrl", "That link is too long.");
  if (!/^https?:\/\//i.test(trimmed)) throw fieldError("portalUrl", "Portal links start with https://.");
  return trimmed;
}

export function toBillDTO(bill: BillGraph): BillDTO {
  const open = bill.occurrences
    .filter((row) => {
      if (row.skippedAt) return false;
      const paid = row.payments.filter((payment) => !payment.undoneAt).reduce((sum, payment) => sum + asCents(payment.amount), 0);
      const expected = bill.amount ? asCents(bill.amount) : 0;
      return paid < expected || row.payments.length === 0;
    })
    .map((row) => formatIsoDate(row.dueDate))
    .sort();
  return {
    id: bill.id,
    name: bill.name,
    payeeId: bill.payee?.id ?? null,
    payeeName: bill.payee?.name ?? "",
    propertyId: bill.property.id,
    propertyName: bill.property.name,
    categoryId: bill.category.id,
    categoryName: bill.category.name,
    amountKind: bill.amountKind,
    amount: bill.amount ? bill.amount.toFixed(2) : null,
    anchorDate: formatIsoDate(bill.anchorDate),
    autopay: bill.autopay,
    paymentMethodId: bill.paymentMethodId,
    notes: bill.notes,
    portalUrl: bill.portalUrl,
    frequency: bill.frequency,
    interval: bill.intervalN,
    unit: bill.intervalUnit,
    dayOfMonth: bill.dayOfMonth,
    endDate: bill.endDate ? formatIsoDate(bill.endDate) : null,
    endCount: bill.endCount,
    shiftWeekends: bill.shiftWeekends,
    reminderDays: bill.reminderDays,
    graceDays: bill.graceDays,
    paymentMode: bill.paymentMode,
    coveredByBillId: bill.coveredByBillId,
    dueOnNote: bill.dueOnNote,
    dueRuleKind: bill.dueRuleKind,
    sessionEveryN: bill.sessionEveryN,
    sessionCount: bill.sessionCount,
    personId: bill.personId,
    muted: bill.muted,
    archived: bill.archivedAt != null,
    nextDue: open[0] ?? null,
  };
}

const billInclude = {
  payee: true,
  property: true,
  category: true,
  occurrences: { include: { payments: true } },
} as const;

async function loadBill(id: string) {
  const household = await getHousehold();
  const bill = await prisma.bill.findFirst({
    where: { id, householdId: household.id },
    include: billInclude,
  });
  if (!bill) throw new ServiceError("Bill not found.", 404, "not_found");
  return { household, bill };
}

export async function materializeBill(billId: string, horizon: string): Promise<void> {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: { occurrences: { include: { payments: true } } },
  });
  if (!bill) return;
  if (UNSCHEDULED.has(bill.dueRuleKind)) {
    await prisma.bill.update({ where: { id: bill.id }, data: { generatedThrough: parseIsoDate(horizon) } });
    return;
  }
  if (bill.generatedThrough && formatIsoDate(bill.generatedThrough) >= addDays(horizon, -100)) return;
  const cycles = generateDueDates(
    {
      frequency: bill.frequency,
      interval: bill.intervalN,
      unit: bill.intervalUnit,
      dayOfMonth: bill.dayOfMonth,
      anchorDate: formatIsoDate(bill.anchorDate),
      endDate: bill.endDate ? formatIsoDate(bill.endDate) : null,
      endCount: bill.endCount,
      shift: bill.shiftWeekends,
    },
    horizon,
  );
  const keep = new Set(cycles.map((cycle) => cycle.index));
  for (const cycle of cycles) {
    const existing = bill.occurrences.find((row) => row.cycleIndex === cycle.index);
    const expected = new Prisma.Decimal(bill.amount ? bill.amount.toFixed(2) : "0.00");
    if (!existing) {
      await prisma.occurrence.create({
        data: {
          householdId: bill.householdId,
          billId: bill.id,
          propertyId: bill.propertyId,
          cycleIndex: cycle.index,
          dueDate: parseIsoDate(cycle.dueDate),
          expectedAmount: expected,
        },
      });
      continue;
    }
    const paid = existing.payments.some((payment) => !payment.undoneAt);
    if (existing.skippedAt || existing.originalDueDate || paid) continue;
    await prisma.occurrence.update({
      where: { id: existing.id },
      data: {
        dueDate: parseIsoDate(cycle.dueDate),
        expectedAmount: expected,
        propertyId: bill.propertyId,
      },
    });
  }
  for (const existing of bill.occurrences) {
    if (keep.has(existing.cycleIndex)) continue;
    const paid = existing.payments.some((payment) => !payment.undoneAt);
    if (existing.skippedAt || paid) continue;
    await prisma.occurrence.delete({ where: { id: existing.id } });
  }
  await prisma.bill.update({
    where: { id: bill.id },
    data: { generatedThrough: parseIsoDate(horizon) },
  });
}

async function ensureHorizon(householdId: string, today: string): Promise<void> {
  const horizon = addDays(today, HORIZON_DAYS);
  const bills = await prisma.bill.findMany({
    where: { householdId, archivedAt: null },
    select: { id: true, generatedThrough: true },
  });
  for (const bill of bills) {
    if (bill.generatedThrough && formatIsoDate(bill.generatedThrough) >= addDays(horizon, -100)) continue;
    await materializeBill(bill.id, horizon);
  }
}

async function resolvePayee(
  householdId: string,
  input: { payeeId?: string | null; payeeName?: string | null; categoryId?: string | null; accountLast4?: string | null },
  options?: { optional?: boolean },
) {
  if (input.payeeId) {
    const payee = await prisma.payee.findFirst({ where: { id: input.payeeId, householdId } });
    if (!payee) throw fieldError("payeeId", "Choose a payee.");
    return payee;
  }
  const trimmed = input.payeeName?.trim() ?? "";
  if (!trimmed) {
    if (options?.optional) return null;
    throw fieldError("payeeName", "Enter a payee.");
  }
  const name = cleanRequired("payeeName", trimmed, "payee", 80);
  const existing = await prisma.payee.findFirst({
    where: { householdId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) return existing;
  return prisma.payee.create({
    data: {
      householdId,
      name,
      categoryId: input.categoryId ?? null,
      accountLast4: cleanLast4(input.accountLast4),
    },
  });
}

async function requireOpenProperty(householdId: string, propertyId: string) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, householdId } });
  if (!property) throw fieldError("propertyId", "Choose a property.");
  if (property.archivedAt || property.status === "archived") throw fieldError("propertyId", "That property is archived.");
  return property;
}

async function requireCategory(householdId: string, categoryId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, householdId } });
  if (!category || category.archivedAt) throw fieldError("categoryId", "Choose a category.");
  return category;
}

async function requireMethod(householdId: string, id: string | null | undefined): Promise<PaymentMethod | null> {
  if (!id) return null;
  const method = await prisma.paymentMethod.findFirst({ where: { id, householdId } });
  if (!method || method.archivedAt) throw fieldError("paymentMethodId", "Choose a payment method.");
  return method;
}

export type BillWrite = {
  name: string;
  payeeId?: string | null;
  payeeName?: string | null;
  accountLast4?: string | null;
  propertyId: string;
  categoryId: string;
  amount?: string | number | null;
  amountKind?: string;
  amountOptional?: boolean;
  payeeOptional?: boolean;
  anchorDate: string;
  autopay?: boolean;
  paymentMethodId?: string | null;
  notes?: string | null;
  portalUrl?: string | null;
  frequency?: string;
  interval?: number;
  unit?: string;
  dayOfMonth?: number | null;
  endDate?: string | null;
  endCount?: number | null;
  shiftWeekends?: string;
  reminderDays?: number[];
  graceDays?: number;
  paymentMode?: string | null;
  coveredByBillId?: string | null;
  dueOnNote?: string | null;
  dueRuleKind?: string | null;
  sessionEveryN?: number | null;
  personId?: string | null;
  muted?: boolean;
  balanceThreshold?: string | number | null;
  accountBalance?: string | number | null;
};

function ruleFields(input: BillWrite) {
  const parsed = input.dueOnNote ? parseDueOn(input.dueOnNote) : null;
  return {
    frequency: requireFrequency(input.frequency ?? parsed?.frequency ?? "monthly"),
    intervalN: Math.max(1, Math.trunc(input.interval ?? parsed?.interval ?? 1)),
    intervalUnit: requireUnit(input.unit ?? parsed?.unit),
    dayOfMonth: input.dayOfMonth !== undefined ? cleanDay(input.dayOfMonth) : cleanDay(parsed?.dayOfMonth),
    paymentMode: requireMode(input.paymentMode ?? parsed?.paymentMode ?? (input.autopay ? "auto" : "manual")),
    autopay: input.autopay ?? parsed?.autopay ?? false,
    dueRuleKind: requireRule(input.dueRuleKind ?? parsed?.dueRuleKind ?? "schedule"),
    sessionEveryN: input.sessionEveryN ?? parsed?.sessionEveryN ?? null,
    dueOnNote: cleanOptional("dueOnNote", input.dueOnNote, 200),
  };
}

function amountCents(input: string | number): number {
  const parsed = parseAmountInput(input);
  if ("error" in parsed) throw fieldError("amount", parsed.error);
  return parsed.cents;
}

function amountDecimal(input: string | number | null | undefined, optional: boolean): Prisma.Decimal | null {
  if (input == null || (typeof input === "string" && input.trim() === "")) {
    if (optional) return null;
    throw fieldError("amount", "Enter an amount greater than zero.");
  }
  return new Prisma.Decimal(money(amountCents(input)));
}

export async function createBill(input: BillWrite): Promise<BillDTO> {
  const household = await getHousehold();
  const name = cleanRequired("name", input.name, "bill name", 80);
  const property = await requireOpenProperty(household.id, input.propertyId);
  const category = await requireCategory(household.id, input.categoryId);
  const payee = await resolvePayee(household.id, input, { optional: Boolean(input.payeeOptional) });
  const method = await requireMethod(household.id, input.paymentMethodId);
  const amount = amountDecimal(input.amount, Boolean(input.amountOptional));
  const anchor = requireDate("anchorDate", input.anchorDate);
  const endDate = optionalDate("endDate", input.endDate);
  const endCount = input.endCount == null || input.endCount === 0 ? null : Math.trunc(input.endCount);
  if (endCount != null && (endCount < 1 || endCount > 500)) throw fieldError("endCount", "Use a count from 1 to 500.");
  const created = await prisma.bill.create({
    data: {
      householdId: household.id,
      name,
      payeeId: payee?.id ?? null,
      propertyId: property.id,
      categoryId: category.id,
      amountKind: requireKind(input.amountKind ?? "fixed"),
      amount,
      anchorDate: anchor,
      paymentMethodId: method?.id ?? null,
      notes: cleanOptional("notes", input.notes, 500),
      portalUrl: portal(input.portalUrl),
      ...ruleFields(input),
      endDate,
      endCount,
      shiftWeekends: requireShift(input.shiftWeekends),
      reminderDays: cleanReminders(input.reminderDays),
      graceDays: Math.min(60, Math.max(0, Math.trunc(input.graceDays ?? 0))),
      coveredByBillId: input.coveredByBillId || null,
      personId: input.personId || null,
      muted: Boolean(input.muted),
    },
    include: billInclude,
  });
  await materializeBill(created.id, addDays(todayInChicago(), HORIZON_DAYS));
  await prisma.auditLog.create({
    data: { householdId: household.id, entityType: "bill", entityId: created.id, action: "created", summary: `Added ${name}.` },
  });
  events.emit("bill.created", { billId: created.id, name: created.name });
  const fresh = await loadBill(created.id);
  return toBillDTO(fresh.bill);
}

export async function updateBill(id: string, input: BillWrite): Promise<BillDTO> {
  const { bill } = await loadBill(id);
  const household = await getHousehold();
  const name = cleanRequired("name", input.name, "bill name", 80);
  const property = await requireOpenProperty(household.id, input.propertyId);
  const category = await requireCategory(household.id, input.categoryId);
  const payee = await resolvePayee(
    household.id,
    input.payeeOptional ? { payeeId: input.payeeId, payeeName: input.payeeName, categoryId: input.categoryId } : { ...input, payeeId: input.payeeId ?? bill.payeeId },
    { optional: Boolean(input.payeeOptional) },
  );
  const method = await requireMethod(household.id, input.paymentMethodId);
  const amount = amountDecimal(input.amount, Boolean(input.amountOptional));
  await prisma.bill.update({
    where: { id },
    data: {
      name,
      payeeId: payee?.id ?? null,
      propertyId: property.id,
      categoryId: category.id,
      amountKind: requireKind(input.amountKind ?? bill.amountKind),
      amount,
      anchorDate: requireDate("anchorDate", input.anchorDate),
      paymentMethodId: method?.id ?? null,
      notes: cleanOptional("notes", input.notes, 500),
      portalUrl: portal(input.portalUrl),
      ...ruleFields({ ...input, frequency: input.frequency ?? bill.frequency, interval: input.interval ?? bill.intervalN, unit: input.unit ?? bill.intervalUnit }),
      endDate: optionalDate("endDate", input.endDate),
      endCount: input.endCount == null ? null : Math.trunc(input.endCount),
      shiftWeekends: requireShift(input.shiftWeekends),
      reminderDays: cleanReminders(input.reminderDays),
      graceDays: Math.min(60, Math.max(0, Math.trunc(input.graceDays ?? 0))),
      coveredByBillId: input.coveredByBillId || null,
      personId: input.personId || null,
      muted: Boolean(input.muted),
      generatedThrough: null,
    },
  });
  await materializeBill(id, addDays(todayInChicago(), HORIZON_DAYS));
  events.emit("bill.updated", { billId: id });
  const fresh = await loadBill(id);
  return toBillDTO(fresh.bill);
}

export async function archiveBills(ids: string[], archived: boolean): Promise<number> {
  const household = await getHousehold();
  const result = await prisma.bill.updateMany({
    where: { householdId: household.id, id: { in: ids } },
    data: { archivedAt: archived ? new Date() : null },
  });
  for (const id of ids) events.emit("bill.archived", { billId: id });
  return result.count;
}

export async function deleteBill(id: string): Promise<void> {
  const { bill } = await loadBill(id);
  const payments = await prisma.payment.count({ where: { billId: id, undoneAt: null } });
  if (payments > 0) {
    throw new ServiceError("This bill has payments. Archive it to keep the history.", 409, "in_use");
  }
  await prisma.bill.delete({ where: { id: bill.id } });
}

export async function duplicateBill(id: string): Promise<BillDTO> {
  const { bill } = await loadBill(id);
  return createBill({
    name: `Copy of ${bill.name}`.slice(0, 80),
    payeeId: bill.payeeId,
    payeeOptional: bill.payeeId == null,
    propertyId: bill.propertyId,
    categoryId: bill.categoryId,
    amount: bill.amount ? bill.amount.toFixed(2) : "",
    amountOptional: bill.amount == null,
    amountKind: bill.amountKind,
    anchorDate: formatIsoDate(bill.anchorDate),
    autopay: bill.autopay,
    paymentMethodId: bill.paymentMethodId,
    notes: bill.notes,
    portalUrl: bill.portalUrl,
    frequency: bill.frequency,
    interval: bill.intervalN,
    unit: bill.intervalUnit,
    dayOfMonth: bill.dayOfMonth,
    endDate: bill.endDate ? formatIsoDate(bill.endDate) : null,
    endCount: bill.endCount,
    shiftWeekends: bill.shiftWeekends,
    reminderDays: bill.reminderDays,
    graceDays: bill.graceDays,
    paymentMode: bill.paymentMode,
    coveredByBillId: bill.coveredByBillId,
    dueOnNote: bill.dueOnNote,
    dueRuleKind: bill.dueRuleKind,
    sessionEveryN: bill.sessionEveryN,
    personId: bill.personId,
    muted: bill.muted,
  });
}

export async function listBills(propertyId?: string | null): Promise<BillDTO[]> {
  const household = await getHousehold();
  await ensureHorizon(household.id, todayInChicago());
  const bills = await prisma.bill.findMany({
    where: { householdId: household.id, archivedAt: null, ...(propertyId ? { propertyId } : {}) },
    include: billInclude,
    orderBy: { name: "asc" },
  });
  return bills.map(toBillDTO);
}

export async function getBill(id: string): Promise<BillDTO> {
  const { bill } = await loadBill(id);
  return toBillDTO(bill);
}

type OccurrenceLoaded = {
  id: string;
  billId: string;
  propertyId: string;
  dueDate: Date;
  expectedAmount: Prisma.Decimal;
  skippedAt: Date | null;
  property: { name: string };
  payments: { id: string; amount: Prisma.Decimal; undoneAt: Date | null; paidOn: Date; paymentMethodId: string | null; confirmationNumber: string | null; note: string | null; paymentMethod: { nickname: string; last4: string | null } | null; createdAt: Date }[];
  bill: {
    name: string;
    autopay: boolean;
    graceDays: number;
    archivedAt: Date | null;
    payeeId: string | null;
    categoryId: string;
    payee: { name: string } | null;
    category: { name: string };
    property: { name: string };
  };
};

function presentOccurrence(row: OccurrenceLoaded, today: string, dueSoonDays: number): OccurrenceDTO {
  const paid = row.payments.filter((payment) => !payment.undoneAt).reduce((sum, payment) => sum + asCents(payment.amount), 0);
  const expected = asCents(row.expectedAmount);
  const status = occurrenceStatus({
    dueDate: formatIsoDate(row.dueDate),
    expectedCents: expected,
    paidCents: paid,
    skipped: row.skippedAt != null,
    today,
    dueSoonDays,
    graceDays: row.bill.graceDays,
  });
  return {
    id: row.id,
    billId: row.billId,
    billName: row.bill.name,
    payeeId: row.bill.payeeId ?? "",
    payeeName: row.bill.payee?.name ?? "",
    propertyId: row.propertyId,
    propertyName: row.property.name,
    categoryId: row.bill.categoryId,
    categoryName: row.bill.category.name,
    dueDate: formatIsoDate(row.dueDate),
    expectedAmount: money(expected),
    paidAmount: money(paid),
    remaining: money(Math.max(0, expected - paid)),
    status,
    autopay: row.bill.autopay,
    skipped: row.skippedAt != null,
  };
}

const occurrenceInclude = {
  property: true,
  payments: { include: { paymentMethod: true } },
  bill: { include: { payee: true, category: true, property: true } },
} as const;

export async function queryOccurrences(filters: {
  propertyId?: string | null;
  categoryId?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  q?: string | null;
}): Promise<OccurrenceDTO[]> {
  const household = await getHousehold();
  const today = todayInChicago();
  const prefs = await getPrefs();
  await ensureHorizon(household.id, today);
  const from = filters.from && isIsoDate(filters.from) ? parseIsoDate(filters.from) : parseIsoDate(addDays(today, -120));
  const to = filters.to && isIsoDate(filters.to) ? parseIsoDate(filters.to) : parseIsoDate(addDays(today, HORIZON_DAYS));
  const q = filters.q?.trim();
  const rows = await prisma.occurrence.findMany({
    where: {
      householdId: household.id,
      dueDate: { gte: from, lte: to },
      ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
      bill: {
        archivedAt: null,
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { payee: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
    },
    include: occurrenceInclude,
    orderBy: [{ dueDate: "asc" }, { bill: { name: "asc" } }],
    take: 2000,
  });
  const presented = rows.map((row) => presentOccurrence(row, today, prefs.dueSoonDays));
  if (!filters.status) return presented;
  return presented.filter((row) => row.status === filters.status);
}

async function loadOccurrence(id: string) {
  const household = await getHousehold();
  const row = await prisma.occurrence.findFirst({
    where: { id, householdId: household.id },
    include: occurrenceInclude,
  });
  if (!row) throw new ServiceError("That due date was not found.", 404, "not_found");
  return { household, row };
}

async function ensurePaymentPayee(householdId: string, billId: string, name: string): Promise<string> {
  const payee = await prisma.payee.create({
    data: { householdId, name: name.trim().slice(0, 80) || "Utility" },
  });
  await prisma.bill.update({ where: { id: billId }, data: { payeeId: payee.id } });
  return payee.id;
}

export async function payOccurrence(
  id: string,
  input: { amount?: string | number | null; paidOn?: string | null; paymentMethodId?: string | null; confirmationNumber?: string | null; note?: string | null },
): Promise<OccurrenceDTO> {
  const { household, row } = await loadOccurrence(id);
  if (row.skippedAt) throw new ServiceError("This occurrence was skipped.", 409, "skipped");
  const prefs = await getPrefs();
  const presented = presentOccurrence(row, todayInChicago(), prefs.dueSoonDays);
  if (presented.status === "paid") throw new ServiceError("This occurrence is already paid.", 409, "paid");
  const cents = input.amount == null || input.amount === "" ? toCents(presented.remaining) : amountCents(input.amount);
  if (cents > toCents(presented.remaining)) throw fieldError("amount", "That is more than the remaining amount.");
  const paidOn = input.paidOn ? requireDate("paidOn", input.paidOn) : parseIsoDate(todayInChicago());
  const method = await requireMethod(household.id, input.paymentMethodId);
  const payment = await prisma.payment.create({
    data: {
      householdId: household.id,
      occurrenceId: row.id,
      billId: row.billId,
      propertyId: row.propertyId,
      payeeId: row.bill.payeeId ?? (await ensurePaymentPayee(household.id, row.billId, row.bill.name)),
      paidOn,
      amount: new Prisma.Decimal(money(cents)),
      paymentMethodId: method?.id ?? null,
      confirmationNumber: cleanOptional("confirmationNumber", input.confirmationNumber, 40),
      note: cleanOptional("note", input.note, 300),
    },
  });
  const fullyPaid = cents >= toCents(presented.remaining);
  if (fullyPaid) {
    await prisma.monthEntry.updateMany({
      where: { billId: row.billId, yearMonth: formatIsoDate(row.dueDate).slice(0, 7) },
      data: {
        status: "done",
        paidOn,
        amount: new Prisma.Decimal(money(cents)),
        amountPaid: new Prisma.Decimal(money(cents)),
      },
    });
  }
  await prisma.auditLog.create({
    data: {
      householdId: household.id,
      entityType: "payment",
      entityId: payment.id,
      action: "recorded",
      summary: `Recorded ${money(cents)} for ${row.bill.name}.`,
    },
  });
  events.emit("payment.recorded", { paymentId: payment.id, billId: row.billId, amount: money(cents) });
  const fresh = await loadOccurrence(id);
  return presentOccurrence(fresh.row, todayInChicago(), prefs.dueSoonDays);
}

export async function undoPayment(paymentId: string): Promise<void> {
  const household = await getHousehold();
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, householdId: household.id } });
  if (!payment) throw new ServiceError("Payment not found.", 404, "not_found");
  if (payment.undoneAt) return;
  await prisma.payment.update({ where: { id: payment.id }, data: { undoneAt: new Date() } });
  events.emit("payment.undone", { paymentId: payment.id, billId: payment.billId });
}

export async function skipOccurrence(id: string): Promise<OccurrenceDTO> {
  const { row } = await loadOccurrence(id);
  const paid = row.payments.some((payment) => !payment.undoneAt);
  if (paid) throw new ServiceError("Undo the payment before skipping this date.", 409, "paid");
  await prisma.occurrence.update({ where: { id }, data: { skippedAt: new Date() } });
  events.emit("occurrence.skipped", { occurrenceId: id, billId: row.billId });
  const prefs = await getPrefs();
  const fresh = await loadOccurrence(id);
  return presentOccurrence(fresh.row, todayInChicago(), prefs.dueSoonDays);
}

export async function rescheduleOccurrence(id: string, dueDate: string): Promise<OccurrenceDTO> {
  const { row } = await loadOccurrence(id);
  const next = requireDate("dueDate", dueDate);
  await prisma.occurrence.update({
    where: { id },
    data: {
      originalDueDate: row.originalDueDate ?? row.dueDate,
      dueDate: next,
      skippedAt: null,
    },
  });
  const prefs = await getPrefs();
  const fresh = await loadOccurrence(id);
  return presentOccurrence(fresh.row, todayInChicago(), prefs.dueSoonDays);
}

export async function listPayments(filters: { billId?: string | null; payeeId?: string | null; propertyId?: string | null }): Promise<PaymentDTO[]> {
  const household = await getHousehold();
  const rows = await prisma.payment.findMany({
    where: {
      householdId: household.id,
      ...(filters.billId ? { billId: filters.billId } : {}),
      ...(filters.payeeId ? { payeeId: filters.payeeId } : {}),
      ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
    },
    include: { bill: true, payee: true, property: true, paymentMethod: true },
    orderBy: [{ paidOn: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map((row) => ({
    id: row.id,
    occurrenceId: row.occurrenceId,
    billId: row.billId,
    billName: row.bill.name,
    payeeId: row.payeeId,
    payeeName: row.payee.name,
    propertyId: row.propertyId,
    propertyName: row.property.name,
    paidOn: formatIsoDate(row.paidOn),
    amount: row.amount.toFixed(2),
    paymentMethodId: row.paymentMethodId,
    paymentMethod: row.paymentMethod
      ? row.paymentMethod.last4
        ? `${row.paymentMethod.nickname} ••${row.paymentMethod.last4}`
        : row.paymentMethod.nickname
      : null,
    confirmationNumber: row.confirmationNumber,
    note: row.note,
    undone: row.undoneAt != null,
  }));
}

export async function listPayees(): Promise<PayeeDTO[]> {
  const household = await getHousehold();
  const rows = await prisma.payee.findMany({
    where: { householdId: household.id },
    include: { category: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    accountLast4: row.accountLast4,
    website: row.website,
    phone: row.phone,
    notes: row.notes,
    archived: row.archivedAt != null,
  }));
}

export async function savePayee(input: {
  id?: string;
  name: string;
  categoryId?: string | null;
  accountLast4?: string | null;
  website?: string | null;
  phone?: string | null;
  notes?: string | null;
  archived?: boolean;
}): Promise<PayeeDTO> {
  const household = await getHousehold();
  const name = cleanRequired("name", input.name, "payee name", 80);
  const data = {
    name,
    categoryId: input.categoryId || null,
    accountLast4: cleanLast4(input.accountLast4),
    website: portal(input.website),
    phone: cleanOptional("phone", input.phone, 40),
    notes: cleanOptional("notes", input.notes, 300),
    archivedAt: input.archived ? new Date() : null,
  };
  const row = input.id
    ? await prisma.payee.update({ where: { id: input.id }, data, include: { category: true } })
    : await prisma.payee.create({ data: { ...data, householdId: household.id, archivedAt: null }, include: { category: true } });
  return {
    id: row.id,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    accountLast4: row.accountLast4,
    website: row.website,
    phone: row.phone,
    notes: row.notes,
    archived: row.archivedAt != null,
  };
}

export async function deletePayee(id: string): Promise<void> {
  const household = await getHousehold();
  const count = await prisma.bill.count({ where: { payeeId: id, householdId: household.id } });
  if (count > 0) throw new ServiceError("This payee has bills. Archive it instead.", 409, "in_use");
  await prisma.payee.delete({ where: { id } });
}

export async function occurrenceForReminder(id: string) {
  return loadOccurrence(id);
}
