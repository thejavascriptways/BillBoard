import { totalUtilization } from "@/core/cards";
import type { DueBoardDTO } from "@/lib/bill-types";
import { addDays, formatIsoDate, todayInChicago } from "@/lib/dates";
import { fromCents, toCents } from "@/lib/money";
import { queryOccurrences } from "@/server/services/bills";
import { listCards } from "@/server/services/cards";

export async function getDueBoard(propertyId?: string | null): Promise<DueBoardDTO> {
  const today = todayInChicago();
  const monthFrom = `${today.slice(0, 7)}-01`;
  const [year, month] = today.split("-").map(Number);
  const monthTo = formatIsoDate(new Date(Date.UTC(year, month, 0)));
  const rows = await queryOccurrences({
    propertyId,
    from: addDays(today, -400),
    to: addDays(today, 40),
  });
  const open = rows.filter((row) => row.status !== "paid" && row.status !== "skipped");
  const monthRows = rows.filter((row) => row.dueDate >= monthFrom && row.dueDate <= monthTo && row.status !== "skipped");
  const properties = new Map<string, { id: string; name: string; due: number; paid: number }>();
  for (const row of monthRows) {
    const current = properties.get(row.propertyId) ?? { id: row.propertyId, name: row.propertyName, due: 0, paid: 0 };
    current.due += toCents(row.expectedAmount);
    current.paid += toCents(row.paidAmount);
    properties.set(row.propertyId, current);
  }
  const cards = await listCards(propertyId);
  return {
    asOf: today,
    overdue: open.filter((row) => row.dueDate < today),
    dueToday: open.filter((row) => row.dueDate === today),
    next7: open.filter((row) => row.dueDate > today && row.dueDate <= addDays(today, 7)),
    next30: open.filter((row) => row.dueDate > addDays(today, 7) && row.dueDate <= addDays(today, 30)),
    month: {
      due: fromCents(monthRows.reduce((sum, row) => sum + toCents(row.expectedAmount), 0)),
      paid: fromCents(monthRows.reduce((sum, row) => sum + toCents(row.paidAmount), 0)),
    },
    byProperty: [...properties.values()].map((row) => ({
      id: row.id,
      name: row.name,
      due: fromCents(row.due),
      paid: fromCents(row.paid),
    })),
    cards: {
      totalUtilization: totalUtilization(
        cards.map((card) => ({
          balanceCents: toCents(card.currentBalance),
          limitCents: toCents(card.creditLimit),
        })),
      ),
      items: cards,
    },
  };
}
