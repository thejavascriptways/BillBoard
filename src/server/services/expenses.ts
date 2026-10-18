import { Prisma, type Category, type Expense, type PaymentMethod, type Property } from "@/server/prisma-types";

import { toCsv } from "@/lib/csv";
import { formatIsoDate, isIsoDate, parseIsoDate } from "@/lib/dates";
import { paymentMethodLabel } from "@/lib/labels";
import { fromCents, parseAmountInput } from "@/lib/money";
import { ACCOUNT_NUMBER_MESSAGE, hasAccountNumber } from "@/lib/secrets";
import type { ExpenseDTO, ExpenseInput, ExpenseListDTO, ExpenseQuery } from "@/lib/types";
import { prisma } from "@/server/db";
import { fieldError, ServiceError } from "@/server/errors";
import { getHousehold } from "@/server/services/household";

type ExpenseRow = Expense & { property: Property; category: Category; paymentMethod: PaymentMethod };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

function toDTO(row: ExpenseRow): ExpenseDTO {
  return {
    id: row.id,
    expenseDate: formatIsoDate(row.expenseDate),
    propertyId: row.propertyId,
    propertyName: row.property.name,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    payee: row.payee,
    amount: row.amount.toFixed(2),
    paymentMethodId: row.paymentMethodId,
    paymentMethod: paymentMethodLabel(row.paymentMethod),
    notes: row.notes,
    isSample: row.isSample,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function cleanText(
  field: string,
  value: string,
  label: string,
  max: number,
): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) throw fieldError(field, `Enter a ${label}.`);
  if (trimmed.length > max) throw fieldError(field, `Use ${max} characters or fewer.`);
  if (hasAccountNumber(trimmed)) throw fieldError(field, ACCOUNT_NUMBER_MESSAGE);
  return trimmed;
}

function cleanNotes(notes: string | null | undefined): string | null {
  if (notes == null) return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  if (trimmed.length > 500) throw fieldError("notes", "Use 500 characters or fewer.");
  if (hasAccountNumber(trimmed)) throw fieldError("notes", ACCOUNT_NUMBER_MESSAGE);
  return trimmed;
}

async function assertLinks(
  householdId: string,
  propertyId: string,
  categoryId: string,
  paymentMethodId: string,
  previous?: { propertyId: string; categoryId: string; paymentMethodId: string },
) {
  const [property, category, paymentMethod] = await Promise.all([
    prisma.property.findFirst({ where: { id: propertyId, householdId } }),
    prisma.category.findFirst({ where: { id: categoryId, householdId } }),
    prisma.paymentMethod.findFirst({ where: { id: paymentMethodId, householdId } }),
  ]);
  if (!property) throw fieldError("propertyId", "Choose a property.");
  if (!category) throw fieldError("categoryId", "Choose a category.");
  if (!paymentMethod) throw fieldError("paymentMethodId", "Choose a payment method.");
  if (property.archivedAt && property.id !== previous?.propertyId) {
    throw fieldError("propertyId", "That property is archived. Restore it in Settings, or choose another.");
  }
  if (category.archivedAt && category.id !== previous?.categoryId) {
    throw fieldError("categoryId", "That category is archived. Restore it in Settings, or choose another.");
  }
  if (paymentMethod.archivedAt && paymentMethod.id !== previous?.paymentMethodId) {
    throw fieldError("paymentMethodId", "That payment method is archived. Restore it in Settings, or choose another.");
  }
}

function parseExpense(input: ExpenseInput) {
  if (!isIsoDate(input.expenseDate) || input.expenseDate < "2000-01-01" || input.expenseDate > "2100-12-31") {
    throw fieldError("expenseDate", "Enter a valid date.");
  }
  const amount = parseAmountInput(input.amount);
  if ("error" in amount) throw fieldError("amount", amount.error);
  return {
    expenseDate: parseIsoDate(input.expenseDate),
    propertyId: input.propertyId,
    categoryId: input.categoryId,
    payee: cleanText("payee", input.payee, "payee", 120),
    amount: new Prisma.Decimal(fromCents(amount.cents)),
    paymentMethodId: input.paymentMethodId,
    notes: cleanNotes(input.notes),
  };
}

function encodeCursor(date: string, id: string): string {
  return Buffer.from(`${date}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { date: string; id: string } | null {
  try {
    const [date, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!date || !id || !isIsoDate(date)) return null;
    return { date, id };
  } catch {
    return null;
  }
}

export async function listExpenses(query: ExpenseQuery): Promise<ExpenseListDTO> {
  const household = await getHousehold();
  if (query.from && !isIsoDate(query.from)) throw fieldError("from", "Enter a valid start date.");
  if (query.to && !isIsoDate(query.to)) throw fieldError("to", "Enter a valid end date.");
  if (query.from && query.to && query.from > query.to) {
    throw fieldError("to", "The end date is before the start date.");
  }
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const search = query.q?.trim();
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) throw fieldError("cursor", "That page token is invalid.");

  const where: Prisma.ExpenseWhereInput = {
    householdId: household.id,
    ...(query.propertyId ? { propertyId: query.propertyId } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.from || query.to
      ? {
          expenseDate: {
            ...(query.from ? { gte: parseIsoDate(query.from) } : {}),
            ...(query.to ? { lte: parseIsoDate(query.to) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { payee: { contains: search, mode: "insensitive" } },
            { notes: { contains: search, mode: "insensitive" } },
            { paymentMethod: { nickname: { contains: search, mode: "insensitive" } } },
            { paymentMethod: { last4: { contains: search, mode: "insensitive" } } },
            { property: { name: { contains: search, mode: "insensitive" } } },
            { category: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await prisma.expense.count({ where });
  const rows = await prisma.expense.findMany({
    where: {
      AND: [
        where,
        ...(cursor
          ? [
              {
                OR: [
                  { expenseDate: { lt: parseIsoDate(cursor.date) } },
                  { expenseDate: parseIsoDate(cursor.date), id: { lt: cursor.id } },
                ],
              },
            ]
          : []),
      ],
    },
    include: { property: true, category: true, paymentMethod: true },
    orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const page = rows.slice(0, limit);
  const extra = rows[limit];
  const last = page.at(-1);
  return {
    expenses: page.map(toDTO),
    nextCursor: extra && last ? encodeCursor(formatIsoDate(last.expenseDate), last.id) : null,
    total,
  };
}

export async function getExpense(id: string): Promise<ExpenseDTO> {
  const household = await getHousehold();
  const row = await prisma.expense.findFirst({
    where: { id, householdId: household.id },
    include: { property: true, category: true, paymentMethod: true },
  });
  if (!row) throw new ServiceError("Expense not found.", 404, "not_found");
  return toDTO(row);
}

export async function createExpense(input: ExpenseInput): Promise<ExpenseDTO> {
  const household = await getHousehold();
  const data = parseExpense(input);
  await assertLinks(household.id, data.propertyId, data.categoryId, data.paymentMethodId);
  const created = await prisma.expense.create({
    data: { ...data, householdId: household.id, isSample: false },
    include: { property: true, category: true, paymentMethod: true },
  });
  return toDTO(created);
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<ExpenseDTO> {
  const household = await getHousehold();
  const existing = await prisma.expense.findFirst({ where: { id, householdId: household.id } });
  if (!existing) throw new ServiceError("Expense not found.", 404, "not_found");
  const data = parseExpense(input);
  await assertLinks(household.id, data.propertyId, data.categoryId, data.paymentMethodId, existing);
  const updated = await prisma.expense.update({
    where: { id },
    data,
    include: { property: true, category: true, paymentMethod: true },
  });
  return toDTO(updated);
}

export async function deleteExpense(id: string): Promise<void> {
  const household = await getHousehold();
  const existing = await prisma.expense.findFirst({ where: { id, householdId: household.id } });
  if (!existing) throw new ServiceError("Expense not found.", 404, "not_found");
  await prisma.expense.delete({ where: { id } });
}

export async function countSampleExpenses(): Promise<number> {
  const household = await getHousehold();
  return prisma.expense.count({ where: { householdId: household.id, isSample: true } });
}

export async function clearSampleExpenses(): Promise<number> {
  const household = await getHousehold();
  const result = await prisma.expense.deleteMany({
    where: { householdId: household.id, isSample: true },
  });
  return result.count;
}

export function expensesToCsv(expenses: ExpenseDTO[]): string {
  return toCsv(
    ["Date", "Property", "Category", "Payee", "Amount", "Payment Method", "Notes", "Sample"],
    expenses.map((expense) => [
      expense.expenseDate,
      expense.propertyName,
      expense.categoryName,
      expense.payee,
      expense.amount,
      expense.paymentMethod,
      expense.notes ?? "",
      expense.isSample ? "yes" : "no",
    ]),
  );
}

export async function exportExpenses(query: Omit<ExpenseQuery, "cursor" | "limit">): Promise<string> {
  const collected: ExpenseDTO[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const result = await listExpenses({ ...query, cursor, limit: MAX_LIMIT });
    collected.push(...result.expenses);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return expensesToCsv(collected);
}
