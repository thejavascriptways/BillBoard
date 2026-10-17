import { Prisma } from "@prisma/client";

import { cardMonthFlags } from "@/core/card-month";
import { cardDates, utilizationPercent } from "@/core/cards";
import { events } from "@/core/events";
import type { CardDTO } from "@/lib/bill-types";
import { todayInChicago } from "@/lib/dates";
import { fromCents, parseAmountInput, toCents } from "@/lib/money";
import { prisma } from "@/server/db";
import { ServiceError, fieldError } from "@/server/errors";
import { createBill, updateBill } from "@/server/services/bills";
import { getHousehold } from "@/server/services/household";
import { cleanLast4, cleanRequired } from "@/server/text";

function centsAtLeastZero(input: string | number, field: string): number {
  const raw = typeof input === "number" ? String(input) : input.trim();
  if (raw === "" ) throw fieldError(field, "Enter an amount.");
  if (/^0+(\.0{1,2})?$/.test(raw.replace(/[$,\s]/g, ""))) return 0;
  const parsed = parseAmountInput(raw);
  if ("error" in parsed) throw fieldError(field, parsed.error);
  return parsed.cents;
}

function day(value: number, field: string): number {
  const next = Math.trunc(Number(value));
  if (next < 1 || next > 31) throw fieldError(field, "Use a day from 1 to 31.");
  return next;
}

export async function listCards(propertyId?: string | null): Promise<CardDTO[]> {
  const household = await getHousehold();
  const today = todayInChicago();
  const rows = await prisma.creditCard.findMany({
    where: { householdId: household.id, archivedAt: null, ...(propertyId ? { propertyId } : {}) },
    include: { property: true, cardholder: true, bill: { include: { monthEntries: { where: { yearMonth: today.slice(0, 7) } } } } },
    orderBy: { nickname: "asc" },
  });
  return rows.map((row) => {
    const dates = cardDates(today, row.statementDay, row.dueDay);
    const balance = toCents(row.currentBalance.toFixed(2));
    const limit = toCents(row.creditLimit.toFixed(2));
    const month = row.bill?.monthEntries[0];
    const flags = cardMonthFlags(month?.statementAmount?.toFixed(2) ?? null, month?.amountPaid?.toFixed(2) ?? null);
    return {
      id: row.id,
      propertyId: row.propertyId,
      propertyName: row.property.name,
      billId: row.billId,
      issuer: row.issuer,
      nickname: row.nickname,
      last4: row.last4,
      creditLimit: fromCents(limit),
      currentBalance: fromCents(balance),
      statementDay: row.statementDay,
      dueDay: row.dueDay,
      minimumPayment: row.minimumPayment.toFixed(2),
      apr: row.apr ? row.apr.toFixed(3) : null,
      autopay: row.autopay,
      cardholderId: row.cardholderId,
      cardholderName: row.cardholder?.name ?? null,
      statementAmount: month?.statementAmount?.toFixed(2) ?? null,
      amountPaid: month?.amountPaid?.toFixed(2) ?? null,
      paidBelowStatement: flags.paidBelowStatement,
      balanceCarried: flags.balanceCarried,
      archived: false,
      nextStatement: dates.nextStatement,
      nextDue: dates.nextDue,
      utilization: utilizationPercent(balance, limit),
    };
  });
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

export type CardWrite = {
  issuer: string;
  nickname: string;
  last4: string;
  propertyId: string;
  creditLimit: string | number;
  currentBalance: string | number;
  statementDay: number;
  dueDay: number;
  minimumPayment: string | number;
  apr?: string | number | null;
  autopay?: boolean;
  cardholderId?: string | null;
};

function aprOf(value: string | number | null | undefined): Prisma.Decimal | null {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw fieldError("apr", "APR is a percent from 0 to 100.");
  return new Prisma.Decimal(parsed.toFixed(3));
}

export async function createCard(input: CardWrite): Promise<CardDTO> {
  const household = await getHousehold();
  const issuer = cleanRequired("issuer", input.issuer, "issuer", 60);
  const nickname = cleanRequired("nickname", input.nickname, "nickname", 60);
  const last4 = cleanLast4(input.last4);
  if (!last4) throw fieldError("last4", "Enter the last 4 digits.");
  const limit = centsAtLeastZero(input.creditLimit, "creditLimit");
  if (limit <= 0) throw fieldError("creditLimit", "Enter a credit limit greater than zero.");
  const balance = centsAtLeastZero(input.currentBalance, "currentBalance");
  const minimum = centsAtLeastZero(input.minimumPayment, "minimumPayment");
  const category = await creditCategory(household.id);
  if (!category) throw new ServiceError("Add a category in Settings first.", 400, "invalid");
  const today = todayInChicago();
  const dates = cardDates(today, day(input.statementDay, "statementDay"), day(input.dueDay, "dueDay"));
  const payee = await prisma.payee.create({
    data: { householdId: household.id, name: nickname, accountLast4: last4, categoryId: category.id, notes: issuer },
  });
  const bill = await createBill({
    name: `${nickname} payment`,
    payeeId: payee.id,
    propertyId: input.propertyId,
    categoryId: category.id,
    amount: fromCents(Math.max(minimum, 1)),
    amountKind: "variable",
    anchorDate: dates.nextDue,
      autopay: Boolean(input.autopay),
      paymentMode: input.autopay ? "auto" : "manual",
      frequency: "monthly",
      dayOfMonth: day(input.dueDay, "dueDay"),
      dueRuleKind: "day_of_month",
      personId: input.cardholderId || null,
      notes: `${issuer} ••${last4}`,
    });
  const card = await prisma.creditCard.create({
    data: {
      householdId: household.id,
      propertyId: input.propertyId,
      billId: bill.id,
      issuer,
      nickname,
      last4,
      creditLimit: new Prisma.Decimal(fromCents(limit)),
      currentBalance: new Prisma.Decimal(fromCents(balance)),
      statementDay: day(input.statementDay, "statementDay"),
      dueDay: day(input.dueDay, "dueDay"),
      minimumPayment: new Prisma.Decimal(fromCents(minimum)),
      apr: aprOf(input.apr),
      autopay: Boolean(input.autopay),
      cardholderId: input.cardholderId || null,
    },
  });
  events.emit("card.created", { cardId: card.id, nickname });
  const cards = await listCards();
  const found = cards.find((item) => item.id === card.id);
  if (!found) throw new ServiceError("Card was not saved.", 500, "server");
  return found;
}

export async function updateCard(id: string, input: CardWrite): Promise<CardDTO> {
  const household = await getHousehold();
  const existing = await prisma.creditCard.findFirst({ where: { id, householdId: household.id } });
  if (!existing) throw new ServiceError("Card not found.", 404, "not_found");
  const issuer = cleanRequired("issuer", input.issuer, "issuer", 60);
  const nickname = cleanRequired("nickname", input.nickname, "nickname", 60);
  const last4 = cleanLast4(input.last4);
  if (!last4) throw fieldError("last4", "Enter the last 4 digits.");
  const limit = centsAtLeastZero(input.creditLimit, "creditLimit");
  if (limit <= 0) throw fieldError("creditLimit", "Enter a credit limit greater than zero.");
  const balance = centsAtLeastZero(input.currentBalance, "currentBalance");
  const minimum = centsAtLeastZero(input.minimumPayment, "minimumPayment");
  const statementDay = day(input.statementDay, "statementDay");
  const dueDay = day(input.dueDay, "dueDay");
  await prisma.creditCard.update({
    where: { id },
    data: {
      propertyId: input.propertyId,
      issuer,
      nickname,
      last4,
      creditLimit: new Prisma.Decimal(fromCents(limit)),
      currentBalance: new Prisma.Decimal(fromCents(balance)),
      statementDay,
      dueDay,
      minimumPayment: new Prisma.Decimal(fromCents(Math.max(minimum, 0))),
      apr: aprOf(input.apr),
      autopay: Boolean(input.autopay),
      cardholderId: input.cardholderId || null,
    },
  });
  if (existing.billId) {
    const bill = await prisma.bill.findUnique({ where: { id: existing.billId } });
    if (bill) {
      const today = todayInChicago();
      await updateBill(bill.id, {
        name: `${nickname} payment`,
        payeeId: bill.payeeId,
        propertyId: input.propertyId,
        categoryId: bill.categoryId,
        amount: fromCents(Math.max(minimum, 1)),
        amountKind: "variable",
        anchorDate: cardDates(today, statementDay, dueDay).nextDue,
        autopay: Boolean(input.autopay),
        frequency: "monthly",
        dayOfMonth: dueDay,
        notes: `${issuer} ••${last4}`,
        paymentMethodId: bill.paymentMethodId,
        portalUrl: bill.portalUrl,
        reminderDays: bill.reminderDays,
        shiftWeekends: bill.shiftWeekends,
        interval: bill.intervalN,
        unit: bill.intervalUnit,
        graceDays: bill.graceDays,
      });
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
