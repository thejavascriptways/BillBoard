import { prisma } from "../src/server/db";
import { createUtility, utilityCatalog } from "../src/server/services/utilities";
import { seed } from "../prisma/seed";

const note = "vm-demo-utility";

async function clear() {
  const bills = await prisma.bill.findMany({ where: { notes: note }, select: { id: true } });
  const ids = bills.map((bill) => bill.id);
  if (ids.length === 0) return;
  await prisma.bill.deleteMany({ where: { id: { in: ids } } });
}

async function create() {
  await clear();
  await seed(prisma);
  const catalog = await utilityCatalog();
  const household = await prisma.household.findFirstOrThrow();
  const elm = await prisma.property.findFirstOrThrow({ where: { householdId: household.id, slug: "little-elm" } });
  const type = (name: string) => catalog.types.find((row) => row.name === name)!.id;
  await createUtility({
    categoryId: type("Electric"),
    propertyId: elm.id,
    payeeName: "Oncor",
    dueDay: 6,
    amountKind: "variable",
    yearMonth: "2026-10",
    notes: note,
  });
  await createUtility({
    categoryId: type("Gas"),
    propertyId: elm.id,
    payeeName: "Atmos",
    dueDay: 22,
    amountKind: "fixed",
    amount: "64.18",
    yearMonth: "2026-10",
    notes: note,
  });
  await createUtility({
    categoryId: type("Internet"),
    propertyId: elm.id,
    payeeName: "Spectrum",
    dueDay: 28,
    amountKind: "fixed",
    amount: "89.99",
    paymentMode: "auto",
    yearMonth: "2026-10",
    notes: note,
  });
}

async function main() {
  if (process.argv.includes("clear")) await clear();
  else await create();
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
