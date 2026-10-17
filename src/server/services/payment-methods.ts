import type { PaymentMethod } from "@prisma/client";

import { paymentMethodLabel } from "@/lib/labels";
import type { PaymentMethodDTO } from "@/lib/types";
import { prisma } from "@/server/db";
import { inUseError, ServiceError } from "@/server/errors";
import { applyOrder } from "@/server/order";
import { getHousehold } from "@/server/services/household";
import { cleanLast4, cleanRequired, uniqueSlug } from "@/server/text";

function toDTO(method: PaymentMethod, expenseCount: number): PaymentMethodDTO {
  return {
    id: method.id,
    nickname: method.nickname,
    last4: method.last4,
    label: paymentMethodLabel(method),
    sortOrder: method.sortOrder,
    archived: method.archivedAt != null,
    expenseCount,
  };
}

async function counts(householdId: string): Promise<Map<string, number>> {
  const grouped = await prisma.expense.groupBy({
    by: ["paymentMethodId"],
    where: { householdId },
    _count: { _all: true },
  });
  return new Map(grouped.map((row) => [row.paymentMethodId, row._count._all]));
}

export async function listPaymentMethods(): Promise<PaymentMethodDTO[]> {
  const household = await getHousehold();
  const [rows, usage] = await Promise.all([
    prisma.paymentMethod.findMany({
      where: { householdId: household.id },
      orderBy: [{ sortOrder: "asc" }, { nickname: "asc" }],
    }),
    counts(household.id),
  ]);
  return rows.map((row) => toDTO(row, usage.get(row.id) ?? 0));
}

async function requireMethod(id: string) {
  const household = await getHousehold();
  const existing = await prisma.paymentMethod.findFirst({ where: { id, householdId: household.id } });
  if (!existing) throw new ServiceError("Payment method not found.", 404, "not_found");
  return { household, existing };
}

async function assertUnique(householdId: string, nickname: string, last4: string | null, exceptId?: string) {
  const duplicate = await prisma.paymentMethod.findFirst({
    where: {
      householdId,
      nickname: { equals: nickname, mode: "insensitive" },
      last4,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  if (duplicate) {
    throw new ServiceError("A payment method with that nickname and last 4 already exists.", 409, "conflict");
  }
}

export async function createPaymentMethod(input: {
  nickname: string;
  last4?: string | null;
}): Promise<PaymentMethodDTO> {
  const household = await getHousehold();
  const nickname = cleanRequired("nickname", input.nickname, "nickname", 40);
  const last4 = cleanLast4(input.last4);
  await assertUnique(household.id, nickname, last4);
  const max = await prisma.paymentMethod.aggregate({
    where: { householdId: household.id },
    _max: { sortOrder: true },
  });
  const created = await prisma.paymentMethod.create({
    data: {
      householdId: household.id,
      nickname,
      last4,
      slug: await uniqueSlug(`${nickname}${last4 ? `-${last4}` : ""}`, "method", async (slug) => {
        const found = await prisma.paymentMethod.findUnique({
          where: { householdId_slug: { householdId: household.id, slug } },
        });
        return Boolean(found);
      }),
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  return toDTO(created, 0);
}

export async function updatePaymentMethod(
  id: string,
  input: { nickname?: string; last4?: string | null; archived?: boolean },
): Promise<PaymentMethodDTO> {
  const { household, existing } = await requireMethod(id);
  const nickname =
    input.nickname === undefined ? existing.nickname : cleanRequired("nickname", input.nickname, "nickname", 40);
  const last4 = input.last4 === undefined ? existing.last4 : cleanLast4(input.last4);
  await assertUnique(household.id, nickname, last4, id);
  let archivedAt = existing.archivedAt;
  if (input.archived === true) archivedAt = existing.archivedAt ?? new Date();
  if (input.archived === false) archivedAt = null;
  const updated = await prisma.paymentMethod.update({
    where: { id },
    data: { nickname, last4, archivedAt },
  });
  const usage = await prisma.expense.count({ where: { paymentMethodId: id } });
  return toDTO(updated, usage);
}

export async function deletePaymentMethod(id: string): Promise<void> {
  const { existing } = await requireMethod(id);
  const count = await prisma.expense.count({ where: { paymentMethodId: id } });
  if (count > 0) throw inUseError(paymentMethodLabel(existing), count, "payment method");
  await prisma.paymentMethod.delete({ where: { id } });
}

export async function reassignPaymentMethod(id: string, toId: string): Promise<{ moved: number }> {
  const { household, existing } = await requireMethod(id);
  if (toId === id) throw new ServiceError("Choose a different payment method.", 400, "invalid");
  const target = await prisma.paymentMethod.findFirst({ where: { id: toId, householdId: household.id } });
  if (!target) throw new ServiceError("Choose a payment method.", 400, "invalid");
  if (target.archivedAt) throw new ServiceError("Choose a payment method that isn't archived.", 400, "invalid");
  return prisma.$transaction(async (tx) => {
    const moved = await tx.expense.updateMany({
      where: { paymentMethodId: id, householdId: household.id },
      data: { paymentMethodId: toId },
    });
    await tx.paymentMethod.delete({ where: { id: existing.id } });
    return { moved: moved.count };
  });
}

export async function reorderPaymentMethods(ids: string[]): Promise<PaymentMethodDTO[]> {
  const household = await getHousehold();
  const existing = await prisma.paymentMethod.findMany({
    where: { householdId: household.id },
    select: { id: true },
  });
  await applyOrder(ids, existing.map((row) => row.id), (id, sortOrder) =>
    prisma.paymentMethod.update({ where: { id }, data: { sortOrder } }),
  );
  return listPaymentMethods();
}
