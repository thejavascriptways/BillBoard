// Local screenshot helper only. Not part of seed, and not run by the app.
import { writeFileSync } from "node:fs";

import { addDays, todayInChicago } from "../src/lib/dates";
import { prisma } from "../src/server/db";
import { createBill, payOccurrence, queryOccurrences } from "../src/server/services/bills";
import { createCard } from "../src/server/services/cards";
import { seed } from "../prisma/seed";

async function main() {
  await seed(prisma);
  const household = await prisma.household.findFirstOrThrow();
  const home = await prisma.property.findFirstOrThrow({ where: { householdId: household.id, slug: "little-elm" } });
  const personal = await prisma.property.findFirstOrThrow({ where: { householdId: household.id, slug: "personal" } });
  const category = async (slug: string) =>
    prisma.category.findFirstOrThrow({ where: { householdId: household.id, slug } });
  const today = todayInChicago();
  await createBill({
    name: "Demo HOA",
    payeeName: "Demo HOA office",
    propertyId: home.id,
    categoryId: (await category("hoa")).id,
    amount: "45.00",
    anchorDate: addDays(today, -2),
    frequency: "monthly",
  });
  await createBill({
    name: "Demo Electric",
    payeeName: "Demo Oncor",
    propertyId: home.id,
    categoryId: (await category("electric")).id,
    amount: "142.18",
    anchorDate: today,
    frequency: "monthly",
    autopay: true,
  });
  await createBill({
    name: "Demo Internet",
    payeeName: "Demo Spectrum",
    propertyId: home.id,
    categoryId: (await category("internet")).id,
    amount: "80.00",
    anchorDate: addDays(today, 4),
    frequency: "monthly",
  });
  const water = await createBill({
    name: "Demo Water",
    payeeName: "Demo City Water",
    propertyId: home.id,
    categoryId: (await category("water-sewer")).id,
    amount: "68.40",
    anchorDate: addDays(today, -12),
    frequency: "once",
  });
  const due = (await queryOccurrences({ q: "Demo Water", from: addDays(today, -40), to: today })).find((row) => row.billId === water.id);
  if (!due) throw new Error("Demo water occurrence missing.");
  await payOccurrence(due.id, { confirmationNumber: "DEMO-100", note: "Recorded for the screenshot." });
  await createCard({
    issuer: "Chase",
    nickname: "Demo Chase",
    last4: "4421",
    propertyId: personal.id,
    creditLimit: "8000",
    currentBalance: "2460",
    statementDay: 15,
    dueDay: 10,
    minimumPayment: "40",
    apr: "19.99",
    autopay: false,
  });
  writeFileSync("/tmp/billboard-shots.json", JSON.stringify({ billPath: `/bills/${water.id}` }));
  console.log(`/bills/${water.id}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
