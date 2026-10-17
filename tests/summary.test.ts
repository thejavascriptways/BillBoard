import { describe, expect, it } from "vitest";

import { buildSummary } from "@/lib/summary";

const properties = [
  { id: "elm", name: "Little Elm Home", sortOrder: 0 },
  { id: "celina", name: "Celina Home", sortOrder: 1 },
  { id: "personal", name: "Personal", sortOrder: 2 },
];

describe("dashboard summary", () => {
  it("totals this month and year to date per property, plus category share", () => {
    const summary = buildSummary("2026-10-17", properties, [
      { expenseDate: "2026-10-01", propertyId: "elm", categoryId: "mortgage", categoryName: "Mortgage", amountCents: 241866 },
      { expenseDate: "2026-10-06", propertyId: "elm", categoryId: "electric", categoryName: "Electric", amountCents: 14218 },
      { expenseDate: "2026-09-12", propertyId: "celina", categoryId: "setup", categoryName: "Move/Setup", amountCents: 35000 },
      { expenseDate: "2026-10-20", propertyId: "personal", categoryId: "phone", categoryName: "Phone", amountCents: 8500 },
    ]);

    expect(summary.month.total).toBe("2560.84");
    expect(summary.month.byProperty.map((row) => row.total)).toEqual(["2560.84", "0.00", "0.00"]);
    expect(summary.yearToDate.total).toBe("2910.84");
    expect(summary.yearToDate.byProperty[1]?.total).toBe("350.00");
    expect(summary.categories.month.map((row) => [row.name, row.share])).toEqual([
      ["Mortgage", 94],
      ["Electric", 6],
    ]);
    expect(summary.monthlyTrend).toHaveLength(10);
    expect(summary.monthlyTrend[8]?.total).toBe("350.00");
    expect(summary.monthlyTrend[9]?.total).toBe("2560.84");
  });
});
