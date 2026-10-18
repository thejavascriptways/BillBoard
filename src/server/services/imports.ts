import { FREQUENCIES, type Frequency } from "@/core/recurrence";
import { PluginHost } from "@/core/plugins";
import { BILL_COLUMNS, guessMapping, mapBillRows, parseCsv, type BillColumn } from "@/core/csv-bills";
import { type BillDTO } from "@/lib/bill-types";
import { toCsv } from "@/lib/csv";
import { isIsoDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { createBill } from "@/server/services/bills";
import { listCards } from "@/server/services/cards";
import { getHousehold } from "@/server/services/household";
import { installedPlugins } from "@/plugins/installed";

function frequencyOf(value: string): Frequency {
  const text = value.trim().toLowerCase();
  if ((FREQUENCIES as readonly string[]).includes(text)) return text as Frequency;
  if (text.includes("biweek")) return "biweekly";
  if (text.includes("week")) return "weekly";
  if (text.includes("quarter")) return "quarterly";
  if (text.includes("semi")) return "semiannual";
  if (text.includes("year") || text.includes("annual")) return "annual";
  if (text.includes("once") || text.includes("one-off") || text.includes("one off")) return "once";
  if (text.includes("every")) return "every_n";
  return "monthly";
}

async function enabledHost() {
  const household = await getHousehold();
  const states = await prisma.pluginState.findMany({ where: { householdId: household.id } });
  const disabled = new Set(states.filter((state) => !state.enabled).map((state) => state.pluginId));
  const host = new PluginHost();
  for (const plugin of installedPlugins) {
    if (disabled.has(plugin.manifest.id)) continue;
    host.activate(plugin);
  }
  return { household, host, states };
}

export async function listPlugins() {
  const { states } = await enabledHost();
  return installedPlugins.map((plugin) => {
    const state = states.find((item) => item.pluginId === plugin.manifest.id);
    return {
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      version: plugin.manifest.version,
      permissions: plugin.manifest.permissions,
      enabled: state ? state.enabled : true,
    };
  });
}

export async function setPluginEnabled(pluginId: string, enabled: boolean) {
  const household = await getHousehold();
  if (!installedPlugins.some((plugin) => plugin.manifest.id === pluginId)) {
    throw new ServiceError("Plugin not found.", 404, "not_found");
  }
  await prisma.pluginState.upsert({
    where: { householdId_pluginId: { householdId: household.id, pluginId } },
    create: { householdId: household.id, pluginId, enabled },
    update: { enabled },
  });
  return listPlugins();
}

async function placeRow(row: {
  name: string;
  payee: string;
  amount: string;
  dueDate: string;
  property?: string | null;
  propertyName?: string | null;
  category?: string | null;
  categoryName?: string | null;
  frequency?: string | null;
  notes?: string | null;
}) {
  const household = await getHousehold();
  const properties = await prisma.property.findMany({ where: { householdId: household.id, archivedAt: null } });
  const categories = await prisma.category.findMany({ where: { householdId: household.id, archivedAt: null } });
  const propertyName = (row.propertyName ?? row.property ?? "").trim().toLowerCase();
  const categoryName = (row.categoryName ?? row.category ?? "").trim().toLowerCase();
  const property =
    properties.find((item) => item.name.toLowerCase() === propertyName) ??
    properties.find((item) => item.slug === "personal") ??
    properties[0];
  const category =
    categories.find((item) => item.name.toLowerCase() === categoryName) ??
    categories.find((item) => item.slug === "other") ??
    categories[0];
  if (!property || !category) throw new ServiceError("Add a property and a category before importing.", 400, "invalid");
  if (!isIsoDate(row.dueDate)) throw new ServiceError(`${row.name} needs a due date as YYYY-MM-DD.`, 400, "invalid");
  return createBill({
    name: row.name,
    payeeName: row.payee,
    propertyId: property.id,
    categoryId: category.id,
    amount: row.amount,
    anchorDate: row.dueDate,
    frequency: frequencyOf(row.frequency ?? ""),
    notes: row.notes,
    amountKind: "fixed",
  });
}

export async function importWithPlugin(pluginId: string, text: string) {
  const { host } = await enabledHost();
  let rows;
  try {
    rows = host.parse(pluginId, text);
  } catch (error) {
    throw new ServiceError(error instanceof Error ? error.message : "Could not read that file.", 400, "invalid");
  }
  const created: BillDTO[] = [];
  for (const row of rows) created.push(await placeRow(row));
  return created;
}

export function previewBillCsv(text: string, mapping?: Partial<Record<BillColumn, number | null>>) {
  const table = parseCsv(text);
  const headers = table[0] ?? [];
  const guessed = guessMapping(headers);
  const chosen = { ...guessed, ...mapping };
  return {
    headers,
    columns: BILL_COLUMNS,
    mapping: chosen,
    rows: mapBillRows(table, chosen).slice(0, 8),
  };
}

export async function importBillCsv(text: string, mapping: Record<BillColumn, number | null>) {
  const table = parseCsv(text);
  const rows = mapBillRows(table, mapping).filter((row) => row.name || row.payee || row.amount);
  const created: BillDTO[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    try {
      created.push(await placeRow({ ...row, property: row.property, category: row.category }));
    } catch (error) {
      errors.push(error instanceof ServiceError ? `${row.name || "Row"}: ${error.message}` : `${row.name || "Row"} failed.`);
    }
  }
  return { created: created.length, errors };
}

export async function exportBillsCsv(propertyId?: string | null): Promise<string> {
  const household = await getHousehold();
  const bills = await prisma.bill.findMany({
    where: { householdId: household.id, archivedAt: null, ...(propertyId ? { propertyId } : {}) },
    include: { payee: true, property: true, category: true },
    orderBy: { name: "asc" },
  });
  return toCsv(
    ["Name", "Payee", "Amount", "Due date", "Property", "Category", "Frequency", "Notes"],
    bills.map((bill) => [
      bill.name,
      bill.payee?.name ?? "",
      bill.amount ? bill.amount.toFixed(2) : "",
      bill.anchorDate.toISOString().slice(0, 10),
      bill.property.name,
      bill.category.name,
      bill.frequency,
      bill.notes ?? "",
    ]),
  );
}

export async function exportPaymentsCsv(propertyId?: string | null): Promise<string> {
  const household = await getHousehold();
  const payments = await prisma.payment.findMany({
    where: { householdId: household.id, ...(propertyId ? { propertyId } : {}) },
    include: { bill: true, payee: true, property: true },
    orderBy: { paidOn: "desc" },
  });
  return toCsv(
    ["Paid on", "Bill", "Payee", "Property", "Amount", "Confirmation", "Note", "Undone"],
    payments.map((payment) => [
      payment.paidOn.toISOString().slice(0, 10),
      payment.bill.name,
      payment.payee.name,
      payment.property.name,
      payment.amount.toFixed(2),
      payment.confirmationNumber ?? "",
      payment.note ?? "",
      payment.undoneAt ? "yes" : "",
    ]),
  );
}

export async function exportCardsCsv(): Promise<string> {
  const cards = await listCards();
  return toCsv(
    ["Name", "Issuer", "Last 4", "Property", "Statement day", "Due day", "Next statement", "Next due", "Autopay"],
    cards.map((card) => [
      card.displayName,
      card.issuer,
      card.last4,
      card.propertyName,
      card.statementDay == null ? "" : String(card.statementDay),
      card.dueDay == null ? "" : String(card.dueDay),
      card.nextStatement ?? "",
      card.nextDue ?? "",
      card.autopay ? "yes" : "",
    ]),
  );
}
