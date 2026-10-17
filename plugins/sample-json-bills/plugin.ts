import type { BillboardPlugin, ImportRow } from "@/core/plugins";

function asRows(value: unknown): ImportRow[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { bills?: unknown }).bills)
      ? (value as { bills: unknown[] }).bills
      : null;
  if (!source) throw new Error("JSON bills need a bills array.");
  return source.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error(`Bill ${index + 1} is not an object.`);
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const payee = String(row.payee ?? "").trim();
    const amount = String(row.amount ?? "").trim();
    const dueDate = String(row.dueDate ?? row.due ?? "").trim();
    if (!name || !payee || !amount || !dueDate) {
      throw new Error(`Bill ${index + 1} needs name, payee, amount, and dueDate.`);
    }
    return {
      name,
      payee,
      amount,
      dueDate,
      propertyName: row.property == null ? null : String(row.property),
      categoryName: row.category == null ? null : String(row.category),
      frequency: row.frequency == null ? null : String(row.frequency),
      notes: row.notes == null ? null : String(row.notes),
    };
  });
}

/** Sample importer. Core bill creation never parses this format itself. */
export const sampleJsonBills: BillboardPlugin = {
  manifest: {
    id: "sample-json-bills",
    name: "JSON bills",
    version: "1.0.0",
    apiVersion: "1",
    permissions: ["import"],
  },
  activate(api) {
    api.registerImporter({
      id: "sample-json-bills",
      label: "JSON bills",
      parse: (text) => asRows(JSON.parse(text) as unknown),
    });
  },
};
