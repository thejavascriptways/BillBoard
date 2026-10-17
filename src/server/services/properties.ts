import type { Property } from "@prisma/client";

import type { PropertyDTO } from "@/lib/types";
import { prisma } from "@/server/db";
import { inUseError, ServiceError } from "@/server/errors";
import { applyOrder } from "@/server/order";
import { getHousehold } from "@/server/services/household";
import { cleanOptional, cleanRequired, uniqueSlug } from "@/server/text";

function toDTO(property: Property, expenseCount: number): PropertyDTO {
  return {
    id: property.id,
    name: property.name,
    address: property.address,
    notes: property.notes,
    sortOrder: property.sortOrder,
    archived: property.archivedAt != null,
    expenseCount,
  };
}

async function counts(householdId: string): Promise<Map<string, number>> {
  const grouped = await prisma.expense.groupBy({
    by: ["propertyId"],
    where: { householdId },
    _count: { _all: true },
  });
  return new Map(grouped.map((row) => [row.propertyId, row._count._all]));
}

export async function listProperties(): Promise<PropertyDTO[]> {
  const household = await getHousehold();
  const [rows, usage] = await Promise.all([
    prisma.property.findMany({
      where: { householdId: household.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    counts(household.id),
  ]);
  return rows.map((row) => toDTO(row, usage.get(row.id) ?? 0));
}

async function requireProperty(id: string) {
  const household = await getHousehold();
  const existing = await prisma.property.findFirst({ where: { id, householdId: household.id } });
  if (!existing) throw new ServiceError("Property not found.", 404, "not_found");
  return { household, existing };
}

export async function createProperty(input: {
  name: string;
  address?: string | null;
  notes?: string | null;
}): Promise<PropertyDTO> {
  const household = await getHousehold();
  const name = cleanRequired("name", input.name, "property name", 80);
  const address = cleanOptional("address", input.address, 160);
  const notes = cleanOptional("notes", input.notes, 300);
  const duplicate = await prisma.property.findFirst({
    where: { householdId: household.id, name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) throw new ServiceError("A property with that name already exists.", 409, "conflict");
  const max = await prisma.property.aggregate({
    where: { householdId: household.id },
    _max: { sortOrder: true },
  });
  const created = await prisma.property.create({
    data: {
      householdId: household.id,
      name,
      address,
      notes,
      slug: await uniqueSlug(name, "property", async (slug) => {
        const found = await prisma.property.findUnique({
          where: { householdId_slug: { householdId: household.id, slug } },
        });
        return Boolean(found);
      }),
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  return toDTO(created, 0);
}

export async function updateProperty(
  id: string,
  input: { name?: string; address?: string | null; notes?: string | null; archived?: boolean },
): Promise<PropertyDTO> {
  const { household, existing } = await requireProperty(id);
  const name = input.name === undefined ? existing.name : cleanRequired("name", input.name, "property name", 80);
  const address = input.address === undefined ? existing.address : cleanOptional("address", input.address, 160);
  const notes = input.notes === undefined ? existing.notes : cleanOptional("notes", input.notes, 300);
  const duplicate = await prisma.property.findFirst({
    where: {
      householdId: household.id,
      name: { equals: name, mode: "insensitive" },
      NOT: { id },
    },
  });
  if (duplicate) throw new ServiceError("A property with that name already exists.", 409, "conflict");
  let archivedAt = existing.archivedAt;
  if (input.archived === true) archivedAt = existing.archivedAt ?? new Date();
  if (input.archived === false) archivedAt = null;
  const updated = await prisma.property.update({
    where: { id },
    data: { name, address, notes, archivedAt },
  });
  const usage = await prisma.expense.count({ where: { propertyId: id } });
  return toDTO(updated, usage);
}

export async function deleteProperty(id: string): Promise<void> {
  const { existing } = await requireProperty(id);
  const count = await prisma.expense.count({ where: { propertyId: id } });
  if (count > 0) throw inUseError(existing.name, count, "property");
  await prisma.property.delete({ where: { id } });
}

export async function reassignProperty(id: string, toId: string): Promise<{ moved: number }> {
  const { household, existing } = await requireProperty(id);
  if (toId === id) throw new ServiceError("Choose a different property.", 400, "invalid");
  const target = await prisma.property.findFirst({ where: { id: toId, householdId: household.id } });
  if (!target) throw new ServiceError("Choose a property.", 400, "invalid");
  if (target.archivedAt) throw new ServiceError("Choose a property that isn't archived.", 400, "invalid");
  return prisma.$transaction(async (tx) => {
    const moved = await tx.expense.updateMany({
      where: { propertyId: id, householdId: household.id },
      data: { propertyId: toId },
    });
    await tx.property.delete({ where: { id: existing.id } });
    return { moved: moved.count };
  });
}

export async function reorderProperties(ids: string[]): Promise<PropertyDTO[]> {
  const household = await getHousehold();
  const existing = await prisma.property.findMany({
    where: { householdId: household.id },
    select: { id: true },
  });
  await applyOrder(ids, existing.map((row) => row.id), (id, sortOrder) =>
    prisma.property.update({ where: { id }, data: { sortOrder } }),
  );
  return listProperties();
}
