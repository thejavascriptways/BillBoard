import { Prisma } from "@prisma/client";

import { decryptBackup, encryptBackup } from "@/core/backup-crypto";
import { formatIsoDate, isIsoDate, parseIsoDate, todayInChicago } from "@/lib/dates";
import { prisma } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { getHousehold } from "@/server/services/household";
import { getPrefs, updatePrefs } from "@/server/services/prefs";

type BackupFile = {
  version: 1;
  exportedAt: string;
  household: { name: string; timezone: string; currency: string };
  properties: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  paymentMethods: Record<string, unknown>[];
  payees: Record<string, unknown>[];
  bills: Record<string, unknown>[];
  occurrences: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  creditCards: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  prefs: Record<string, unknown> | null;
};

function day(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const iso = value.slice(0, 10);
  if (!isIsoDate(iso)) return null;
  return parseIsoDate(iso);
}

function stamp(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function decimal(value: unknown): Prisma.Decimal {
  return new Prisma.Decimal(typeof value === "string" || typeof value === "number" ? value : "0");
}

export async function buildBackup(): Promise<BackupFile> {
  const household = await getHousehold();
  const where = { householdId: household.id };
  const [properties, categories, paymentMethods, payees, bills, occurrences, payments, creditCards, expenses, prefs] =
    await Promise.all([
      prisma.property.findMany({ where }),
      prisma.category.findMany({ where }),
      prisma.paymentMethod.findMany({ where }),
      prisma.payee.findMany({ where }),
      prisma.bill.findMany({ where }),
      prisma.occurrence.findMany({ where }),
      prisma.payment.findMany({ where }),
      prisma.creditCard.findMany({ where }),
      prisma.expense.findMany({ where }),
      prisma.householdPrefs.findUnique({ where: { householdId: household.id } }),
    ]);
  const dateFields = (row: object, keys: string[]) => {
    const copy: Record<string, unknown> = { ...row };
    for (const key of keys) {
      const value = copy[key];
      copy[key] = value instanceof Date ? formatIsoDate(value) : value;
    }
    return copy;
  };
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    household: { name: household.name, timezone: household.timezone, currency: household.currency },
    properties: properties.map((row) => dateFields(row, ["purchaseDate", "roleStartsOn"])),
    categories,
    paymentMethods,
    payees,
    bills: bills.map((row) => dateFields(row, ["anchorDate", "endDate", "generatedThrough"])),
    occurrences: occurrences.map((row) => dateFields(row, ["dueDate", "originalDueDate", "snoozedUntil"])),
    payments: payments.map((row) => dateFields(row, ["paidOn"])),
    creditCards,
    expenses: expenses.map((row) => dateFields(row, ["expenseDate"])),
    prefs: prefs ? dateFields(prefs, ["lastBackupOn"]) : null,
  };
}

export async function exportEncrypted(password: string): Promise<{ filename: string; bytes: Buffer }> {
  const payload = await buildBackup();
  const bytes = await encryptBackup(JSON.stringify(payload), password);
  const day = payload.exportedAt.slice(0, 10);
  return { filename: `billboard-backup-${day}.billboard`, bytes };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new ServiceError(`Backup is missing ${label}.`, 400, "invalid");
  return value as Record<string, unknown>;
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
}

export async function restoreBackup(file: Buffer, password: string, mode: "replace" | "merge"): Promise<{ mode: string }> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(await decryptBackup(file, password)) as BackupFile;
  } catch (error) {
    throw new ServiceError(error instanceof Error ? error.message : "Could not open that backup.", 400, "invalid");
  }
  if (parsed.version !== 1) throw new ServiceError("This backup version is not supported.", 400, "invalid");
  const household = await getHousehold();
  const id = household.id;
  const properties = asRows(parsed.properties);
  const categories = asRows(parsed.categories);
  const methods = asRows(parsed.paymentMethods);
  const payees = asRows(parsed.payees);
  const bills = asRows(parsed.bills);
  const occurrences = asRows(parsed.occurrences);
  const payments = asRows(parsed.payments);
  const cards = asRows(parsed.creditCards);
  const expenses = asRows(parsed.expenses);

  await prisma.$transaction(async (tx) => {
    if (mode === "replace") {
      await tx.reminderDelivery.deleteMany({ where: { householdId: id } });
      await tx.payment.deleteMany({ where: { householdId: id } });
      await tx.occurrence.deleteMany({ where: { householdId: id } });
      await tx.creditCard.deleteMany({ where: { householdId: id } });
      await tx.bill.deleteMany({ where: { householdId: id } });
      await tx.payee.deleteMany({ where: { householdId: id } });
      await tx.expense.deleteMany({ where: { householdId: id } });
    }
    for (const row of properties) {
      const data = {
        householdId: id,
        slug: String(row.slug),
        name: String(row.name),
        address: (row.address as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        kind: (row.kind as "primary") ?? "other",
        status: (row.status as "active") ?? "active",
        purchaseDate: day(row.purchaseDate),
        roleStartsOn: day(row.roleStartsOn),
        roleBecomes: (row.roleBecomes as "primary" | null) ?? null,
        sortOrder: Number(row.sortOrder ?? 0),
        archivedAt: stamp(row.archivedAt),
      };
      await tx.property.upsert({ where: { id: String(row.id) }, create: { id: String(row.id), ...data }, update: data });
    }
    for (const row of categories) {
      const data = {
        householdId: id,
        slug: String(row.slug),
        name: String(row.name),
        sortOrder: Number(row.sortOrder ?? 0),
        archivedAt: stamp(row.archivedAt),
      };
      await tx.category.upsert({ where: { id: String(row.id) }, create: { id: String(row.id), ...data }, update: data });
    }
    for (const row of methods) {
      const data = {
        householdId: id,
        slug: String(row.slug),
        nickname: String(row.nickname),
        last4: (row.last4 as string | null) ?? null,
        sortOrder: Number(row.sortOrder ?? 0),
        archivedAt: stamp(row.archivedAt),
      };
      await tx.paymentMethod.upsert({ where: { id: String(row.id) }, create: { id: String(row.id), ...data }, update: data });
    }
    for (const row of payees) {
      const data = {
        householdId: id,
        name: String(row.name),
        categoryId: (row.categoryId as string | null) ?? null,
        accountLast4: (row.accountLast4 as string | null) ?? null,
        website: (row.website as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        archivedAt: stamp(row.archivedAt),
      };
      await tx.payee.upsert({ where: { id: String(row.id) }, create: { id: String(row.id), ...data }, update: data });
    }
    for (const row of bills) {
      const data = {
        householdId: id,
        name: String(row.name),
        payeeId: String(row.payeeId),
        propertyId: String(row.propertyId),
        categoryId: String(row.categoryId),
        amountKind: (row.amountKind as "fixed") ?? "fixed",
        amount: decimal(row.amount),
        anchorDate: day(row.anchorDate) ?? parseIsoDate("2026-01-01"),
        autopay: Boolean(row.autopay),
        paymentMethodId: (row.paymentMethodId as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        portalUrl: (row.portalUrl as string | null) ?? null,
        frequency: (row.frequency as "monthly") ?? "monthly",
        intervalN: Number(row.intervalN ?? 1),
        intervalUnit: (row.intervalUnit as "months") ?? "months",
        dayOfMonth: row.dayOfMonth == null ? null : Number(row.dayOfMonth),
        endDate: day(row.endDate),
        endCount: row.endCount == null ? null : Number(row.endCount),
        shiftWeekends: (row.shiftWeekends as "none") ?? "none",
        reminderDays: Array.isArray(row.reminderDays) ? (row.reminderDays as number[]) : [],
        graceDays: Number(row.graceDays ?? 0),
        generatedThrough: day(row.generatedThrough),
        archivedAt: stamp(row.archivedAt),
      };
      await tx.bill.upsert({ where: { id: String(row.id) }, create: { id: String(row.id), ...data }, update: data });
    }
    for (const row of occurrences) {
      const data = {
        householdId: id,
        billId: String(row.billId),
        propertyId: String(row.propertyId),
        cycleIndex: Number(row.cycleIndex ?? 0),
        dueDate: day(row.dueDate) ?? parseIsoDate("2026-01-01"),
        originalDueDate: day(row.originalDueDate),
        expectedAmount: decimal(row.expectedAmount),
        skippedAt: stamp(row.skippedAt),
        snoozedUntil: day(row.snoozedUntil),
      };
      await tx.occurrence.upsert({ where: { id: String(row.id) }, create: { id: String(row.id), ...data }, update: data });
    }
    for (const row of payments) {
      const data = {
        householdId: id,
        occurrenceId: String(row.occurrenceId),
        billId: String(row.billId),
        propertyId: String(row.propertyId),
        payeeId: String(row.payeeId),
        paidOn: day(row.paidOn) ?? parseIsoDate("2026-01-01"),
        amount: decimal(row.amount),
        paymentMethodId: (row.paymentMethodId as string | null) ?? null,
        confirmationNumber: (row.confirmationNumber as string | null) ?? null,
        note: (row.note as string | null) ?? null,
        undoneAt: stamp(row.undoneAt),
      };
      await tx.payment.upsert({ where: { id: String(row.id) }, create: { id: String(row.id), ...data }, update: data });
    }
    for (const row of cards) {
      const data = {
        householdId: id,
        propertyId: String(row.propertyId),
        billId: (row.billId as string | null) ?? null,
        issuer: String(row.issuer),
        nickname: String(row.nickname),
        last4: String(row.last4),
        creditLimit: decimal(row.creditLimit),
        currentBalance: decimal(row.currentBalance),
        statementDay: Number(row.statementDay),
        dueDay: Number(row.dueDay),
        minimumPayment: decimal(row.minimumPayment),
        apr: row.apr == null ? null : decimal(row.apr),
        autopay: Boolean(row.autopay),
        archivedAt: stamp(row.archivedAt),
      };
      await tx.creditCard.upsert({ where: { id: String(row.id) }, create: { id: String(row.id), ...data }, update: data });
    }
    for (const row of expenses) {
      const data = {
        householdId: id,
        expenseDate: day(row.expenseDate) ?? parseIsoDate("2026-01-01"),
        propertyId: String(row.propertyId),
        categoryId: String(row.categoryId),
        paymentMethodId: String(row.paymentMethodId),
        payee: String(row.payee),
        amount: decimal(row.amount),
        notes: (row.notes as string | null) ?? null,
        isSample: Boolean(row.isSample),
      };
      await tx.expense.upsert({ where: { id: String(row.id) }, create: { id: String(row.id), ...data }, update: data });
    }
  });
  if (parsed.prefs) {
    const prefs = asRecord(parsed.prefs, "prefs");
    await updatePrefs({
      reminderDays: Array.isArray(prefs.reminderDays) ? (prefs.reminderDays as number[]) : undefined,
      digestHour: Number(prefs.digestHour ?? 8),
      digestMinute: Number(prefs.digestMinute ?? 0),
      dueSoonDays: Number(prefs.dueSoonDays ?? 7),
      autoBackup: Boolean(prefs.autoBackup ?? true),
      retention: Number(prefs.retention ?? 14),
      shiftWeekends: (prefs.shiftWeekends as "none") ?? "none",
      backupDir: (prefs.backupDir as string | null) ?? null,
    });
  }
  return { mode };
}

export async function maybeAutoBackup(password: string): Promise<{ skipped: boolean; filename?: string; bytes?: Buffer }> {
  const prefs = await getPrefs();
  if (!prefs.autoBackup) return { skipped: true };
  const today = todayInChicago();
  if (prefs.lastBackupOn && formatIsoDate(prefs.lastBackupOn) === today) return { skipped: true };
  const file = await exportEncrypted(password);
  await prisma.householdPrefs.update({
    where: { householdId: prefs.householdId },
    data: { lastBackupOn: parseIsoDate(today) },
  });
  return { skipped: false, filename: file.filename, bytes: file.bytes };
}
