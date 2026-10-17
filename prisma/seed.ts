import { pathToFileURL } from "node:url";
import { PrismaClient, type PropertyKind, type PropertyStatus } from "@prisma/client";

import { prisma as sharedPrisma } from "../src/server/db";

const PROPERTIES: {
  slug: string;
  name: string;
  notes: string;
  sortOrder: number;
  kind: PropertyKind;
  status: PropertyStatus;
  roleStartsOn: Date | null;
  roleBecomes: PropertyKind | null;
}[] = [
  {
    slug: "little-elm",
    name: "Little Elm Home",
    notes: "Current primary residence. Becomes a rental in January 2027.",
    sortOrder: 0,
    kind: "primary",
    status: "active",
    roleStartsOn: new Date("2027-01-01T00:00:00.000Z"),
    roleBecomes: "rental",
  },
  {
    slug: "celina",
    name: "Celina Home",
    notes: "New build. Becomes the primary home in January 2027.",
    sortOrder: 1,
    kind: "other",
    status: "upcoming",
    roleStartsOn: new Date("2027-01-01T00:00:00.000Z"),
    roleBecomes: "primary",
  },
  {
    slug: "personal",
    name: "Personal",
    notes: "Not tied to a property.",
    sortOrder: 2,
    kind: "other",
    status: "active",
    roleStartsOn: null,
    roleBecomes: null,
  },
];

const CATEGORIES = [
  ["mortgage", "Mortgage"],
  ["hoa", "HOA"],
  ["property-tax", "Property Tax"],
  ["home-insurance", "Home Insurance"],
  ["insurance", "Insurance"],
  ["electric", "Electric"],
  ["gas", "Gas"],
  ["water-sewer", "Water/Sewer"],
  ["sewer", "Sewer"],
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
    } else {
      await client.property.update({
        where: { id: existing.id },
        data: {
          kind: property.kind,
          status: property.status,
          roleStartsOn: property.roleStartsOn,
          roleBecomes: property.roleBecomes,
          notes: existing.notes ?? property.notes,
        },
      });
    }
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

  await client.householdPrefs.upsert({
    where: { householdId: household.id },
    create: { householdId: household.id },
    update: {},
  });

  const cleared = await client.expense.deleteMany({ where: { householdId: household.id, isSample: true } });
  return { household: household.name, samples: 0, cleared: cleared.count };
}

async function main() {
  const result = await seed();
  console.log(`BillBoard seed complete for ${result.household}.`);
  console.log("Properties and categories are ready. No sample bills were added.");
  if (result.cleared > 0) console.log(`Removed ${result.cleared} old sample expenses.`);
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
