import type { Model, Rel } from "@/server/sheet/catalog";
import { MODELS } from "@/server/sheet/catalog";
import type { Row } from "@/server/sheet/memory-db";

export const FOLDER_NAME = "BillBoard";
export const SPREADSHEET_NAME = "BillBoard";
export const BACKUPS_FOLDER_NAME = "Backups";
export const SCHEMA_VERSION = "1";

export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

export type Column = {
  field: string;
  header: string;
  kind?: string;
  enumValues?: readonly string[];
  computed?: boolean;
  fk?: string;
  target?: string;
};

export type TabDef = {
  title: string;
  model: string | null;
};

export const TAB_ORDER = [
  "Settings",
  "Properties",
  "PropertyTypes",
  "Categories",
  "UtilityTypes",
  "Payees",
  "PaymentMethods",
  "PaymentModeLabels",
  "People",
  "CardIssuers",
  "Bills",
  "Occurrences",
  "Payments",
  "CreditCards",
  "BillMonths",
  "CardMonths",
  "Reminders",
  "SentReminders",
  "AuditLog",
  "Expenses",
  "LedgerMonths",
  "PluginStates",
  "Vehicles",
  "Occupancy",
  "PayerSplits",
  "PayerSplitShares",
  "_meta",
];

const TITLE_BY_MODEL: Record<string, string> = {
  property: "Properties",
  category: "Categories",
  payee: "Payees",
  paymentMethod: "PaymentMethods",
  person: "People",
  cardIssuer: "CardIssuers",
  bill: "Bills",
  occurrence: "Occurrences",
  payment: "Payments",
  creditCard: "CreditCards",
  reminderSetting: "Reminders",
  reminderDelivery: "SentReminders",
  auditLog: "AuditLog",
  expense: "Expenses",
  ledgerMonth: "LedgerMonths",
  pluginState: "PluginStates",
  vehicle: "Vehicles",
  occupancyPeriod: "Occupancy",
  payerSplit: "PayerSplits",
  payerSplitShare: "PayerSplitShares",
};

export function headerLabel(field: string): string {
  if (field === "id") return "Id";
  if (field === "deleted") return "Deleted";
  if (field === "version") return "Version";
  const spaced = field.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
  return spaced.replace(/\bId\b/g, "id").replace(" id", " id");
}

function nameHeader(fk: string): string {
  const base = fk.replace(/Id$/, "");
  return headerLabel(`${base}Name`);
}

export function columnsForModel(model: Model): Column[] {
  const columns: Column[] = [];
  for (const [field, spec] of Object.entries(model.fields)) {
    columns.push({
      field,
      header: headerLabel(field),
      kind: spec.kind,
      enumValues: spec.enumValues,
    });
    const relation = Object.values(model.relations).find((item) => item.fk === field && field.endsWith("Id") && field !== "householdId");
    if (relation) {
      columns.push({
        field: `__name_${field}`,
        header: nameHeader(field),
        computed: true,
        fk: field,
        target: relation.model,
      });
    }
  }
  columns.push({ field: "deleted", header: "Deleted", kind: "bool" });
  columns.push({ field: "version", header: "Version", kind: "int" });
  return columns;
}

const MODEL_COLUMNS = new Map(MODELS.map((model) => [model.delegate, columnsForModel(model)]));

export function columnsForTab(title: string): Column[] {
  if (title === "_meta") {
    return [
      { field: "key", header: "Key" },
      { field: "value", header: "Value" },
    ];
  }
  if (title === "Settings") {
    const household = MODEL_COLUMNS.get("household") ?? [];
    const prefs = MODEL_COLUMNS.get("householdPrefs") ?? [];
    const seen = new Set<string>();
    const columns: Column[] = [{ field: "recordType", header: "Record type" }];
    for (const column of [...household, ...prefs]) {
      if (column.field === "deleted" || column.field === "version") continue;
      if (seen.has(column.field)) continue;
      seen.add(column.field);
      columns.push(column);
    }
    columns.push({ field: "deleted", header: "Deleted", kind: "bool" });
    columns.push({ field: "version", header: "Version", kind: "int" });
    return columns;
  }
  const model = modelForTab(title);
  return MODEL_COLUMNS.get(model) ?? [];
}

export function modelForTab(title: string): string {
  if (title === "PropertyTypes" || title === "PaymentModeLabels") return "lookupLabel";
  if (title === "UtilityTypes") return "category";
  if (title === "BillMonths" || title === "CardMonths") return "monthEntry";
  if (title === "Settings") return "household";
  const found = Object.entries(TITLE_BY_MODEL).find(([, tab]) => tab === title);
  return found?.[0] ?? "household";
}

export function tabForRow(delegate: string, row: Row, lookup: (delegate: string, id: unknown) => Row | null): string {
  if (delegate === "lookupLabel") return row.table === "payment_mode" ? "PaymentModeLabels" : "PropertyTypes";
  if (delegate === "category") {
    const parent = row.parentId ? lookup("category", row.parentId) : null;
    return parent?.slug === "utilities" ? "UtilityTypes" : "Categories";
  }
  if (delegate === "monthEntry") {
    const cards = lookup("__cards_for_bill", row.billId);
    return cards ? "CardMonths" : "BillMonths";
  }
  if (delegate === "household" || delegate === "householdPrefs") return "Settings";
  return TITLE_BY_MODEL[delegate] ?? "Settings";
}

export function relationTarget(model: Model, fk: string): Rel | undefined {
  return Object.values(model.relations).find((item) => item.fk === fk);
}
