import { createCategory } from "@/server/services/categories";
import { createBill, updateBill } from "@/server/services/bills";
import { ensureMonth, resyncBillMonths } from "@/server/services/months";
import { formatIsoDate, lastDayIso, todayInChicago } from "@/lib/dates";
import type { BillDTO } from "@/lib/bill-types";
import { prisma } from "@/server/db";
import { fieldError, ServiceError } from "@/server/errors";
import { getHousehold } from "@/server/services/household";
import { listMasters } from "@/server/services/masters";
import { ensureUtilityGroup } from "@/server/services/utility-group";

export { ensureUtilityGroup };

export type UtilityWrite = {
  categoryId?: string | null;
  categoryName?: string | null;
  propertyId: string;
  payeeName?: string | null;
  dueDay?: number | string | null;
  dueDate?: string | null;
  yearMonth?: string | null;
  amountKind?: string | null;
  amount?: string | number | null;
  paymentMode?: string | null;
  autopay?: boolean;
  notes?: string | null;
};

function utilityName(typeName: string, provider: string): string {
  const name = provider ? `${typeName} · ${provider}` : typeName;
  return name.slice(0, 80);
}

function monthAnchor(yearMonth: string, dueDay: number): string {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5));
  const last = Number(lastDayIso(year, month).slice(8));
  const day = Math.min(dueDay, last);
  return `${yearMonth}-${String(day).padStart(2, "0")}`;
}

function readDue(input: UtilityWrite): { oneTime: boolean; anchorDate: string; dueDay: number | null } {
  const date = input.dueDate?.trim() ?? "";
  if (date) {
    return { oneTime: true, anchorDate: date, dueDay: null };
  }
  const raw = input.dueDay;
  const day = raw == null || raw === "" ? Number.NaN : Math.trunc(Number(raw));
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw fieldError("dueDay", "Enter a due day from 1 to 31, or a due date for a one-time utility.");
  }
  const yearMonth = input.yearMonth && /^\d{4}-\d{2}$/.test(input.yearMonth) ? input.yearMonth : todayInChicago().slice(0, 7);
  return { oneTime: false, anchorDate: monthAnchor(yearMonth, day), dueDay: day };
}

function paymentChoice(input: UtilityWrite): { paymentMode: "auto" | "manual" | "check"; autopay: boolean } {
  if (input.paymentMode === "auto" || input.autopay) return { paymentMode: "auto", autopay: true };
  if (input.paymentMode === "check") return { paymentMode: "check", autopay: false };
  return { paymentMode: "manual", autopay: false };
}

export async function utilityCatalog() {
  const group = await ensureUtilityGroup();
  const rows = await listMasters("utility-types", { activeOnly: true });
  return { groupId: group.id, types: rows.map((row) => ({ id: row.id, name: row.name })) };
}

async function resolveType(groupId: string, input: UtilityWrite) {
  const household = await getHousehold();
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, householdId: household.id } });
    if (!category || category.archivedAt || category.parentId !== groupId) throw fieldError("categoryId", "Choose a utility type.");
    return category;
  }
  const name = input.categoryName?.trim() ?? "";
  if (!name) throw fieldError("categoryName", "Choose a utility type.");
  const existing = await prisma.category.findFirst({
    where: { householdId: household.id, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    if (existing.parentId !== groupId) throw fieldError("categoryName", "That name is already used outside utilities.");
    return existing;
  }
  const created = await createCategory({ name, parentId: groupId, color: "#534C66" });
  return prisma.category.findFirstOrThrow({ where: { id: created.id, householdId: household.id } });
}

function billBody(typeName: string, input: UtilityWrite, due: { oneTime: boolean; anchorDate: string; dueDay: number | null }) {
  const provider = input.payeeName?.trim() ?? "";
  const pay = paymentChoice(input);
  const amountKind = input.amountKind === "fixed" ? "fixed" : "variable";
  return {
    name: utilityName(typeName, provider),
    payeeName: provider,
    payeeOptional: true,
    propertyId: input.propertyId,
    amount: input.amount ?? "",
    amountOptional: true,
    amountKind,
    anchorDate: due.anchorDate,
    frequency: due.oneTime ? "once" : "monthly",
    dayOfMonth: due.dueDay,
    endCount: due.oneTime ? 1 : null,
    endDate: null,
    paymentMode: pay.paymentMode,
    autopay: pay.autopay,
    notes: input.notes ?? "",
    dueRuleKind: due.oneTime ? "schedule" : "day_of_month",
  };
}

export async function createUtility(input: UtilityWrite): Promise<BillDTO> {
  const group = await ensureUtilityGroup();
  const category = await resolveType(group.id, input);
  const due = readDue(input);
  const bill = await createBill({ ...billBody(category.name, input, due), categoryId: category.id });
  const yearMonth = due.anchorDate.slice(0, 7);
  await ensureMonth(yearMonth);
  if (input.yearMonth && input.yearMonth !== yearMonth) await ensureMonth(input.yearMonth);
  return bill;
}

export async function updateUtility(id: string, input: UtilityWrite): Promise<BillDTO> {
  const group = await ensureUtilityGroup();
  const household = await getHousehold();
  const existing = await prisma.bill.findFirst({ where: { id, householdId: household.id }, include: { category: true } });
  if (!existing) throw new ServiceError("Utility not found.", 404, "not_found");
  if (existing.category.parentId !== group.id && existing.categoryId !== group.id) {
    throw new ServiceError("That bill is not a utility. Edit it from Show other bills.", 400, "invalid");
  }
  const category = await resolveType(group.id, input);
  const due = readDue(input);
  const sameSchedule =
    !due.oneTime &&
    existing.frequency !== "once" &&
    existing.dayOfMonth === due.dueDay;
  const anchorDate = sameSchedule ? formatIsoDate(existing.anchorDate) : due.anchorDate;
  const bill = await updateBill(id, {
    ...billBody(category.name, input, { ...due, anchorDate }),
    categoryId: category.id,
  });
  await resyncBillMonths(id);
  await ensureMonth(anchorDate.slice(0, 7));
  return bill;
}
