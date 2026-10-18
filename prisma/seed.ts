import { pathToFileURL } from "node:url";
import { PrismaClient, type PropertyKind, type PropertyStatus } from "@prisma/client";

import { prisma as sharedPrisma } from "../src/server/db";
import { ensureLookups } from "../src/server/services/masters";

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

const GROUPS: { slug: string; name: string; color: string }[] = [
  { slug: "utilities", name: "Utilities", color: "#0F6E6E" },
  { slug: "household", name: "Household", color: "#5B4B8A" },
  { slug: "insurance", name: "Insurance", color: "#1D6A8A" },
  { slug: "loans", name: "Loans and overdrafts", color: "#8A5A2B" },
  { slug: "credit-cards", name: "Credit Cards", color: "#C2412F" },
  { slug: "kids", name: "Kids' classes and fees", color: "#2F6B4F" },
  { slug: "medical", name: "Medical", color: "#8A3A6B" },
  { slug: "other", name: "Other", color: "#534C66" },
];

const CATEGORIES: { slug: string; name: string; group: string }[] = [
  { slug: "mortgage", name: "Mortgage", group: "household" },
  { slug: "hoa", name: "HOA", group: "household" },
  { slug: "property-tax", name: "Property Tax", group: "household" },
  { slug: "electric", name: "Electric", group: "utilities" },
  { slug: "gas", name: "Gas", group: "utilities" },
  { slug: "water", name: "Water", group: "utilities" },
  { slug: "water-sewer", name: "Water/Sewer", group: "utilities" },
  { slug: "sewer", name: "Sewer", group: "utilities" },
  { slug: "trash", name: "Trash", group: "utilities" },
  { slug: "internet", name: "Internet", group: "utilities" },
  { slug: "phone", name: "Phone", group: "utilities" },
  { slug: "subscriptions", name: "Subscriptions", group: "household" },
  { slug: "repairs-maintenance", name: "Repairs & Maintenance", group: "household" },
  { slug: "furniture-appliances", name: "Furniture & Appliances", group: "household" },
  { slug: "move-setup", name: "Move/Setup", group: "household" },
  { slug: "home-insurance", name: "Home Insurance", group: "insurance" },
  { slug: "credit-card-payment", name: "Credit Card Payment", group: "credit-cards" },
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

  const groupIds = new Map<string, string>();
  for (const [index, group] of GROUPS.entries()) {
    const existing = await client.category.findUnique({
      where: { householdId_slug: { householdId: household.id, slug: group.slug } },
    });
    const saved = existing
      ? await client.category.update({
          where: { id: existing.id },
          data: { color: group.color, sortOrder: index, parentId: null },
        })
      : await client.category.create({
          data: { householdId: household.id, slug: group.slug, name: group.name, color: group.color, sortOrder: index },
        });
    groupIds.set(group.slug, saved.id);
  }

  for (const [index, category] of CATEGORIES.entries()) {
    const parentId = groupIds.get(category.group) ?? null;
    const existing = await client.category.findUnique({
      where: { householdId_slug: { householdId: household.id, slug: category.slug } },
    });
    if (!existing) {
      await client.category.create({
        data: { householdId: household.id, slug: category.slug, name: category.name, sortOrder: 20 + index, parentId, color: "#534C66" },
      });
    } else {
      await client.category.update({ where: { id: existing.id }, data: { parentId } });
    }
  }

  const prefs = await client.householdPrefs.findUnique({ where: { householdId: household.id } });
  const legacyReminders =
    prefs != null && prefs.reminderDays.length === 3 && prefs.reminderDays[0] === 3 && prefs.reminderDays[1] === 1 && prefs.reminderDays[2] === 0;
  await client.householdPrefs.upsert({
    where: { householdId: household.id },
    create: { householdId: household.id, reminderDays: [7, 3, 1, 0], quietStart: 1320, quietEnd: 420 },
    update: legacyReminders ? { reminderDays: [7, 3, 1, 0] } : {},
  });

  await ensureLookups(client, household.id);
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
