// Local screenshot helper only. Not part of seed, and not run by the app.
import { writeFileSync } from "node:fs";

import { addDays, todayInChicago } from "../src/lib/dates";
import { prisma } from "../src/server/db";
import { createBill, payOccurrence, queryOccurrences } from "../src/server/services/bills";
import { createCard } from "../src/server/services/cards";
import { ensureMonth } from "../src/server/services/months";
import { createPerson } from "../src/server/services/people";
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
  await createBill({
    name: "Demo Home Insurance",
    payeeName: "Demo Insurer",
    propertyId: home.id,
    categoryId: (await category("home-insurance")).id,
    amount: "120.00",
    amountKind: "fixed",
    anchorDate: today,
    frequency: "monthly",
    paymentMode: "covered",
    dueOnNote: "paid with the mortgage",
  });
  const person = await createPerson({ name: "Demo Deepak" });
  await createCard({
    cardholderId: person.id,
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
  await ensureMonth(today.slice(0, 7));
  const cardEntry = await prisma.monthEntry.findFirst({
    where: { bill: { name: "Demo Chase payment" }, yearMonth: today.slice(0, 7) },
  });
  if (cardEntry) {
    await prisma.monthEntry.update({
      where: { id: cardEntry.id },
      data: { statementAmount: "200.00", amount: "40.00", amountPaid: "40.00", status: "done", paidOn: new Date(`${today}T00:00:00.000Z`) },
    });
  }
  const waterEntry = await prisma.monthEntry.findFirst({ where: { billId: water.id, yearMonth: today.slice(0, 7) } });
  if (waterEntry) {
    await prisma.monthEntry.update({
      where: { id: waterEntry.id },
      data: { status: "done", amount: "68.40", amountPaid: "68.40", paidOn: new Date(`${today}T00:00:00.000Z`) },
    });
  }
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
