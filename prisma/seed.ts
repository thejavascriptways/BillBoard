import { Prisma, PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

import { shiftMonth, todayInChicago } from "../src/lib/dates";
import { prisma as sharedPrisma } from "../src/server/db";

const PROPERTIES = [
  {
    slug: "little-elm",
    name: "Little Elm Home",
    notes: "Current primary residence. Becomes a rental in January 2027.",
    sortOrder: 0,
  },
  {
    slug: "celina",
    name: "Celina Home",
    notes: "New build. Ready January 2027.",
    sortOrder: 1,
  },
  {
    slug: "personal",
    name: "Personal",
    notes: "Not tied to a property.",
    sortOrder: 2,
  },
] as const;

const PAYMENT_METHODS = [
  { slug: "cash", nickname: "Cash", last4: null, sortOrder: 0 },
  { slug: "check", nickname: "Check", last4: null, sortOrder: 1 },
  { slug: "ach", nickname: "ACH", last4: null, sortOrder: 2 },
  { slug: "debit-card", nickname: "Debit card", last4: null, sortOrder: 3 },
  { slug: "credit-card", nickname: "Credit card", last4: null, sortOrder: 4 },
  { slug: "autopay", nickname: "Autopay", last4: null, sortOrder: 5 },
  { slug: "chase-4421", nickname: "Chase", last4: "4421", sortOrder: 6 },
] as const;

const CATEGORIES = [
  ["mortgage", "Mortgage"],
  ["hoa", "HOA"],
  ["property-tax", "Property Tax"],
  ["home-insurance", "Home Insurance"],
  ["electric", "Electric"],
  ["gas", "Gas"],
  ["water-sewer", "Water/Sewer"],
  ["trash", "Trash"],
  ["internet", "Internet"],
  ["phone", "Phone"],
  ["credit-card-payment", "Credit Card Payment"],
  ["subscriptions", "Subscriptions"],
  ["repairs-maintenance", "Repairs & Maintenance"],
  ["furniture-appliances", "Furniture & Appliances"],
  ["move-setup", "Move/Setup"],
  ["other", "Other"],
] as const;

const SAMPLE_NOTE = "Sample expense. Clear these anytime from Settings.";

type SampleSpec = {
  monthsBack: number;
  day: number;
  property: "little-elm" | "celina" | "personal";
  category: string;
  payee: string;
  amount: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number]["slug"];
};

const SAMPLES: SampleSpec[] = [
  { monthsBack: 0, day: 1, property: "little-elm", category: "mortgage", payee: "SAMPLE · Lakeview Servicing", amount: "2418.66", paymentMethod: "autopay" },
  { monthsBack: 0, day: 3, property: "little-elm", category: "hoa", payee: "SAMPLE · Little Elm HOA", amount: "45.00", paymentMethod: "check" },
  { monthsBack: 0, day: 6, property: "little-elm", category: "electric", payee: "SAMPLE · Oncor", amount: "142.18", paymentMethod: "autopay" },
  { monthsBack: 0, day: 2, property: "celina", category: "move-setup", payee: "SAMPLE · Utility deposit", amount: "350.00", paymentMethod: "debit-card" },
  { monthsBack: 0, day: 8, property: "personal", category: "phone", payee: "SAMPLE · T-Mobile", amount: "85.00", paymentMethod: "chase-4421" },
  { monthsBack: 0, day: 4, property: "personal", category: "subscriptions", payee: "SAMPLE · Netflix", amount: "15.99", paymentMethod: "chase-4421" },
  { monthsBack: 1, day: 1, property: "little-elm", category: "mortgage", payee: "SAMPLE · Lakeview Servicing", amount: "2418.66", paymentMethod: "autopay" },
  { monthsBack: 1, day: 12, property: "little-elm", category: "water-sewer", payee: "SAMPLE · City of Little Elm", amount: "68.40", paymentMethod: "ach" },
  { monthsBack: 1, day: 20, property: "celina", category: "furniture-appliances", payee: "SAMPLE · Home Depot", amount: "1240.00", paymentMethod: "credit-card" },
  { monthsBack: 2, day: 15, property: "little-elm", category: "home-insurance", payee: "SAMPLE · State Farm", amount: "186.00", paymentMethod: "autopay" },
  { monthsBack: 3, day: 9, property: "little-elm", category: "repairs-maintenance", payee: "SAMPLE · ABC Plumbing", amount: "275.00", paymentMethod: "check" },
  { monthsBack: 4, day: 18, property: "personal", category: "credit-card-payment", payee: "SAMPLE · Chase ••4421", amount: "420.00", paymentMethod: "ach" },
];

export async function seed(client: PrismaClient = sharedPrisma) {
  const household =
    (await client.household.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await client.household.create({
      data: { name: "Singla household", timezone: "America/Chicago", currency: "USD" },
    }));

  for (const property of PROPERTIES) {
    const existing = await client.property.findUnique({
      where: { householdId_slug: { householdId: household.id, slug: property.slug } },
    });
    if (!existing) {
      await client.property.create({ data: { ...property, householdId: household.id } });
    }
  }

  const existingMethods = await client.paymentMethod.findMany({ where: { householdId: household.id } });
  const methodSlugs = new Set(existingMethods.map((method) => method.slug));
  let nextSort = existingMethods.reduce((max, method) => Math.max(max, method.sortOrder), -1) + 1;
  for (const method of PAYMENT_METHODS) {
    if (methodSlugs.has(method.slug)) continue;
    await client.paymentMethod.create({
      data: {
        ...method,
        householdId: household.id,
        sortOrder: existingMethods.length === 0 ? method.sortOrder : nextSort,
      },
    });
    nextSort += 1;
  }

  for (const [index, [slug, name]] of CATEGORIES.entries()) {
    const existing = await client.category.findUnique({
      where: { householdId_slug: { householdId: household.id, slug } },
    });
    if (!existing) {
      await client.category.create({
        data: { householdId: household.id, slug, name, sortOrder: index },
      });
    }
  }

  await client.expense.deleteMany({ where: { householdId: household.id, isSample: true } });

  const properties = await client.property.findMany({ where: { householdId: household.id } });
  const categories = await client.category.findMany({ where: { householdId: household.id } });
  const paymentMethods = await client.paymentMethod.findMany({ where: { householdId: household.id } });
  const propertyBySlug = new Map(properties.map((property) => [property.slug, property]));
  const categoryBySlug = new Map(categories.map((category) => [category.slug, category]));
  const paymentBySlug = new Map(paymentMethods.map((method) => [method.slug, method]));
  const today = todayInChicago();
  let samples = 0;

  for (const sample of SAMPLES) {
    const expenseDate = shiftMonth(today, -sample.monthsBack, sample.day);
    if (!expenseDate) continue;
    const property = propertyBySlug.get(sample.property);
    const category = categoryBySlug.get(sample.category);
    const paymentMethod = paymentBySlug.get(sample.paymentMethod);
    if (!property || !category || !paymentMethod) continue;
    await client.expense.create({
      data: {
        householdId: household.id,
        expenseDate: new Date(`${expenseDate}T00:00:00.000Z`),
        propertyId: property.id,
        categoryId: category.id,
        paymentMethodId: paymentMethod.id,
        payee: sample.payee,
        amount: new Prisma.Decimal(sample.amount),
        notes: SAMPLE_NOTE,
        isSample: true,
      },
    });
    samples += 1;
  }

  return { household: household.name, samples };
}

async function main() {
  const result = await seed();
  console.log(`BillBoard seed complete for ${result.household}.`);
  console.log(`Sample expenses: ${result.samples} (payees start with "SAMPLE ·").`);
  console.log("Clear them with npm run db:clear-samples, or from Settings in the app.");
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (invokedDirectly) {
  main()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await sharedPrisma.$disconnect();
    });
}
