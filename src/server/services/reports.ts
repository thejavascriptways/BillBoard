import { formatIsoDate, parseIsoDate, todayInChicago } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { buildSummary } from "@/lib/summary";
import type { SummaryDTO } from "@/lib/types";
import { prisma } from "@/server/db";
import { getHousehold } from "@/server/services/household";

export async function getSummary(now = new Date()): Promise<SummaryDTO> {
  const household = await getHousehold();
  const today = todayInChicago(now);
  const year = today.slice(0, 4);
  const [properties, expenses] = await Promise.all([
    prisma.property.findMany({
      where: { householdId: household.id },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.expense.findMany({
      where: {
        householdId: household.id,
        expenseDate: {
          gte: parseIsoDate(`${year}-01-01`),
          lte: parseIsoDate(`${year}-12-31`),
        },
      },
      include: { category: true },
    }),
  ]);

  const withSpend = new Set(expenses.map((expense) => expense.propertyId));
  return buildSummary(
    today,
    properties
      .filter((property) => property.archivedAt == null || withSpend.has(property.id))
      .map((property) => ({
        id: property.id,
        name: property.name,
        sortOrder: property.sortOrder,
      })),
    expenses.map((expense) => ({
      expenseDate: formatIsoDate(expense.expenseDate),
      propertyId: expense.propertyId,
      categoryId: expense.categoryId,
      categoryName: expense.category.name,
      amountCents: toCents(expense.amount.toFixed(2)),
    })),
  );
}
