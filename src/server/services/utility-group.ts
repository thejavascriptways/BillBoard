import { prisma } from "@/server/db";
import { getHousehold } from "@/server/services/household";

/** The Utilities group, found by its stable slug. Never renames an existing row. */
export async function ensureUtilityGroup() {
  const household = await getHousehold();
  const existing = await prisma.category.findFirst({
    where: { householdId: household.id, slug: "utilities" },
  });
  if (existing) return existing;
  return prisma.category.create({
    data: { householdId: household.id, slug: "utilities", name: "Utilities", color: "#0F6E6E", sortOrder: 1 },
  });
}
