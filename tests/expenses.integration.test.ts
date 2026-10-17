import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { todayInChicago } from "@/lib/dates";
import { prisma } from "@/server/db";
import { deleteCategory, listCategories, reorderCategories } from "@/server/services/categories";
import { createExpense, deleteExpense, exportExpenses, listExpenses, updateExpense } from "@/server/services/expenses";
import { createPaymentMethod, deletePaymentMethod } from "@/server/services/payment-methods";
import { deleteProperty, listProperties, reassignProperty, updateProperty } from "@/server/services/properties";
import { getSummary } from "@/server/services/reports";
import { seed } from "../prisma/seed";

const stamp = Date.now().toString(36);
let propertyId = "";
let categoryId = "";
let paymentMethodId = "";

describe("expense service", () => {
  beforeAll(async () => {
    await seed(prisma);
    const property = await prisma.property.create({
      data: {
        householdId: (await prisma.household.findFirstOrThrow()).id,
        slug: `test-${stamp}`,
        name: `Test Cabin ${stamp}`,
        sortOrder: 20,
      },
    });
    const category = await prisma.category.create({
      data: {
        householdId: property.householdId,
        slug: `test-cat-${stamp}`,
        name: `Test Supplies ${stamp}`,
        sortOrder: 40,
      },
    });
    const method = await prisma.paymentMethod.create({
      data: {
        householdId: property.householdId,
        slug: `test-card-${stamp}`,
        nickname: `Test Card ${stamp}`,
        last4: "4242",
        sortOrder: 80,
      },
    });
    propertyId = property.id;
    categoryId = category.id;
    paymentMethodId = method.id;
  });

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { payee: { contains: stamp } } });
    await prisma.property.deleteMany({ where: { slug: { in: [`test-${stamp}`, `hold-${stamp}`] } } });
    await prisma.category.deleteMany({ where: { slug: `test-cat-${stamp}` } });
    await prisma.paymentMethod.deleteMany({ where: { slug: `test-card-${stamp}` } });
    await prisma.$disconnect();
  });

  it("creates, filters, updates, exports, and deletes an expense", async () => {
    const today = todayInChicago();
    const created = await createExpense({
      expenseDate: today,
      propertyId,
      categoryId,
      payee: `Test Vendor, ${stamp}`,
      amount: "42.50",
      paymentMethodId,
      notes: "line\nnote",
    });
    expect(created.isSample).toBe(false);
    expect(created.amount).toBe("42.50");
    expect(created.paymentMethod).toBe(`Test Card ${stamp} ••4242`);

    const listed = await listExpenses({ q: stamp, propertyId });
    expect(listed.total).toBe(1);
    expect(listed.expenses[0]?.payee).toContain(stamp);

    const updated = await updateExpense(created.id, {
      ...created,
      amount: "43.00",
      payee: created.payee,
    });
    expect(updated.amount).toBe("43.00");

    const summary = await getSummary();
    const row = summary.month.byProperty.find((item) => item.id === propertyId);
    expect(row?.total).toBe("43.00");

    const csv = await exportExpenses({ q: stamp });
    expect(csv).toContain(`"Test Vendor, ${stamp}"`);
    expect(csv).toContain("43.00");

    await expect(createPaymentMethod({ nickname: "4111111111111111" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(createPaymentMethod({ nickname: "Visa", last4: "4111111111111111" })).rejects.toMatchObject({
      code: "invalid",
      fieldErrors: { last4: expect.any(String) },
    });

    await deleteExpense(created.id);
    const after = await listExpenses({ q: stamp });
    expect(after.total).toBe(0);

    const renamed = await updateProperty(propertyId, {
      name: `Renamed Cabin ${stamp}`,
      address: "100 Test Lane",
      notes: "Ready later",
    });
    expect(renamed.name).toContain("Renamed");
    expect(renamed.address).toBe("100 Test Lane");
    await deleteCategory(categoryId);
    categoryId = "";
    await deleteProperty(propertyId);
    propertyId = "";
    await deletePaymentMethod(paymentMethodId);
    paymentMethodId = "";

    const properties = await listProperties();
    const personal = properties.find((property) => property.name === "Personal");
    expect(personal?.archived).toBe(false);
    await expect(deleteProperty(personal!.id)).rejects.toMatchObject({ code: "in_use" });
  });

  it("archives, reorders, and reassigns a property that still has expenses", async () => {
    const household = await prisma.household.findFirstOrThrow();
    const property = await prisma.property.create({
      data: {
        householdId: household.id,
        slug: `hold-${stamp}`,
        name: `Hold House ${stamp}`,
        sortOrder: 90,
      },
    });
    const category = await prisma.category.findFirstOrThrow({ where: { householdId: household.id, slug: "other" } });
    const method = await prisma.paymentMethod.findFirstOrThrow({ where: { householdId: household.id, slug: "cash" } });
    const expense = await createExpense({
      expenseDate: todayInChicago(),
      propertyId: property.id,
      categoryId: category.id,
      payee: `Hold Vendor ${stamp}`,
      amount: "8.00",
      paymentMethodId: method.id,
    });
    await expect(deleteProperty(property.id)).rejects.toMatchObject({ code: "in_use" });

    const archived = await updateProperty(property.id, { archived: true });
    expect(archived.archived).toBe(true);
    await expect(
      createExpense({
        expenseDate: todayInChicago(),
        propertyId: property.id,
        categoryId: category.id,
        payee: `Blocked ${stamp}`,
        amount: "1.00",
        paymentMethodId: method.id,
      }),
    ).rejects.toMatchObject({ fieldErrors: { propertyId: expect.any(String) } });

    const categories = await listCategories();
    const flipped = [...categories.map((item) => item.id)].reverse();
    const reordered = await reorderCategories(flipped);
    expect(reordered[0]?.id).toBe(flipped[0]);
    await reorderCategories(categories.map((item) => item.id));

    const personal = await prisma.property.findFirstOrThrow({
      where: { householdId: household.id, slug: "personal" },
    });
    const moved = await reassignProperty(property.id, personal.id);
    expect(moved.moved).toBe(1);
    const gone = await prisma.property.findUnique({ where: { id: property.id } });
    expect(gone).toBeNull();
    const kept = await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(kept.propertyId).toBe(personal.id);
    await prisma.expense.delete({ where: { id: expense.id } });
  });
});
