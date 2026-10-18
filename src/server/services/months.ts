import { Prisma } from "@prisma/client";

import { cardMonthFlags } from "@/core/card-month";
import { remindersEnabled, type PaymentMode } from "@/core/due-on";
import { fromCents } from "@/lib/money";
import {
  checklistBand,
  excludedFromTotals,
  initialMonthEntry,
  monthTotals,
  yearDot,
  type MonthStatus,
} from "@/core/months";
import { generateDueDates } from "@/core/recurrence";
import { missingPastDue, parseLedgerAmount, paymentWarnings } from "@/core/validation";
import { addMonths, formatIsoDate, isIsoDate, lastDayIso, parseIsoDate, todayInChicago } from "@/lib/dates";
import { prisma } from "@/server/db";
import { fieldError, ServiceError } from "@/server/errors";
import { getHousehold } from "@/server/services/household";
import { getPrefs } from "@/server/services/prefs";

const STATUSES = ["not_done", "done", "failed", "not_applicable", "included", "skipped", "pending"] as const;

function assertMonth(yearMonth: string): string {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw fieldError("yearMonth", "Use a month like 2026-10.");
  const month = Number(yearMonth.slice(5));
  if (month < 1 || month > 12) throw fieldError("yearMonth", "Use a month like 2026-10.");
  return yearMonth;
}

function dueInMonth(bill: {
  frequency: "monthly" | "weekly" | "biweekly" | "quarterly" | "semiannual" | "annual" | "every_n" | "once";
  intervalN: number;
  intervalUnit: "days" | "weeks" | "months";
  dayOfMonth: number | null;
  anchorDate: Date;
  endDate: Date | null;
  endCount: number | null;
  shiftWeekends: "none" | "earlier" | "later";
  dueRuleKind: string;
}, yearMonth: string): string | null {
  if (!remindersEnabled(bill.dueRuleKind as "schedule") && bill.dueRuleKind !== "schedule") return null;
  const dates = generateDueDates(
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
    lastDayIso(Number(yearMonth.slice(0, 4)), Number(yearMonth.slice(5))),
  );
  return dates.map((row) => row.dueDate).find((date) => date.startsWith(yearMonth)) ?? null;
}

export async function ensureMonth(yearMonthInput: string) {
  const yearMonth = assertMonth(yearMonthInput);
  const household = await getHousehold();
  const today = todayInChicago();
  const current = today.slice(0, 7);
  const previous = addMonths(`${current}-01`, -1).slice(0, 7);
  if (yearMonth === current) {
    await prisma.ledgerMonth.updateMany({
      where: { householdId: household.id, yearMonth: { lt: previous }, archivedAt: null },
      data: { archivedAt: new Date() },
    });
  }
  const bills = await prisma.bill.findMany({
    where: { householdId: household.id, archivedAt: null },
    include: { creditCard: true },
  });
  for (const bill of bills) {
    const existing = await prisma.monthEntry.findUnique({
      where: { billId_yearMonth: { billId: bill.id, yearMonth } },
    });
    if (existing) continue;
    const due = dueInMonth(bill, yearMonth);
    const unscheduled = !remindersEnabled(bill.dueRuleKind) && bill.dueRuleKind !== "schedule";
    const reference = bill.paymentMode === "covered" || bill.paymentMode === "paycheck";
    const card = Boolean(bill.creditCard);
    if (!due && !unscheduled && !reference && !card) continue;
    const usual = bill.amount ? bill.amount.toFixed(2) : null;
    const seed = initialMonthEntry({
      paymentMode: bill.paymentMode,
      amountKind: usual == null || bill.amountKind !== "fixed" ? "variable" : "fixed",
      amount: usual ?? "0.00",
      isCard: card,
      balanceCents: bill.creditCard?.currentBalance == null ? null : Math.round(Number(bill.creditCard.currentBalance) * 100),
    });
    await prisma.monthEntry.create({
      data: {
        householdId: household.id,
        billId: bill.id,
        yearMonth,
        amount: seed.amount == null ? null : new Prisma.Decimal(seed.amount),
        statementAmount: seed.statementAmount == null ? null : new Prisma.Decimal(seed.statementAmount),
        amountPaid: seed.amountPaid == null ? null : new Prisma.Decimal(seed.amountPaid),
        status: seed.status,
        dueDate: due ? parseIsoDate(due) : null,
      },
    });
  }
  return { yearMonth };
}

function moneyOrNull(value: Prisma.Decimal | null): string | null {
  return value == null ? null : value.toFixed(2);
}

export async function getChecklist(input: {
  yearMonth: string;
  propertyId?: string | null;
  categoryId?: string | null;
  personId?: string | null;
  paymentMode?: string | null;
  status?: string | null;
  excludeCards?: boolean;
}) {
  const yearMonth = assertMonth(input.yearMonth);
  await ensureMonth(yearMonth);
  const household = await getHousehold();
  const prefs = await getPrefs();
  const today = todayInChicago();
  const ledger = await prisma.ledgerMonth.findUnique({
    where: { householdId_yearMonth: { householdId: household.id, yearMonth } },
  });
  const entries = await prisma.monthEntry.findMany({
    where: { householdId: household.id, yearMonth, bill: { archivedAt: null } },
    include: {
      bill: {
        include: {
      category: { include: { parent: true } },
      property: true,
      payee: true,
      person: true,
          creditCard: { include: { cardholder: true } },
          coveredBy: true,
        },
      },
    },
    orderBy: { bill: { name: "asc" } },
  });
  const year = yearMonth.slice(0, 4);
  const dots = await prisma.monthEntry.findMany({
    where: { householdId: household.id, yearMonth: { startsWith: year }, billId: { in: entries.map((row) => row.billId) } },
  });
  const rows = entries
    .filter((row) => {
      if (input.propertyId && row.bill.propertyId !== input.propertyId) return false;
      if (input.excludeCards && row.bill.creditCard) return false;
      if (input.categoryId && row.bill.categoryId !== input.categoryId && row.bill.category.parentId !== input.categoryId) return false;
      const person = row.bill.creditCard?.cardholderId ?? row.bill.personId;
      if (input.personId && person !== input.personId) return false;
      if (input.paymentMode && row.bill.paymentMode !== input.paymentMode) return false;
      if (input.status && row.status !== input.status) return false;
      return true;
    })
    .map((row) => {
      const dueDate = row.dueDate ? formatIsoDate(row.dueDate) : null;
      const amount = moneyOrNull(row.amount);
      const statementAmount = moneyOrNull(row.statementAmount);
      const amountPaid = moneyOrNull(row.amountPaid);
      const flags = row.bill.creditCard ? cardMonthFlags(statementAmount, amountPaid) : null;
      const band = checklistBand({
        status: row.status,
        paymentMode: row.bill.paymentMode,
        dueDate,
        today,
        yearMonth,
        dueSoonDays: prefs.dueSoonDays,
        dueRuleKind: row.bill.dueRuleKind,
        frequency: row.bill.frequency,
      });
      const yearDots = Array.from({ length: 12 }, (_, index) => {
        const key = `${year}-${String(index + 1).padStart(2, "0")}`;
        const match = dots.find((dot) => dot.billId === row.billId && dot.yearMonth === key);
        return yearDot(match?.status ?? null, match?.dueDate ? formatIsoDate(match.dueDate) : null, today);
      });
      return {
        id: row.id,
        billId: row.billId,
        billName: row.bill.name,
        propertyId: row.bill.propertyId,
        propertyName: row.bill.property.name,
        categoryId: row.bill.categoryId,
        categoryName: row.bill.category.name,
        categoryColor: row.bill.category.color,
        groupName: row.bill.category.parent?.name ?? row.bill.category.name,
        payeeName: row.bill.payee?.name ?? "",
        amountKind: row.bill.amountKind,
        usualAmount: row.bill.amount ? row.bill.amount.toFixed(2) : null,
        paymentMode: row.bill.paymentMode as PaymentMode,
        status: row.status as MonthStatus,
        amount,
        paidOn: row.paidOn ? formatIsoDate(row.paidOn) : null,
        dueDate,
        statementAmount,
        amountPaid,
        prompt: amount == null && !excludedFromTotals(row.status, row.bill.paymentMode),
        missing: missingPastDue({ status: row.status, amount, dueDate, today }),
        muted: row.bill.muted,
        personId: row.bill.personId,
        personName: row.bill.person?.name ?? null,
        cardholderId: row.bill.creditCard?.cardholderId ?? null,
        cardholderName: row.bill.creditCard?.cardholder?.name ?? null,
        coveredBy: row.bill.coveredBy?.name ?? null,
        flags,
        band,
        yearDots,
        excluded: excludedFromTotals(row.status, row.bill.paymentMode),
      };
    });
  const totals = monthTotals(rows);
  return {
    yearMonth,
    today,
    archived: Boolean(ledger?.archivedAt),
    due: fromCents(totals.dueCents),
    paid: fromCents(totals.paidCents),
    remaining: fromCents(totals.remainingCents),
    rows,
  };
}

export async function billTimeline(billId: string) {
  const household = await getHousehold();
  const bill = await prisma.bill.findFirst({ where: { id: billId, householdId: household.id } });
  if (!bill) throw new ServiceError("Bill not found.", 404, "not_found");
  const today = todayInChicago();
  await ensureMonth(today.slice(0, 7));
  const entries = await prisma.monthEntry.findMany({
    where: { billId, householdId: household.id },
    orderBy: { yearMonth: "asc" },
  });
  const audit = await prisma.auditLog.findMany({
    where: { householdId: household.id, entityId: billId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return {
    entries: entries.map((row) => ({
      id: row.id,
      yearMonth: row.yearMonth,
      amount: moneyOrNull(row.amount),
      paidOn: row.paidOn ? formatIsoDate(row.paidOn) : null,
      status: row.status,
      dueDate: row.dueDate ? formatIsoDate(row.dueDate) : null,
      statementAmount: moneyOrNull(row.statementAmount),
      amountPaid: moneyOrNull(row.amountPaid),
    })),
    audit: audit.map((row) => ({ id: row.id, action: row.action, summary: row.summary, createdAt: row.createdAt.toISOString() })),
  };
}

async function assertOpen(householdId: string, yearMonth: string) {
  const ledger = await prisma.ledgerMonth.findUnique({
    where: { householdId_yearMonth: { householdId, yearMonth } },
  });
  if (ledger?.archivedAt) throw new ServiceError("That month is archived and read-only.", 409, "archived");
}

export async function markMonthPaid(
  id: string,
  input: { amount?: string | null; paidOn?: string | null; confirm?: boolean; statementAmount?: string | null },
) {
  const household = await getHousehold();
  const row = await prisma.monthEntry.findFirst({
    where: { id, householdId: household.id },
    include: { bill: true },
  });
  if (!row) throw new ServiceError("That month was not found.", 404, "not_found");
  await assertOpen(household.id, row.yearMonth);
  const parsed = parseLedgerAmount(input.amount ?? (row.amount ? row.amount.toFixed(2) : row.bill.amount ? row.bill.amount.toFixed(2) : ""));
  if ("error" in parsed) throw fieldError("amount", parsed.error);
  const amount = "blank" in parsed ? null : fromCents(parsed.cents);
  const paidOn = input.paidOn && input.paidOn.length > 0 ? input.paidOn : todayInChicago();
  if (!isIsoDate(paidOn)) throw fieldError("paidOn", "Use a real date.");
  const recent = await prisma.monthEntry.findMany({
    where: { billId: row.billId, amount: { not: null }, yearMonth: { lt: row.yearMonth } },
    orderBy: { yearMonth: "desc" },
    take: 3,
  });
  const duplicate = await prisma.payment.findFirst({
    where: {
      billId: row.billId,
      undoneAt: null,
      paidOn: parseIsoDate(paidOn),
      ...(amount ? { amount: new Prisma.Decimal(amount) } : {}),
    },
  });
  const dueDate = row.dueDate ? formatIsoDate(row.dueDate) : null;
  const review = paymentWarnings({
    paidOn,
    dueDate,
    amount,
    recentAmounts: recent.map((item) => item.amount?.toFixed(2) ?? ""),
    duplicate: Boolean(duplicate),
    markingDone: true,
    confirm: Boolean(input.confirm),
  });
  if (review.errors.length > 0) throw new ServiceError(review.errors[0] ?? "Check this payment.", 400, "invalid");
  if (review.warnings.length > 0 && !input.confirm) {
    throw new ServiceError(review.warnings.join(" "), 409, "confirm");
  }
  let statementAmount = row.statementAmount;
  if (input.statementAmount !== undefined) {
    const statement = parseLedgerAmount(input.statementAmount);
    if ("error" in statement) throw fieldError("statementAmount", statement.error);
    statementAmount = "blank" in statement ? null : new Prisma.Decimal(fromCents(statement.cents));
  }
  const saved = await prisma.monthEntry.update({
    where: { id: row.id },
    data: {
      status: "done",
      amount: amount == null ? null : new Prisma.Decimal(amount),
      amountPaid: amount == null ? null : new Prisma.Decimal(amount),
      paidOn: parseIsoDate(paidOn),
      statementAmount,
    },
  });
  await prisma.auditLog.create({
    data: {
      householdId: household.id,
      entityType: "bill",
      entityId: row.billId,
      action: "paid",
      summary: `Marked ${row.bill.name} paid for ${row.yearMonth}${amount ? ` (${amount})` : ""}.`,
    },
  });
  return { id: saved.id, warnings: review.warnings };
}

export async function setMonthAmount(id: string, amount: string | null) {
  const household = await getHousehold();
  const row = await prisma.monthEntry.findFirst({ where: { id, householdId: household.id }, include: { bill: true } });
  if (!row) throw new ServiceError("That month was not found.", 404, "not_found");
  await assertOpen(household.id, row.yearMonth);
  const parsed = parseLedgerAmount(amount);
  if ("error" in parsed) throw fieldError("amount", parsed.error);
  const value = "blank" in parsed ? null : new Prisma.Decimal(fromCents(parsed.cents));
  await prisma.monthEntry.update({
    where: { id },
    data: {
      amount: value,
      ...(row.status === "done" ? { amountPaid: value } : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      householdId: household.id,
      entityType: "bill",
      entityId: row.billId,
      action: "amount",
      summary: `Set ${row.bill.name} ${row.yearMonth} to ${value ? value.toFixed(2) : "blank"}.`,
    },
  });
  return { id, amount: value ? value.toFixed(2) : null };
}

export async function undoMonthPaid(id: string) {
  const household = await getHousehold();
  const row = await prisma.monthEntry.findFirst({ where: { id, householdId: household.id }, include: { bill: true } });
  if (!row) throw new ServiceError("That month was not found.", 404, "not_found");
  await assertOpen(household.id, row.yearMonth);
  const status = row.bill.paymentMode === "auto" ? "pending" : "not_done";
  await prisma.monthEntry.update({
    where: { id },
    data: { status, paidOn: null, amountPaid: null },
  });
  await prisma.auditLog.create({
    data: {
      householdId: household.id,
      entityType: "bill",
      entityId: row.billId,
      action: "undo",
      summary: `Cleared the paid mark on ${row.bill.name} for ${row.yearMonth}.`,
    },
  });
  return { id, status };
}

export async function resyncBillMonths(billId: string) {
  const household = await getHousehold();
  const bill = await prisma.bill.findFirst({ where: { id: billId, householdId: household.id } });
  if (!bill) return;
  const entries = await prisma.monthEntry.findMany({ where: { billId, householdId: household.id } });
  for (const entry of entries) {
    if (entry.status === "done" || entry.status === "skipped" || entry.status === "not_applicable" || entry.status === "included") {
      continue;
    }
    const due = dueInMonth(bill, entry.yearMonth);
    if (!due) {
      if (entry.amount == null && !entry.paidOn) await prisma.monthEntry.delete({ where: { id: entry.id } });
      continue;
    }
    await prisma.monthEntry.update({ where: { id: entry.id }, data: { dueDate: parseIsoDate(due) } });
  }
}

export async function setMonthStatus(id: string, status: string) {
  if (!(STATUSES as readonly string[]).includes(status)) throw fieldError("status", "Choose a status.");
  const household = await getHousehold();
  const row = await prisma.monthEntry.findFirst({ where: { id, householdId: household.id }, include: { bill: true } });
  if (!row) throw new ServiceError("That month was not found.", 404, "not_found");
  await assertOpen(household.id, row.yearMonth);
  if (status === "done") {
    return markMonthPaid(id, { confirm: false });
  }
  await prisma.monthEntry.update({ where: { id }, data: { status: status as MonthStatus } });
  await prisma.auditLog.create({
    data: {
      householdId: household.id,
      entityType: "bill",
      entityId: row.billId,
      action: "status",
      summary: `Set ${row.bill.name} ${row.yearMonth} to ${status.replaceAll("_", " ")}.`,
    },
  });
  return { id, warnings: [] as string[] };
}

export async function archiveMonth(yearMonthInput: string) {
  const yearMonth = assertMonth(yearMonthInput);
  const household = await getHousehold();
  await prisma.ledgerMonth.upsert({
    where: { householdId_yearMonth: { householdId: household.id, yearMonth } },
    create: { householdId: household.id, yearMonth, archivedAt: new Date() },
    update: { archivedAt: new Date() },
  });
  return { yearMonth, archived: true };
}

export async function yearMatrixCsv(year: string): Promise<string> {
  if (!/^\d{4}$/.test(year)) throw fieldError("year", "Use a four-digit year.");
  const household = await getHousehold();
  for (let month = 1; month <= 12; month += 1) {
    await ensureMonth(`${year}-${String(month).padStart(2, "0")}`);
  }
  const bills = await prisma.bill.findMany({
    where: { householdId: household.id, archivedAt: null },
    include: { category: true, property: true, monthEntries: { where: { yearMonth: { startsWith: year } } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });
  const headers = ["Category", "Bill", "Home", "Payment mode"];
  for (let month = 1; month <= 12; month += 1) {
    const label = new Date(Date.UTC(Number(year), month - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
    headers.push(`${label} amount`, `${label} status`);
  }
  const lines = [headers.join(",")];
  for (const bill of bills) {
    const cells = [bill.category.name, bill.name, bill.property.name, bill.paymentMode];
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const entry = bill.monthEntries.find((row) => row.yearMonth === key);
      cells.push(entry?.amount == null ? "" : entry.amount.toFixed(2), entry?.status ?? "");
    }
    lines.push(cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","));
  }
  return lines.join("\n");
}
