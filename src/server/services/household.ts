import { TIMEZONE } from "@/lib/constants";
import { prisma } from "@/server/db";
import { ServiceError } from "@/server/errors";

export async function getHousehold() {
  const household = await prisma.household.findFirst({ orderBy: { createdAt: "asc" } });
  if (!household) {
    throw new ServiceError(
      "BillBoard isn't set up yet. Run npm run db:seed.",
      503,
      "not_seeded",
    );
  }
  if (household.timezone !== TIMEZONE) {
    return { ...household, timezone: TIMEZONE };
  }
  return household;
}
