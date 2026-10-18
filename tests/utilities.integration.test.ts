import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";
import { createBill } from "@/server/services/bills";
import { getChecklist, markMonthPaid, setMonthAmount, undoMonthPaid } from "@/server/services/months";
import { createUtility, utilityCatalog } from "@/server/services/utilities";
import { seed } from "../prisma/seed";

const stamp = `util-${Date.now().toString(36)}`;

describe("utilities month list", () => {
  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { bill: { name: { contains: stamp } } } });
    await prisma.bill.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.payee.deleteMany({ where: { name: { contains: stamp } } });
    await prisma.$disconnect();
  });

  it("filters by home and month, saves this month's amount, and marks paid", async () => {
    await seed(prisma);
    const catalog = await utilityCatalog();
    const household = await prisma.household.findFirstOrThrow();
    const elm = await prisma.property.findFirstOrThrow({ where: { householdId: household.id, slug: "little-elm" } });
    const celina = await prisma.property.findFirstOrThrow({ where: { householdId: household.id, slug: "celina" } });
    const electric = catalog.types.find((type) => type.name === "Electric");
    const gas = catalog.types.find((type) => type.name === "Gas");
    const water = catalog.types.find((type) => type.name === "Water");
    expect(electric && gas && water).toBeTruthy();

    await createUtility({
      categoryId: electric!.id,
      propertyId: elm.id,
      payeeName: `Oncor ${stamp}`,
      dueDate: "2026-10-20",
      amountKind: "variable",
      amount: "",
      yearMonth: "2026-10",
    });
    await createUtility({
      categoryId: gas!.id,
      propertyId: elm.id,
      payeeName: `Atmos ${stamp}`,
      dueDay: 5,
      amountKind: "fixed",
      amount: "40.00",
      yearMonth: "2026-10",
    });
    await createUtility({
      categoryId: water!.id,
      propertyId: celina.id,
      payeeName: `City ${stamp}`,
      dueDate: "2026-10-18",
      amountKind: "variable",
      yearMonth: "2026-10",
    });
    const mortgage = await prisma.category.findFirstOrThrow({ where: { householdId: household.id, slug: "mortgage" } });
    await createBill({
      name: `Mortgage ${stamp}`,
      payeeName: `Lender ${stamp}`,
      propertyId: elm.id,
      categoryId: mortgage.id,
      amount: "2000.00",
      anchorDate: "2026-10-01",
      frequency: "monthly",
      dayOfMonth: 1,
    });

    await expect(createUtility({ categoryId: electric!.id, propertyId: elm.id, yearMonth: "2026-10" })).rejects.toMatchObject({
      fieldErrors: { dueDay: expect.any(String) },
    });

    const october = await getChecklist({
      yearMonth: "2026-10",
      propertyId: elm.id,
      categoryId: catalog.groupId,
      excludeCards: true,
    });
    function ours<T extends { payeeName: string }>(rows: T[]): T[] {
      return rows.filter((row) => row.payeeName.includes(stamp));
    }
    expect(ours(october.rows).map((row) => row.categoryName).sort()).toEqual(["Electric", "Gas"]);
    const electricRow = ours(october.rows).find((row) => row.categoryName === "Electric");
    const gasRow = ours(october.rows).find((row) => row.categoryName === "Gas");
    expect(electricRow?.payeeName).toBe(`Oncor ${stamp}`);
    expect(electricRow?.dueDate).toBe("2026-10-20");
    expect(electricRow?.prompt).toBe(true);
    expect(electricRow?.amount).toBeNull();
    expect(gasRow?.amount).toBe("40.00");
    expect(gasRow?.dueDate).toBe("2026-10-05");

    const november = await getChecklist({
      yearMonth: "2026-11",
      propertyId: elm.id,
      categoryId: catalog.groupId,
      excludeCards: true,
    });
    expect(ours(november.rows).map((row) => row.categoryName)).toEqual(["Gas"]);

    const celinaOctober = await getChecklist({
      yearMonth: "2026-10",
      propertyId: celina.id,
      categoryId: catalog.groupId,
      excludeCards: true,
    });
    expect(ours(celinaOctober.rows).map((row) => row.categoryName)).toEqual(["Water"]);

    const withOthers = await getChecklist({ yearMonth: "2026-10", propertyId: elm.id, excludeCards: true });
    expect(withOthers.rows.some((row) => row.billName.includes(`Mortgage ${stamp}`))).toBe(true);

    await setMonthAmount(gasRow!.id, "55.25");
    const octoberAfter = await getChecklist({
      yearMonth: "2026-10",
      propertyId: elm.id,
      categoryId: catalog.groupId,
      excludeCards: true,
    });
    expect(ours(octoberAfter.rows).find((row) => row.categoryName === "Gas")?.amount).toBe("55.25");
    const novemberAfter = await getChecklist({
      yearMonth: "2026-11",
      propertyId: elm.id,
      categoryId: catalog.groupId,
      excludeCards: true,
    });
    expect(ours(novemberAfter.rows).find((row) => row.categoryName === "Gas")?.amount).toBe("40.00");

    await setMonthAmount(electricRow!.id, "80.00");
    await markMonthPaid(electricRow!.id, { amount: "80.00", paidOn: "2026-10-17", confirm: true });
    const paid = await getChecklist({
      yearMonth: "2026-10",
      propertyId: elm.id,
      categoryId: catalog.groupId,
      excludeCards: true,
    });
    const paidElectric = ours(paid.rows).find((row) => row.categoryName === "Electric");
    expect(paidElectric?.status).toBe("done");
    expect(paidElectric?.paidOn).toBe("2026-10-17");
    expect(paidElectric?.amount).toBe("80.00");

    await undoMonthPaid(electricRow!.id);
    const undone = await getChecklist({
      yearMonth: "2026-10",
      propertyId: elm.id,
      categoryId: catalog.groupId,
      excludeCards: true,
    });
    const openElectric = ours(undone.rows).find((row) => row.categoryName === "Electric");
    expect(openElectric?.status).toBe("not_done");
    expect(openElectric?.paidOn).toBeNull();
    expect(openElectric?.amount).toBe("80.00");
  });
});
