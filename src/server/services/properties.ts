import type { Property, PropertyKind, PropertyStatus } from "@prisma/client";

import { formatIsoDate, isIsoDate, parseIsoDate } from "@/lib/dates";
import type { PropertyDTO } from "@/lib/types";
import { prisma } from "@/server/db";
import { inUseError, ServiceError, fieldError } from "@/server/errors";
import { applyOrder } from "@/server/order";
import { getHousehold } from "@/server/services/household";
import { householdProperties } from "@/server/services/records";
import { cleanOptional, cleanRequired, uniqueSlug } from "@/server/text";

const KINDS: PropertyKind[] = ["primary", "rental", "vacation", "other"];
const STATUSES: PropertyStatus[] = ["active", "upcoming", "archived"];

function asKind(value: string | null | undefined, fallback: PropertyKind): PropertyKind {
  if (!value) return fallback;
  if (KINDS.includes(value as PropertyKind)) return value as PropertyKind;
  throw fieldError("kind", "Choose primary, rental, vacation, or other.");
}

function asStatus(value: string | null | undefined, fallback: PropertyStatus): PropertyStatus {
  if (!value) return fallback;
  if (STATUSES.includes(value as PropertyStatus)) return value as PropertyStatus;
  throw fieldError("status", "Choose active, upcoming, or archived.");
}

function asDate(field: string, value: string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (!isIsoDate(value)) throw fieldError(field, "Use a real date.");
  return parseIsoDate(value);
}

function toDTO(property: Property, expenseCount: number): PropertyDTO {
  return {
    id: property.id,
    name: property.name,
    address: property.address,
    notes: property.notes,
    kind: property.kind,
    status: property.status,
    purchaseDate: property.purchaseDate ? formatIsoDate(property.purchaseDate) : null,
    roleStartsOn: property.roleStartsOn ? formatIsoDate(property.roleStartsOn) : null,
    roleBecomes: property.roleBecomes,
    sortOrder: property.sortOrder,
    archived: !property.isActive || property.archivedAt != null,
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
  const [rows, usage] = await Promise.all([householdProperties(household.id), counts(household.id)]);
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
  kind?: string | null;
  status?: string | null;
  purchaseDate?: string | null;
  roleStartsOn?: string | null;
  roleBecomes?: string | null;
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
  const status = asStatus(input.status, "active");
  const created = await prisma.property.create({
    data: {
      householdId: household.id,
      name,
      address,
      notes,
      kind: asKind(input.kind, "other"),
      status,
      purchaseDate: asDate("purchaseDate", input.purchaseDate),
      roleStartsOn: asDate("roleStartsOn", input.roleStartsOn),
      roleBecomes: input.roleBecomes ? asKind(input.roleBecomes, "other") : null,
      archivedAt: status === "archived" ? new Date() : null,
      isActive: status !== "archived",
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
  input: {
    name?: string;
    address?: string | null;
    notes?: string | null;
    archived?: boolean;
    kind?: string | null;
    status?: string | null;
    purchaseDate?: string | null;
    roleStartsOn?: string | null;
    roleBecomes?: string | null;
  },
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
  let status = input.status === undefined ? existing.status : asStatus(input.status, existing.status);
  let archivedAt = existing.archivedAt;
  if (input.archived === true) {
    status = "archived";
    archivedAt = existing.archivedAt ?? new Date();
  } else if (input.archived === false) {
    if (status === "archived") status = "active";
    archivedAt = null;
  } else if (status === "archived") archivedAt = existing.archivedAt ?? new Date();
  else archivedAt = null;
  const updated = await prisma.property.update({
    where: { id },
    data: {
      name,
      address,
      notes,
      archivedAt,
      isActive: archivedAt == null,
      kind: input.kind === undefined ? existing.kind : asKind(input.kind, existing.kind),
      status,
      purchaseDate: input.purchaseDate === undefined ? existing.purchaseDate : asDate("purchaseDate", input.purchaseDate),
      roleStartsOn: input.roleStartsOn === undefined ? existing.roleStartsOn : asDate("roleStartsOn", input.roleStartsOn),
      roleBecomes:
        input.roleBecomes === undefined
          ? existing.roleBecomes
          : input.roleBecomes
            ? asKind(input.roleBecomes, existing.kind)
            : null,
    },
  });
  const usage = await prisma.expense.count({ where: { propertyId: id } });
  return toDTO(updated, usage);
}

export async function deleteProperty(id: string): Promise<void> {
  const { existing } = await requireProperty(id);
  const [expenses, bills, cards] = await Promise.all([
    prisma.expense.count({ where: { propertyId: id } }),
    prisma.bill.count({ where: { propertyId: id } }),
    prisma.creditCard.count({ where: { propertyId: id } }),
  ]);
  const count = expenses + bills + cards;
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
    await tx.bill.updateMany({ where: { propertyId: id }, data: { propertyId: toId } });
    await tx.occurrence.updateMany({ where: { propertyId: id }, data: { propertyId: toId } });
    await tx.payment.updateMany({ where: { propertyId: id }, data: { propertyId: toId } });
    await tx.creditCard.updateMany({ where: { propertyId: id }, data: { propertyId: toId } });
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
