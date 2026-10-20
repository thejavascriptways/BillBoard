import { MODELS, modelOf } from "@/server/sheet/catalog";
import type { MemoryDb, Row } from "@/server/sheet/memory-db";

export type SourceDump = Record<string, Row[]>;

export type MigrateCounts = Record<string, { created: number; updated: number }>;

const ORDER = [
  "household",
  "householdPrefs",
  "property",
  "category",
  "paymentMethod",
  "person",
  "payee",
  "cardIssuer",
  "lookupLabel",
  "vehicle",
  "occupancyPeriod",
  "payerSplit",
  "payerSplitShare",
  "reminderSetting",
  "bill",
  "creditCard",
  "occurrence",
  "payment",
  "monthEntry",
  "ledgerMonth",
  "expense",
  "auditLog",
  "pluginState",
  "reminderDelivery",
];

const NATURAL: Record<string, string[]> = {
  property: ["slug"],
  category: ["slug"],
  paymentMethod: ["slug"],
  person: ["name"],
  vehicle: ["name"],
  payee: ["name"],
  cardIssuer: ["name"],
  lookupLabel: ["table", "key"],
};

function text(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function sameNatural(delegate: string, left: Row, right: Row): boolean {
  const fields = NATURAL[delegate];
  if (!fields) return false;
  return fields.every((field) => text(left[field]) === text(right[field]) && text(left[field]) !== "");
}

function rewrite(row: Row, idMap: Map<string, string>): Row {
  const next: Row = { ...row };
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === "string" && idMap.has(value)) next[key] = idMap.get(value);
  }
  return next;
}

export async function copyFromSource(source: SourceDump, db: MemoryDb): Promise<MigrateCounts> {
  const counts: MigrateCounts = {};
  const idMap = new Map<string, string>();
  const targetHousehold = db.rows("household")[0];
  const sourceHousehold = source.household?.[0];
  if (sourceHousehold && targetHousehold && String(sourceHousehold.id) !== String(targetHousehold.id)) {
    idMap.set(String(sourceHousehold.id), String(targetHousehold.id));
  }

  for (const delegate of ORDER) {
    const model = modelOf(delegate);
    counts[delegate] = { created: 0, updated: 0 };
    for (const original of source[delegate] ?? []) {
      const mapped = rewrite(original, idMap);
      const pk = String(mapped[model.pk] ?? "");
      const existingById = db.rows(delegate).find((row) => String(row[model.pk]) === pk);
      const existingByNatural = NATURAL[delegate]
        ? db.rows(delegate).find((row) => sameNatural(delegate, row, mapped) && String(row.householdId ?? "") === String(mapped.householdId ?? row.householdId ?? ""))
        : undefined;
      const existing = existingById ?? existingByNatural;
      if (existing && String(existing[model.pk]) !== pk) idMap.set(pk, String(existing[model.pk]));
      const data: Row = { ...mapped };
      if (existing) {
        delete data[model.pk];
        await (db as unknown as Record<string, { update: (args: { where: Row; data: Row }) => Promise<Row> }>)[delegate].update({
          where: { [model.pk]: existing[model.pk] },
          data,
        });
        counts[delegate].updated += 1;
      } else {
        await (db as unknown as Record<string, { create: (args: { data: Row }) => Promise<Row> }>)[delegate].create({ data });
        counts[delegate].created += 1;
      }
    }
  }
  for (const model of MODELS) {
    counts[model.delegate] ??= { created: 0, updated: 0 };
  }
  return counts;
}
