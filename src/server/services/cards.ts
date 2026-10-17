import { cardMonthFlags } from "@/core/card-month";
import { cardDates, cardDisplayName } from "@/core/cards";
import { events } from "@/core/events";
import type { CardDTO } from "@/lib/bill-types";
import { todayInChicago } from "@/lib/dates";
import { prisma } from "@/server/db";
import { ServiceError, fieldError } from "@/server/errors";
import { createBill, updateBill } from "@/server/services/bills";
import { getHousehold } from "@/server/services/household";
import { cleanLast4 } from "@/server/text";

function optionalDay(value: unknown, field: string): number | null {
  if (value == null || value === "") return null;
  const next = Math.trunc(Number(value));
  if (!Number.isFinite(next) || next < 1 || next > 31) throw fieldError(field, "Use a day from 1 to 31, or leave it blank.");
  return next;
}

function optionalText(value: unknown, max: number): string {
  if (value == null) return "";
  const trimmed = String(value).trim().replace(/\s+/g, " ");
  if (trimmed.length > max) throw fieldError("nickname", `Use ${max} characters or fewer.`);
  return trimmed;
}

function requireLast4(value: string | null | undefined): string {
  const last4 = cleanLast4(value);
  if (!last4) throw fieldError("last4", "Enter exactly 4 digits.");
  return last4;
}

async function propertyFor(householdId: string, propertyId?: string | null) {
  if (propertyId) {
    const chosen = await prisma.property.findFirst({ where: { id: propertyId, householdId } });
    if (!chosen) throw fieldError("propertyId", "Choose a property.");
    return chosen;
  }
  const personal = await prisma.property.findFirst({ where: { householdId, slug: "personal" } });
  if (personal) return personal;
  const any = await prisma.property.findFirst({ where: { householdId, archivedAt: null }, orderBy: { sortOrder: "asc" } });
  if (!any) throw new ServiceError("Add a property in Settings first.", 400, "invalid");
  return any;
}

export type CardWrite = {
  issuer?: string | null;
  nickname?: string | null;
  last4: string;
  propertyId?: string | null;
  statementDay?: number | string | null;
  dueDay?: number | string | null;
  autopay?: boolean;
  cardholderId?: string | null;
};

function toCard(
  row: {
    id: string;
    propertyId: string;
    billId: string | null;
    issuer: string;
    nickname: string;
    last4: string;
    statementDay: number | null;
    dueDay: number | null;
    autopay: boolean;
    cardholderId: string | null;
    property: { name: string };
    cardholder: { name: string } | null;
    bill: { monthEntries: { statementAmount: { toFixed: (n: number) => string } | null; amountPaid: { toFixed: (n: number) => string } | null }[] } | null;
  },
  today: string,
): CardDTO {
  const dates = row.statementDay && row.dueDay ? cardDates(today, row.statementDay, row.dueDay) : null;
  const month = row.bill?.monthEntries[0];
  const statementAmount = month?.statementAmount?.toFixed(2) ?? null;
  const amountPaid = month?.amountPaid?.toFixed(2) ?? null;
  const flags = cardMonthFlags(statementAmount, amountPaid);
  return {
    id: row.id,
    propertyId: row.propertyId,
    propertyName: row.property.name,
    billId: row.billId,
    issuer: row.issuer,
    nickname: row.nickname,
    displayName: cardDisplayName(row.issuer, row.nickname, row.last4),
    last4: row.last4,
    statementDay: row.statementDay,
    dueDay: row.dueDay,
    autopay: row.autopay,
    cardholderId: row.cardholderId,
    cardholderName: row.cardholder?.name ?? null,
    statementAmount,
    amountPaid,
    paidBelowStatement: flags.paidBelowStatement,
    balanceCarried: flags.balanceCarried,
    archived: false,
    nextStatement: dates?.nextStatement ?? null,
    nextDue: row.dueDay ? (dates?.nextDue ?? cardDates(today, row.dueDay, row.dueDay).nextDue) : null,
    utilization: null,
  };
}

export async function listCards(propertyId?: string | null): Promise<CardDTO[]> {
  const household = await getHousehold();
  const today = todayInChicago();
  const rows = await prisma.creditCard.findMany({
    where: { householdId: household.id, archivedAt: null, ...(propertyId ? { propertyId } : {}) },
    include: { property: true, cardholder: true, bill: { include: { monthEntries: { where: { yearMonth: today.slice(0, 7) } } } } },
    orderBy: [{ nickname: "asc" }, { last4: "asc" }],
  });
  return rows.map((row) => toCard(row, today));
}

async function creditCategory(householdId: string) {
  return (
    (await prisma.category.findFirst({
      where: { householdId, slug: "credit-card-payment", archivedAt: null },
    })) ??
    (await prisma.category.findFirst({
      where: { householdId, archivedAt: null },
      orderBy: { sortOrder: "asc" },
    }))
  );
}

function billFields(input: {
  issuer: string;
  nickname: string;
  last4: string;
  propertyId: string;
  dueDay: number | null;
  statementDay: number | null;
  autopay: boolean;
  cardholderId: string | null;
  today: string;
}) {
  const scheduled = input.dueDay != null;
  const anchor = scheduled
    ? cardDates(input.today, input.statementDay ?? input.dueDay!, input.dueDay!).nextDue
    : input.today;
  return {
    name: cardDisplayName(input.issuer, input.nickname, input.last4),
    propertyId: input.propertyId,
    amount: "0.01",
    amountKind: "variable" as const,
    anchorDate: anchor,
    autopay: input.autopay,
    paymentMode: input.autopay ? "auto" : "manual",
    frequency: "monthly" as const,
    dayOfMonth: input.dueDay,
    dueRuleKind: scheduled ? "day_of_month" : "on_demand",
    personId: input.cardholderId,
    notes: input.issuer ? `${input.issuer} •••• ${input.last4}` : `•••• ${input.last4}`,
  };
}

export async function createCard(input: CardWrite): Promise<CardDTO> {
  const household = await getHousehold();
  const issuer = optionalText(input.issuer, 60);
  const nickname = optionalText(input.nickname, 60);
  const last4 = requireLast4(input.last4);
  const property = await propertyFor(household.id, input.propertyId);
  const statementDay = optionalDay(input.statementDay, "statementDay");
  const dueDay = optionalDay(input.dueDay, "dueDay");
  const category = await creditCategory(household.id);
  if (!category) throw new ServiceError("Add a category in Settings first.", 400, "invalid");
  const today = todayInChicago();
  const label = cardDisplayName(issuer, nickname, last4);
  const payee = await prisma.payee.create({
    data: { householdId: household.id, name: label, accountLast4: last4, categoryId: category.id, notes: issuer || null },
  });
  const bill = await createBill({
    ...billFields({ issuer, nickname, last4, propertyId: property.id, dueDay, statementDay, autopay: Boolean(input.autopay), cardholderId: input.cardholderId || null, today }),
    payeeId: payee.id,
    categoryId: category.id,
  });
  const card = await prisma.creditCard.create({
    data: {
      householdId: household.id,
      propertyId: property.id,
      billId: bill.id,
      issuer,
      nickname,
      last4,
      statementDay,
      dueDay,
      autopay: Boolean(input.autopay),
      cardholderId: input.cardholderId || null,
    },
  });
  events.emit("card.created", { cardId: card.id, nickname: label });
  const cards = await listCards();
  const found = cards.find((item) => item.id === card.id);
  if (!found) throw new ServiceError("Card was not saved.", 500, "server");
  return found;
}

export async function updateCard(id: string, input: CardWrite): Promise<CardDTO> {
  const household = await getHousehold();
  const existing = await prisma.creditCard.findFirst({ where: { id, householdId: household.id } });
  if (!existing) throw new ServiceError("Card not found.", 404, "not_found");
  const issuer = optionalText(input.issuer, 60);
  const nickname = optionalText(input.nickname, 60);
  const last4 = requireLast4(input.last4);
  const property = await propertyFor(household.id, input.propertyId);
  const statementDay = optionalDay(input.statementDay, "statementDay");
  const dueDay = optionalDay(input.dueDay, "dueDay");
  await prisma.creditCard.update({
    where: { id },
    data: {
      propertyId: property.id,
      issuer,
      nickname,
      last4,
      statementDay,
      dueDay,
      autopay: Boolean(input.autopay),
      cardholderId: input.cardholderId || null,
    },
  });
  if (existing.billId) {
    const bill = await prisma.bill.findUnique({ where: { id: existing.billId } });
    if (bill) {
      const today = todayInChicago();
      await updateBill(bill.id, {
        ...billFields({
          issuer,
          nickname,
          last4,
          propertyId: property.id,
          dueDay,
          statementDay,
          autopay: Boolean(input.autopay),
          cardholderId: input.cardholderId || null,
          today,
        }),
        payeeId: bill.payeeId,
        categoryId: bill.categoryId,
        paymentMethodId: bill.paymentMethodId,
        portalUrl: bill.portalUrl,
        reminderDays: bill.reminderDays,
        shiftWeekends: bill.shiftWeekends,
        interval: bill.intervalN,
        unit: bill.intervalUnit,
        graceDays: bill.graceDays,
      });
      if (dueDay == null) {
        const open = await prisma.occurrence.findMany({
          where: { billId: bill.id, skippedAt: null, payments: { none: { undoneAt: null } } },
          select: { id: true },
        });
        if (open.length > 0) {
          await prisma.occurrence.deleteMany({ where: { id: { in: open.map((row) => row.id) } } });
        }
      }
    }
  }
  const cards = await listCards();
  const found = cards.find((item) => item.id === id);
  if (!found) throw new ServiceError("Card not found.", 404, "not_found");
  return found;
}

export async function deleteCard(id: string): Promise<void> {
  const household = await getHousehold();
  const card = await prisma.creditCard.findFirst({ where: { id, householdId: household.id } });
  if (!card) throw new ServiceError("Card not found.", 404, "not_found");
  const payments = card.billId ? await prisma.payment.count({ where: { billId: card.billId, undoneAt: null } }) : 0;
  if (payments > 0) {
    await prisma.creditCard.update({ where: { id }, data: { archivedAt: new Date() } });
    if (card.billId) await prisma.bill.update({ where: { id: card.billId }, data: { archivedAt: new Date() } });
    return;
  }
  await prisma.creditCard.delete({ where: { id } });
  if (card.billId) await prisma.bill.delete({ where: { id: card.billId } }).catch(() => undefined);
}
