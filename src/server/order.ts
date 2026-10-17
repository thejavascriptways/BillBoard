import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";
import { fieldError } from "@/server/errors";

export async function applyOrder(
  ids: string[],
  existingIds: string[],
  write: (id: string, sortOrder: number) => Prisma.PrismaPromise<unknown>,
): Promise<void> {
  const unique = new Set(ids);
  if (ids.length !== existingIds.length || unique.size !== ids.length || existingIds.some((id) => !unique.has(id))) {
    throw fieldError("ids", "List every item once.");
  }
  await prisma.$transaction(ids.map((id, index) => write(id, index)));
}
