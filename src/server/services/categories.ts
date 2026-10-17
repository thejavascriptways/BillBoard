import type { Category } from "@prisma/client";

import type { CategoryDTO } from "@/lib/types";
import { prisma } from "@/server/db";
import { inUseError, ServiceError } from "@/server/errors";
import { applyOrder } from "@/server/order";
import { getHousehold } from "@/server/services/household";
import { cleanRequired, uniqueSlug } from "@/server/text";

function toDTO(category: Category, expenseCount: number): CategoryDTO {
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    archived: category.archivedAt != null,
    expenseCount,
  };
}

async function counts(householdId: string): Promise<Map<string, number>> {
  const grouped = await prisma.expense.groupBy({
    by: ["categoryId"],
    where: { householdId },
    _count: { _all: true },
  });
  return new Map(grouped.map((row) => [row.categoryId, row._count._all]));
}

export async function listCategories(): Promise<CategoryDTO[]> {
  const household = await getHousehold();
  const [rows, usage] = await Promise.all([
    prisma.category.findMany({
      where: { householdId: household.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    counts(household.id),
  ]);
  return rows.map((row) => toDTO(row, usage.get(row.id) ?? 0));
}

async function requireCategory(id: string) {
  const household = await getHousehold();
  const existing = await prisma.category.findFirst({ where: { id, householdId: household.id } });
  if (!existing) throw new ServiceError("Category not found.", 404, "not_found");
  return { household, existing };
}

export async function createCategory(input: { name: string }): Promise<CategoryDTO> {
  const household = await getHousehold();
  const name = cleanRequired("name", input.name, "category name", 60);
  const duplicate = await prisma.category.findFirst({
    where: { householdId: household.id, name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) throw new ServiceError("A category with that name already exists.", 409, "conflict");
  const max = await prisma.category.aggregate({
    where: { householdId: household.id },
    _max: { sortOrder: true },
  });
  const created = await prisma.category.create({
    data: {
      householdId: household.id,
      name,
      slug: await uniqueSlug(name, "category", async (slug) => {
        const found = await prisma.category.findUnique({
          where: { householdId_slug: { householdId: household.id, slug } },
        });
        return Boolean(found);
      }),
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  return toDTO(created, 0);
}

export async function updateCategory(
  id: string,
  input: { name?: string; archived?: boolean },
): Promise<CategoryDTO> {
  const { household, existing } = await requireCategory(id);
  const name = input.name === undefined ? existing.name : cleanRequired("name", input.name, "category name", 60);
  const duplicate = await prisma.category.findFirst({
    where: {
      householdId: household.id,
      name: { equals: name, mode: "insensitive" },
      NOT: { id },
    },
  });
  if (duplicate) throw new ServiceError("A category with that name already exists.", 409, "conflict");
  let archivedAt = existing.archivedAt;
  if (input.archived === true) archivedAt = existing.archivedAt ?? new Date();
  if (input.archived === false) archivedAt = null;
  const updated = await prisma.category.update({ where: { id }, data: { name, archivedAt } });
  const usage = await prisma.expense.count({ where: { categoryId: id } });
  return toDTO(updated, usage);
}

export async function deleteCategory(id: string): Promise<void> {
  const { existing } = await requireCategory(id);
  const count = await prisma.expense.count({ where: { categoryId: id } });
  if (count > 0) throw inUseError(existing.name, count, "category");
  await prisma.category.delete({ where: { id } });
}

export async function reassignCategory(id: string, toId: string): Promise<{ moved: number }> {
  const { household, existing } = await requireCategory(id);
  if (toId === id) throw new ServiceError("Choose a different category.", 400, "invalid");
  const target = await prisma.category.findFirst({ where: { id: toId, householdId: household.id } });
  if (!target) throw new ServiceError("Choose a category.", 400, "invalid");
  if (target.archivedAt) throw new ServiceError("Choose a category that isn't archived.", 400, "invalid");
  return prisma.$transaction(async (tx) => {
    const moved = await tx.expense.updateMany({
      where: { categoryId: id, householdId: household.id },
      data: { categoryId: toId },
    });
    await tx.category.delete({ where: { id: existing.id } });
    return { moved: moved.count };
  });
}

export async function reorderCategories(ids: string[]): Promise<CategoryDTO[]> {
  const household = await getHousehold();
  const existing = await prisma.category.findMany({
    where: { householdId: household.id },
    select: { id: true },
  });
  await applyOrder(ids, existing.map((row) => row.id), (id, sortOrder) =>
    prisma.category.update({ where: { id }, data: { sortOrder } }),
  );
  return listCategories();
}
