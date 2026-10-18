import type { Prisma, PrismaClient } from "@prisma/client";

import {
  MASTER_TABLES,
  PAYMENT_MODE_KEYS,
  PROPERTY_TYPE_KEYS,
  SYSTEM_LISTS,
  type MasterRow,
  type MasterTableId,
} from "@/lib/masters";
import { prisma } from "@/server/db";
import { ServiceError, fieldError } from "@/server/errors";
import { getHousehold } from "@/server/services/household";
import {
  householdCategories,
  householdIssuers,
  householdLabels,
  householdPayees,
  householdPaymentMethods,
  householdPeople,
  householdProperties,
} from "@/server/services/records";
import { ensureUtilityGroup } from "@/server/services/utility-group";
import { cleanLast4, cleanOptional, cleanRequired, uniqueSlug } from "@/server/text";

const TABLES = new Set<string>(MASTER_TABLES.map((table) => table.id));

export function assertTable(value: string): MasterTableId {
  if (!TABLES.has(value)) throw fieldError("table", "Choose a list.");
  return value as MasterTableId;
}

export async function ensureLookups(client: PrismaClient | Prisma.TransactionClient, householdId: string) {
  const rows = [
    ...PAYMENT_MODE_KEYS.map((row, index) => ({ table: "payment_mode", ...row, sortOrder: index })),
    ...PROPERTY_TYPE_KEYS.map((row, index) => ({ table: "property_type", ...row, sortOrder: index })),
  ];
  for (const row of rows) {
    await client.lookupLabel.upsert({
      where: { householdId_table_key: { householdId, table: row.table, key: row.key } },
      create: {
        householdId,
        table: row.table,
        key: row.key,
        label: row.label,
        sortOrder: row.sortOrder,
        isSystem: true,
        isActive: true,
      },
      update: {},
    });
  }
}

function inactiveStamp(active: boolean, current: Date | null): Date | null {
  if (active) return null;
  return current ?? new Date();
}

function rowBase(input: {
  id: string;
  key?: string;
  name: string;
  detail?: string | null;
  color?: string | null;
  parentId?: string | null;
  parentName?: string | null;
  isActive: boolean;
  sortOrder: number;
  usage: number;
  system?: boolean;
  address?: string | null;
  notes?: string | null;
  status?: string | null;
  last4?: string | null;
}): MasterRow {
  return {
    id: input.id,
    key: input.key ?? input.id,
    name: input.name,
    detail: input.detail ?? null,
    color: input.color ?? null,
    parentId: input.parentId ?? null,
    parentName: input.parentName ?? null,
    isActive: input.isActive,
    sortOrder: input.sortOrder,
    usage: input.usage,
    system: input.system ?? false,
    address: input.address ?? null,
    notes: input.notes ?? null,
    status: input.status ?? null,
    last4: input.last4 ?? null,
  };
}

async function utilityParentId(): Promise<string> {
  const group = await ensureUtilityGroup();
  return group.id;
}

export async function listMasters(
  table: MasterTableId,
  options?: { activeOnly?: boolean; q?: string | null; includeId?: string | null },
): Promise<MasterRow[]> {
  const household = await getHousehold();
  await ensureLookups(prisma, household.id);
  const query = options?.q?.trim().toLowerCase() ?? "";
  let rows = await rowsFor(table, household.id);
  if (options?.activeOnly) {
    const include = options.includeId;
    rows = rows.filter((row) => row.isActive || (include != null && include !== "" && (row.id === include || row.key === include)));
  }
  if (query) rows = rows.filter((row) => row.name.toLowerCase().includes(query) || (row.detail ?? "").toLowerCase().includes(query));
  return rows;
}

async function rowsFor(table: MasterTableId, householdId: string): Promise<MasterRow[]> {
  if (table === "system") {
    return SYSTEM_LISTS.flatMap((group, groupIndex) =>
      group.items.map((item, index) =>
        rowBase({
          id: `${group.group}:${item}`,
          key: item,
          name: item,
          detail: group.group,
          isActive: true,
          sortOrder: groupIndex * 20 + index,
          usage: 0,
          system: true,
        }),
      ),
    );
  }
  if (table === "homes") {
    const homes = await householdProperties(householdId);
    const count = new Map<string, number>();
    try {
      const [bills, expenses, cards] = await Promise.all([
        prisma.bill.groupBy({ by: ["propertyId"], where: { householdId }, _count: { _all: true } }),
        prisma.expense.groupBy({ by: ["propertyId"], where: { householdId }, _count: { _all: true } }),
        prisma.creditCard.groupBy({ by: ["propertyId"], where: { householdId }, _count: { _all: true } }),
      ]);
      for (const row of [...bills, ...expenses, ...cards]) {
        count.set(row.propertyId, (count.get(row.propertyId) ?? 0) + row._count._all);
      }
    } catch {
      // Usage is optional. A count failure must not hide homes from Configuration.
    }
    const labels = await householdLabels(householdId, "property_type");
    return homes.map((home) => {
      const key = home.typeKey || home.kind;
      const label = labels.find((item) => item.key === key)?.label ?? home.kind;
      const active = home.isActive && home.archivedAt == null;
      return rowBase({
        id: home.id,
        key,
        name: home.name,
        detail: `${label} · ${home.status}`,
        isActive: active,
        sortOrder: home.sortOrder,
        usage: count.get(home.id) ?? 0,
        address: home.address,
        notes: home.notes,
        status: home.status,
      });
    });
  }
  if (table === "utility-types" || table === "categories") {
    const parentId = table === "utility-types" ? await utilityParentId() : undefined;
    const categories = (await householdCategories(householdId)).filter((category) => (parentId ? category.parentId === parentId : true));
    const [bills, expenses] = await Promise.all([
      prisma.bill.groupBy({ by: ["categoryId"], where: { householdId }, _count: { _all: true } }),
      prisma.expense.groupBy({ by: ["categoryId"], where: { householdId }, _count: { _all: true } }),
    ]);
    const count = new Map<string, number>();
    for (const row of [...bills, ...expenses]) count.set(row.categoryId, (count.get(row.categoryId) ?? 0) + row._count._all);
    const childCount = new Map<string, number>();
    if (table === "categories") {
      for (const category of categories) {
        if (category.parentId) childCount.set(category.parentId, (childCount.get(category.parentId) ?? 0) + 1);
      }
    }
    return categories.map((category) =>
      rowBase({
        id: category.id,
        key: category.slug,
        name: category.name,
        detail: category.parent?.name ?? (category.parentId ? null : "Group"),
        color: category.color,
        parentId: category.parentId,
        parentName: category.parent?.name ?? null,
        isActive: category.isActive && category.archivedAt == null,
        sortOrder: category.sortOrder,
        usage: (count.get(category.id) ?? 0) + (childCount.get(category.id) ?? 0),
      }),
    );
  }
  if (table === "payees") {
    const payees = await householdPayees(householdId);
    const [bills, payments] = await Promise.all([
      prisma.bill.groupBy({ by: ["payeeId"], where: { householdId, payeeId: { not: null } }, _count: { _all: true } }),
      prisma.payment.groupBy({ by: ["payeeId"], where: { householdId }, _count: { _all: true } }),
    ]);
    const count = new Map<string, number>();
    for (const row of bills) if (row.payeeId) count.set(row.payeeId, (count.get(row.payeeId) ?? 0) + row._count._all);
    for (const row of payments) count.set(row.payeeId, (count.get(row.payeeId) ?? 0) + row._count._all);
    return payees.map((payee) =>
      rowBase({
        id: payee.id,
        name: payee.name,
        detail: payee.accountLast4 ? `•••• ${payee.accountLast4}` : null,
        isActive: payee.isActive && payee.archivedAt == null,
        sortOrder: payee.sortOrder,
        usage: count.get(payee.id) ?? 0,
        notes: payee.notes,
        last4: payee.accountLast4,
      }),
    );
  }
  if (table === "payment-methods") {
    const methods = await householdPaymentMethods(householdId);
    const [bills, expenses, payments] = await Promise.all([
      prisma.bill.groupBy({ by: ["paymentMethodId"], where: { householdId, paymentMethodId: { not: null } }, _count: { _all: true } }),
      prisma.expense.groupBy({ by: ["paymentMethodId"], where: { householdId }, _count: { _all: true } }),
      prisma.payment.groupBy({ by: ["paymentMethodId"], where: { householdId, paymentMethodId: { not: null } }, _count: { _all: true } }),
    ]);
    const count = new Map<string, number>();
    for (const row of [...expenses]) count.set(row.paymentMethodId, (count.get(row.paymentMethodId) ?? 0) + row._count._all);
    for (const row of [...bills, ...payments]) {
      if (!row.paymentMethodId) continue;
      count.set(row.paymentMethodId, (count.get(row.paymentMethodId) ?? 0) + row._count._all);
    }
    return methods.map((method) =>
      rowBase({
        id: method.id,
        name: method.nickname,
        detail: method.last4 ? `•••• ${method.last4}` : null,
        isActive: method.isActive && method.archivedAt == null,
        sortOrder: method.sortOrder,
        usage: count.get(method.id) ?? 0,
        last4: method.last4,
      }),
    );
  }
  if (table === "people") {
    const people = await householdPeople(householdId);
    const [bills, cards] = await Promise.all([
      prisma.bill.groupBy({ by: ["personId"], where: { householdId, personId: { not: null } }, _count: { _all: true } }),
      prisma.creditCard.groupBy({ by: ["cardholderId"], where: { householdId, cardholderId: { not: null } }, _count: { _all: true } }),
    ]);
    const count = new Map<string, number>();
    for (const row of bills) if (row.personId) count.set(row.personId, (count.get(row.personId) ?? 0) + row._count._all);
    for (const row of cards) if (row.cardholderId) count.set(row.cardholderId, (count.get(row.cardholderId) ?? 0) + row._count._all);
    return people.map((person) =>
      rowBase({
        id: person.id,
        name: person.name,
        isActive: person.isActive && person.archivedAt == null,
        sortOrder: person.sortOrder,
        usage: count.get(person.id) ?? 0,
        notes: person.notes,
      }),
    );
  }
  if (table === "issuers") {
    const issuers = await householdIssuers(householdId);
    const cards = await prisma.creditCard.findMany({ where: { householdId }, select: { issuer: true } });
    return issuers.map((issuer) =>
      rowBase({
        id: issuer.id,
        key: issuer.name,
        name: issuer.name,
        isActive: issuer.isActive,
        sortOrder: issuer.sortOrder,
        usage: cards.filter((card) => card.issuer.trim().toLowerCase() === issuer.name.toLowerCase()).length,
      }),
    );
  }
  const labels = await householdLabels(householdId, table === "payment-modes" ? "payment_mode" : "property_type");
  if (table === "payment-modes") {
    const bills = await prisma.bill.groupBy({ by: ["paymentMode"], where: { householdId }, _count: { _all: true } });
    const count = new Map(bills.map((row) => [row.paymentMode, row._count._all]));
    return labels.map((label) =>
      rowBase({
        id: label.id,
        key: label.key,
        name: label.label,
        detail: label.key,
        isActive: label.isActive,
        sortOrder: label.sortOrder,
        usage: count.get(label.key as "manual") ?? 0,
        system: label.isSystem,
      }),
    );
  }
  const homes = await prisma.property.findMany({ where: { householdId }, select: { kind: true, typeKey: true } });
  return labels.map((label) =>
    rowBase({
      id: label.id,
      key: label.key,
      name: label.label,
      detail: label.isSystem ? label.key : "Custom",
      isActive: label.isActive,
      sortOrder: label.sortOrder,
      usage: homes.filter((home) => (home.typeKey || home.kind) === label.key).length,
      system: label.isSystem,
    }),
  );
}

export type MasterWrite = {
  name?: string | null;
  detail?: string | null;
  color?: string | null;
  parentId?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  address?: string | null;
  notes?: string | null;
  status?: string | null;
  last4?: string | null;
  key?: string | null;
};

function inUse(name: string, usage: number): never {
  const records = usage === 1 ? "1 record" : `${usage} records`;
  throw new ServiceError(`${name} is used on ${records}. Make it inactive, or merge it into another value.`, 409, "in_use");
}

export async function createMaster(table: MasterTableId, input: MasterWrite): Promise<MasterRow> {
  if (table === "system" || table === "payment-modes") {
    throw new ServiceError("These values are defined by the app. You can rename a payment mode or make it inactive.", 400, "system");
  }
  const household = await getHousehold();
  await ensureLookups(prisma, household.id);
  const name = cleanRequired("name", input.name ?? "", "name", 80);
  if (table === "homes") {
    const systemKind = input.key && ["primary", "rental", "vacation", "other"].includes(input.key) ? input.key : "other";
    const { createProperty } = await import("@/server/services/properties");
    const created = await createProperty({
      name,
      address: input.address,
      notes: input.notes,
      kind: systemKind,
      status: input.status || "active",
    });
    if (input.key) {
      await prisma.property.update({ where: { id: created.id }, data: { typeKey: input.key } });
    }
    return (await listMasters("homes")).find((row) => row.id === created.id)!;
  }
  if (table === "utility-types" || table === "categories") {
    const parentId = table === "utility-types" ? await utilityParentId() : input.parentId || null;
    const duplicate = await prisma.category.findFirst({
      where: { householdId: household.id, name: { equals: name, mode: "insensitive" } },
    });
    if (duplicate) throw new ServiceError("A category with that name already exists.", 409, "conflict");
    const max = await prisma.category.aggregate({ where: { householdId: household.id }, _max: { sortOrder: true } });
    const created = await prisma.category.create({
      data: {
        householdId: household.id,
        name,
        slug: await uniqueSlug(name, "category", async (slug) => Boolean(await prisma.category.findUnique({ where: { householdId_slug: { householdId: household.id, slug } } }))),
        color: input.color || "#534C66",
        parentId,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    return (await listMasters(table)).find((row) => row.id === created.id)!;
  }
  if (table === "payees") {
    const existing = await prisma.payee.findFirst({ where: { householdId: household.id, name: { equals: name, mode: "insensitive" } } });
    if (existing) return (await listMasters("payees")).find((row) => row.id === existing.id)!;
    const max = await prisma.payee.aggregate({ where: { householdId: household.id }, _max: { sortOrder: true } });
    const created = await prisma.payee.create({
      data: {
        householdId: household.id,
        name,
        accountLast4: cleanLast4(input.last4),
        notes: cleanOptional("notes", input.notes, 300),
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    return (await listMasters("payees")).find((row) => row.id === created.id)!;
  }
  if (table === "payment-methods") {
    const max = await prisma.paymentMethod.aggregate({ where: { householdId: household.id }, _max: { sortOrder: true } });
    const created = await prisma.paymentMethod.create({
      data: {
        householdId: household.id,
        nickname: name,
        last4: cleanLast4(input.last4),
        slug: await uniqueSlug(name, "method", async (slug) => Boolean(await prisma.paymentMethod.findUnique({ where: { householdId_slug: { householdId: household.id, slug } } }))),
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    return (await listMasters("payment-methods")).find((row) => row.id === created.id)!;
  }
  if (table === "people") {
    const duplicate = await prisma.person.findFirst({ where: { householdId: household.id, name: { equals: name, mode: "insensitive" } } });
    if (duplicate) throw new ServiceError("That person is already on the list.", 409, "conflict");
    const max = await prisma.person.aggregate({ where: { householdId: household.id }, _max: { sortOrder: true } });
    const created = await prisma.person.create({
      data: { householdId: household.id, name, notes: cleanOptional("notes", input.notes, 200), sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    return (await listMasters("people")).find((row) => row.id === created.id)!;
  }
  if (table === "issuers") {
    const duplicate = await prisma.cardIssuer.findFirst({ where: { householdId: household.id, name: { equals: name, mode: "insensitive" } } });
    if (duplicate) return (await listMasters("issuers")).find((row) => row.id === duplicate.id)!;
    const max = await prisma.cardIssuer.aggregate({ where: { householdId: household.id }, _max: { sortOrder: true } });
    const created = await prisma.cardIssuer.create({
      data: { householdId: household.id, name, sortOrder: (max._max.sortOrder ?? -1) + 1 },
    });
    return (await listMasters("issuers")).find((row) => row.id === created.id)!;
  }
  const key = await uniqueSlug(name, "type", async (slug) =>
    Boolean(await prisma.lookupLabel.findUnique({ where: { householdId_table_key: { householdId: household.id, table: "property_type", key: slug } } })),
  );
  const max = await prisma.lookupLabel.aggregate({ where: { householdId: household.id, table: "property_type" }, _max: { sortOrder: true } });
  const created = await prisma.lookupLabel.create({
    data: { householdId: household.id, table: "property_type", key, label: name, isSystem: false, sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  return (await listMasters("property-types")).find((row) => row.id === created.id)!;
}

export async function updateMaster(table: MasterTableId, id: string, input: MasterWrite): Promise<MasterRow> {
  if (table === "system") throw new ServiceError("System lists stay as they are.", 400, "system");
  const household = await getHousehold();
  if (input.sortOrder != null && Number.isFinite(input.sortOrder)) {
    await setSort(table, id, Math.max(0, Math.trunc(input.sortOrder)));
  }
  if (input.isActive != null) await setActive(table, id, input.isActive);
  if (table === "homes" && (input.name || input.address !== undefined || input.notes !== undefined || input.status || input.key)) {
    const existing = await prisma.property.findFirst({ where: { id, householdId: household.id } });
    if (!existing) throw new ServiceError("That value was not found.", 404, "not_found");
    const kind = input.key && ["primary", "rental", "vacation", "other"].includes(input.key) ? input.key : input.key ? "other" : undefined;
    const { updateProperty } = await import("@/server/services/properties");
    await updateProperty(id, {
      name: input.name ?? undefined,
      address: input.address,
      notes: input.notes,
      status: input.status ?? undefined,
      kind,
    });
    if (input.key) await prisma.property.update({ where: { id }, data: { typeKey: input.key, kind: kind as "other" } });
  } else if (table === "utility-types" || table === "categories") {
    const data: Prisma.CategoryUpdateInput = {};
    if (input.name) data.name = cleanRequired("name", input.name, "name", 80);
    if (input.color !== undefined) data.color = input.color || "#534C66";
    if (table === "categories" && input.parentId !== undefined) {
      data.parent = input.parentId ? { connect: { id: input.parentId } } : { disconnect: true };
    }
    if (Object.keys(data).length > 0) await prisma.category.update({ where: { id }, data });
  } else if (table === "payees" && (input.name || input.notes !== undefined || input.last4 !== undefined)) {
    await prisma.payee.update({
      where: { id },
      data: {
        ...(input.name ? { name: cleanRequired("name", input.name, "name", 80) } : {}),
        ...(input.notes !== undefined ? { notes: cleanOptional("notes", input.notes, 300) } : {}),
        ...(input.last4 !== undefined ? { accountLast4: cleanLast4(input.last4) } : {}),
      },
    });
  } else if (table === "payment-methods" && (input.name || input.last4 !== undefined)) {
    await prisma.paymentMethod.update({
      where: { id },
      data: {
        ...(input.name ? { nickname: cleanRequired("name", input.name, "name", 80) } : {}),
        ...(input.last4 !== undefined ? { last4: cleanLast4(input.last4) } : {}),
      },
    });
  } else if (table === "people" && (input.name || input.notes !== undefined)) {
    await prisma.person.update({
      where: { id },
      data: {
        ...(input.name ? { name: cleanRequired("name", input.name, "name", 60) } : {}),
        ...(input.notes !== undefined ? { notes: cleanOptional("notes", input.notes, 200) } : {}),
      },
    });
  } else if (table === "issuers" && input.name) {
    const name = cleanRequired("name", input.name, "name", 80);
    const existing = await prisma.cardIssuer.findFirst({ where: { id, householdId: household.id } });
    if (!existing) throw new ServiceError("That value was not found.", 404, "not_found");
    await prisma.creditCard.updateMany({
      where: { householdId: household.id, issuer: { equals: existing.name, mode: "insensitive" } },
      data: { issuer: name },
    });
    await prisma.cardIssuer.update({ where: { id }, data: { name } });
  } else if ((table === "payment-modes" || table === "property-types") && input.name) {
    await prisma.lookupLabel.update({ where: { id }, data: { label: cleanRequired("name", input.name, "label", 80) } });
  }
  const row = (await listMasters(table)).find((item) => item.id === id);
  if (!row) throw new ServiceError("That value was not found.", 404, "not_found");
  return row;
}

async function setSort(table: MasterTableId, id: string, sortOrder: number) {
  if (table === "homes") await prisma.property.update({ where: { id }, data: { sortOrder } });
  else if (table === "utility-types" || table === "categories") await prisma.category.update({ where: { id }, data: { sortOrder } });
  else if (table === "payees") await prisma.payee.update({ where: { id }, data: { sortOrder } });
  else if (table === "payment-methods") await prisma.paymentMethod.update({ where: { id }, data: { sortOrder } });
  else if (table === "people") await prisma.person.update({ where: { id }, data: { sortOrder } });
  else if (table === "issuers") await prisma.cardIssuer.update({ where: { id }, data: { sortOrder } });
  else if (table === "payment-modes" || table === "property-types") await prisma.lookupLabel.update({ where: { id }, data: { sortOrder } });
}

export async function setActive(table: MasterTableId, id: string, isActive: boolean) {
  if (table === "system") throw new ServiceError("System lists stay as they are.", 400, "system");
  const stamp = inactiveStamp(isActive, new Date());
  if (table === "homes") {
    await prisma.property.update({ where: { id }, data: { isActive, archivedAt: stamp } });
  } else if (table === "utility-types" || table === "categories") {
    await prisma.category.update({ where: { id }, data: { isActive, archivedAt: stamp } });
  } else if (table === "payees") {
    await prisma.payee.update({ where: { id }, data: { isActive, archivedAt: stamp } });
  } else if (table === "payment-methods") {
    await prisma.paymentMethod.update({ where: { id }, data: { isActive, archivedAt: stamp } });
  } else if (table === "people") {
    await prisma.person.update({ where: { id }, data: { isActive, archivedAt: stamp } });
  } else if (table === "issuers") {
    await prisma.cardIssuer.update({ where: { id }, data: { isActive } });
  } else {
    await prisma.lookupLabel.update({ where: { id }, data: { isActive } });
  }
  return { id, isActive };
}

export async function deleteMaster(table: MasterTableId, id: string): Promise<void> {
  if (table === "system") throw new ServiceError("System lists stay as they are.", 400, "system");
  const row = (await listMasters(table)).find((item) => item.id === id);
  if (!row) throw new ServiceError("That value was not found.", 404, "not_found");
  if (row.system) throw new ServiceError("This value drives app behavior. Make it inactive instead of deleting it.", 409, "system");
  if (row.usage > 0) inUse(row.name, row.usage);
  if (table === "homes") await prisma.property.delete({ where: { id } });
  else if (table === "utility-types" || table === "categories") await prisma.category.delete({ where: { id } });
  else if (table === "payees") await prisma.payee.delete({ where: { id } });
  else if (table === "payment-methods") await prisma.paymentMethod.delete({ where: { id } });
  else if (table === "people") await prisma.person.delete({ where: { id } });
  else if (table === "issuers") await prisma.cardIssuer.delete({ where: { id } });
  else await prisma.lookupLabel.delete({ where: { id } });
}

export async function mergeMaster(table: MasterTableId, id: string, intoId: string): Promise<{ moved: number; deleted: boolean }> {
  if (id === intoId) throw new ServiceError("Choose a different value.", 400, "invalid");
  if (table === "system") throw new ServiceError("System lists stay as they are.", 400, "system");
  const household = await getHousehold();
  const rows = await listMasters(table);
  const source = rows.find((row) => row.id === id);
  const target = rows.find((row) => row.id === intoId);
  if (!source || !target) throw new ServiceError("Choose a value to merge into.", 400, "invalid");
  if (!target.isActive) throw new ServiceError("Merge into an active value.", 400, "invalid");
  let moved = 0;
  if (table === "homes") {
    moved =
      (await prisma.bill.updateMany({ where: { propertyId: id }, data: { propertyId: intoId } })).count +
      (await prisma.expense.updateMany({ where: { propertyId: id }, data: { propertyId: intoId } })).count +
      (await prisma.creditCard.updateMany({ where: { propertyId: id }, data: { propertyId: intoId } })).count +
      (await prisma.occurrence.updateMany({ where: { propertyId: id }, data: { propertyId: intoId } })).count +
      (await prisma.payment.updateMany({ where: { propertyId: id }, data: { propertyId: intoId } })).count;
  } else if (table === "utility-types" || table === "categories") {
    moved =
      (await prisma.bill.updateMany({ where: { categoryId: id }, data: { categoryId: intoId } })).count +
      (await prisma.expense.updateMany({ where: { categoryId: id }, data: { categoryId: intoId } })).count +
      (await prisma.payee.updateMany({ where: { categoryId: id }, data: { categoryId: intoId } })).count;
    await prisma.category.updateMany({ where: { parentId: id }, data: { parentId: intoId } });
  } else if (table === "payees") {
    moved =
      (await prisma.bill.updateMany({ where: { payeeId: id }, data: { payeeId: intoId } })).count +
      (await prisma.payment.updateMany({ where: { payeeId: id }, data: { payeeId: intoId } })).count;
  } else if (table === "payment-methods") {
    moved =
      (await prisma.bill.updateMany({ where: { paymentMethodId: id }, data: { paymentMethodId: intoId } })).count +
      (await prisma.expense.updateMany({ where: { paymentMethodId: id }, data: { paymentMethodId: intoId } })).count +
      (await prisma.payment.updateMany({ where: { paymentMethodId: id }, data: { paymentMethodId: intoId } })).count;
  } else if (table === "people") {
    moved =
      (await prisma.bill.updateMany({ where: { personId: id }, data: { personId: intoId } })).count +
      (await prisma.creditCard.updateMany({ where: { cardholderId: id }, data: { cardholderId: intoId } })).count;
  } else if (table === "issuers") {
    const result = await prisma.creditCard.updateMany({
      where: { householdId: household.id, issuer: { equals: source.name, mode: "insensitive" } },
      data: { issuer: target.name },
    });
    moved = result.count;
  } else if (table === "payment-modes") {
    const result = await prisma.bill.updateMany({ where: { householdId: household.id, paymentMode: source.key as "manual" }, data: { paymentMode: target.key as "manual" } });
    moved = result.count;
  } else {
    const homes = await prisma.property.findMany({ where: { householdId: household.id } });
    const ids = homes.filter((home) => (home.typeKey || home.kind) === source.key).map((home) => home.id);
    if (ids.length > 0) {
      const kind = ["primary", "rental", "vacation", "other"].includes(target.key) ? target.key : "other";
      moved = (await prisma.property.updateMany({ where: { id: { in: ids } }, data: { typeKey: target.key, kind: kind as "other" } })).count;
    }
  }
  if (source.system) return { moved, deleted: false };
  await deleteMaster(table, id);
  return { moved, deleted: true };
}
