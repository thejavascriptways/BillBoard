import { CURRENCY, TIMEZONE } from "@/lib/constants";
import { formatShortMonth, lastDayIso } from "@/lib/dates";
import { fromCents, toCents } from "@/lib/money";
import type { CategoryTotal, SummaryDTO, TrendMonth } from "@/lib/types";

export type SummaryExpense = {
  expenseDate: string;
  propertyId: string;
  categoryId: string;
  categoryName: string;
  amountCents: number;
};

export type SummaryProperty = {
  id: string;
  name: string;
  sortOrder: number;
};

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function percentShares(cents: number[], total: number): number[] {
  if (total <= 0) return cents.map(() => 0);
  const exact = cents.map((value) => (value / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let leftover = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - (floors[index] ?? 0) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const item of order) {
    if (leftover <= 0) break;
    floors[item.index] = (floors[item.index] ?? 0) + 1;
    leftover -= 1;
  }
  return floors;
}

export function buildSummary(
  today: string,
  properties: SummaryProperty[],
  expenses: SummaryExpense[],
): SummaryDTO {
  const year = Number(today.slice(0, 4));
  const monthStart = `${today.slice(0, 7)}-01`;
  const yearStart = `${year}-01-01`;
  const props = [...properties].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );

  const sumByProperty = (from: string, to: string) =>
    props.map((property) => ({
      id: property.id,
      name: property.name,
      total: fromCents(
        expenses
          .filter(
            (expense) =>
              expense.propertyId === property.id && inRange(expense.expenseDate, from, to),
          )
          .reduce((sum, expense) => sum + expense.amountCents, 0),
      ),
    }));

  const totalOf = (rows: { total: string }[]) =>
    fromCents(rows.reduce((sum, row) => sum + toCents(row.total), 0));

  const categoryRows = (from: string, to: string): CategoryTotal[] => {
    const map = new Map<string, { name: string; cents: number }>();
    for (const expense of expenses) {
      if (!inRange(expense.expenseDate, from, to)) continue;
      const current = map.get(expense.categoryId) ?? { name: expense.categoryName, cents: 0 };
      current.cents += expense.amountCents;
      map.set(expense.categoryId, current);
    }
    const entries = [...map.entries()].sort(
      (a, b) => b[1].cents - a[1].cents || a[1].name.localeCompare(b[1].name),
    );
    const total = entries.reduce((sum, [, value]) => sum + value.cents, 0);
    const shares = percentShares(
      entries.map(([, value]) => value.cents),
      total,
    );
    return entries.map(([id, value], index) => ({
      id,
      name: value.name,
      total: fromCents(value.cents),
      share: shares[index] ?? 0,
    }));
  };

  const currentMonth = Number(today.slice(5, 7));
  const monthlyTrend: TrendMonth[] = [];
  for (let month = 1; month <= currentMonth; month += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const from = `${key}-01`;
    const end = lastDayIso(year, month);
    const to = end < today ? end : today;
    const byProperty = props.map((property) => ({
      id: property.id,
      total: fromCents(
        expenses
          .filter(
            (expense) =>
              expense.propertyId === property.id && inRange(expense.expenseDate, from, to),
          )
          .reduce((sum, expense) => sum + expense.amountCents, 0),
      ),
    }));
    monthlyTrend.push({
      month: key,
      label: formatShortMonth(key),
      total: totalOf(byProperty),
      byProperty,
    });
  }

  const monthByProperty = sumByProperty(monthStart, today);
  const yearByProperty = sumByProperty(yearStart, today);

  return {
    timezone: TIMEZONE,
    currency: CURRENCY,
    asOf: today,
    month: {
      label: new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "long",
        year: "numeric",
      }).format(new Date(Date.UTC(year, currentMonth - 1, 1))),
      from: monthStart,
      to: today,
      total: totalOf(monthByProperty),
      byProperty: monthByProperty,
    },
    yearToDate: {
      label: `${year} year to date`,
      from: yearStart,
      to: today,
      total: totalOf(yearByProperty),
      byProperty: yearByProperty,
    },
    categories: {
      month: categoryRows(monthStart, today),
      yearToDate: categoryRows(yearStart, today),
    },
    monthlyTrend,
  };
}
