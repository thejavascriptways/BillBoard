import type { Prisma, PrismaClient } from "@prisma/client";

/** Copy free-text issuers and expense payees into the master tables. Never renames an existing row. */
export async function linkLegacyMasters(client: PrismaClient | Prisma.TransactionClient, householdId: string) {
  const homes = await client.property.findMany({ where: { householdId, typeKey: null }, select: { id: true, kind: true } });
  for (const home of homes) {
    await client.property.update({ where: { id: home.id }, data: { typeKey: home.kind } });
  }

  const cards = await client.creditCard.findMany({ where: { householdId }, select: { issuer: true } });
  const issuers = await client.cardIssuer.findMany({ where: { householdId }, select: { name: true } });
  const issuerNames = new Set(issuers.map((row) => row.name.trim().toLowerCase()));
  let issuerOrder = issuers.length;
  for (const card of cards) {
    const name = card.issuer.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) continue;
    const key = name.toLowerCase();
    if (issuerNames.has(key)) continue;
    issuerNames.add(key);
    await client.cardIssuer.create({ data: { householdId, name, sortOrder: issuerOrder, isActive: true } });
    issuerOrder += 1;
  }

  const expenses = await client.expense.findMany({ where: { householdId }, select: { payee: true } });
  const payees = await client.payee.findMany({ where: { householdId }, select: { name: true, sortOrder: true } });
  const payeeNames = new Set(payees.map((row) => row.name.trim().toLowerCase()));
  let payeeOrder = payees.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  for (const expense of expenses) {
    const name = expense.payee.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) continue;
    const key = name.toLowerCase();
    if (payeeNames.has(key)) continue;
    payeeNames.add(key);
    await client.payee.create({ data: { householdId, name, sortOrder: payeeOrder, isActive: true } });
    payeeOrder += 1;
  }
}
