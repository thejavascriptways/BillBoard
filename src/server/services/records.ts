import { prisma } from "@/server/db";

/** One query per master table. Dropdowns and Configuration both use these. */
export function householdProperties(householdId: string) {
  return prisma.property.findMany({
    where: { householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function householdCategories(householdId: string) {
  return prisma.category.findMany({
    where: { householdId },
    include: { parent: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function householdPayees(householdId: string) {
  return prisma.payee.findMany({
    where: { householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function householdPaymentMethods(householdId: string) {
  return prisma.paymentMethod.findMany({
    where: { householdId },
    orderBy: [{ sortOrder: "asc" }, { nickname: "asc" }],
  });
}

export function householdPeople(householdId: string) {
  return prisma.person.findMany({
    where: { householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function householdIssuers(householdId: string) {
  return prisma.cardIssuer.findMany({
    where: { householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export function householdLabels(householdId: string, table: string) {
  return prisma.lookupLabel.findMany({
    where: { householdId, table },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}
