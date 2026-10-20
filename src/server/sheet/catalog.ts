export type FieldKind = "string" | "int" | "bool" | "date" | "datetime" | "decimal" | "ints" | "enum";

export type Field = {
  kind: FieldKind;
  optional?: boolean;
  default?: unknown;
  enumValues?: readonly string[];
};

export type Rel = {
  model: string;
  kind: "one" | "many";
  /** FK stored on this row. */
  fk?: string;
  /** FK stored on the other model (to-many, or inverse to-one). */
  from?: string;
};

export type Unique = { name: string; fields: string[] };

export type Model = {
  delegate: string;
  pk: string;
  fields: Record<string, Field>;
  relations: Record<string, Rel>;
  uniques: Unique[];
  hasUpdatedAt?: boolean;
};

const str = (optional = false): Field => ({ kind: "string", optional });
const opt = (): Field => ({ kind: "string", optional: true });
const num = (fallback?: number, optional = false): Field => ({ kind: "int", optional, default: fallback });
const flag = (fallback = false): Field => ({ kind: "bool", default: fallback });
const day = (): Field => ({ kind: "date", optional: true });
const stamp = (): Field => ({ kind: "datetime", optional: true });
const money = (): Field => ({ kind: "decimal", optional: true });
const ints = (fallback: number[] = []): Field => ({ kind: "ints", default: fallback });
const en = (values: readonly string[], fallback?: string): Field => ({
  kind: "enum",
  enumValues: values,
  default: fallback,
  optional: fallback == null,
});

const PROPERTY_KIND = ["primary", "rental", "vacation", "other"] as const;
const PROPERTY_STATUS = ["active", "upcoming", "archived"] as const;
const AMOUNT_KIND = ["fixed", "variable", "estimated"] as const;
const FREQUENCY = ["weekly", "biweekly", "monthly", "quarterly", "semiannual", "annual", "every_n", "once"] as const;
const INTERVAL = ["days", "weeks", "months"] as const;
const SHIFT = ["none", "earlier", "later"] as const;
const PAYMENT_MODE = ["auto", "manual", "check", "paycheck", "covered"] as const;
const MONTH_STATUS = ["not_done", "done", "failed", "not_applicable", "included", "skipped", "pending"] as const;
const DUE_RULE = ["schedule", "day_of_month", "last_day", "last_business_day", "every_n_months", "quarterly", "semiannual", "annual", "fixed_range", "usage", "balance", "on_demand", "event", "statement"] as const;
const OCCUPANCY = ["primary_residence", "second_home", "rental", "vacant_for_rent", "under_construction", "personal"] as const;

function timestamps(updated = true): Record<string, Field> {
  return updated
    ? { createdAt: { kind: "datetime" }, updatedAt: { kind: "datetime" } }
    : { createdAt: { kind: "datetime" } };
}

export const MODELS: Model[] = [
  {
    delegate: "household",
    pk: "id",
    hasUpdatedAt: false,
    fields: {
      id: str(),
      name: str(),
      timezone: { kind: "string", default: "America/Chicago" },
      currency: { kind: "string", default: "USD" },
      ...timestamps(false),
    },
    relations: {},
    uniques: [],
  },
  {
    delegate: "property",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      slug: str(),
      name: str(),
      address: opt(),
      notes: opt(),
      kind: en(PROPERTY_KIND, "other"),
      status: en(PROPERTY_STATUS, "active"),
      purchaseDate: day(),
      roleStartsOn: day(),
      roleBecomes: en(PROPERTY_KIND),
      typeKey: opt(),
      sortOrder: num(0),
      isActive: flag(true),
      archivedAt: stamp(),
      ...timestamps(),
    },
    relations: {
      household: { model: "household", kind: "one", fk: "householdId" },
      expenses: { model: "expense", kind: "many", from: "propertyId" },
      bills: { model: "bill", kind: "many", from: "propertyId" },
    },
    uniques: [
      { name: "householdId_slug", fields: ["householdId", "slug"] },
      { name: "householdId_name", fields: ["householdId", "name"] },
    ],
  },
  {
    delegate: "category",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      slug: str(),
      name: str(),
      color: { kind: "string", default: "#534C66" },
      parentId: opt(),
      sortOrder: num(0),
      isActive: flag(true),
      archivedAt: stamp(),
      ...timestamps(),
    },
    relations: {
      parent: { model: "category", kind: "one", fk: "parentId" },
      children: { model: "category", kind: "many", from: "parentId" },
    },
    uniques: [
      { name: "householdId_slug", fields: ["householdId", "slug"] },
      { name: "householdId_name", fields: ["householdId", "name"] },
    ],
  },
  {
    delegate: "paymentMethod",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      slug: str(),
      nickname: str(),
      last4: opt(),
      sortOrder: num(0),
      isActive: flag(true),
      archivedAt: stamp(),
      ...timestamps(),
    },
    relations: {},
    uniques: [{ name: "householdId_slug", fields: ["householdId", "slug"] }],
  },
  {
    delegate: "expense",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      expenseDate: { kind: "date" },
      propertyId: str(),
      categoryId: str(),
      paymentMethodId: str(),
      payee: str(),
      amount: { kind: "decimal" },
      notes: opt(),
      isSample: flag(false),
      ...timestamps(),
    },
    relations: {
      property: { model: "property", kind: "one", fk: "propertyId" },
      category: { model: "category", kind: "one", fk: "categoryId" },
      paymentMethod: { model: "paymentMethod", kind: "one", fk: "paymentMethodId" },
    },
    uniques: [],
  },
  {
    delegate: "person",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      name: str(),
      notes: opt(),
      sortOrder: num(0),
      isActive: flag(true),
      archivedAt: stamp(),
      ...timestamps(),
    },
    relations: {},
    uniques: [{ name: "householdId_name", fields: ["householdId", "name"] }],
  },
  {
    delegate: "vehicle",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      name: str(),
      notes: opt(),
      sortOrder: num(0),
      archivedAt: stamp(),
      ...timestamps(),
    },
    relations: {},
    uniques: [{ name: "householdId_name", fields: ["householdId", "name"] }],
  },
  {
    delegate: "occupancyPeriod",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      propertyId: str(),
      use: en(OCCUPANCY),
      startDate: { kind: "date" },
      endDate: day(),
      notes: opt(),
      ...timestamps(),
    },
    relations: { property: { model: "property", kind: "one", fk: "propertyId" } },
    uniques: [],
  },
  {
    delegate: "payerSplit",
    pk: "id",
    hasUpdatedAt: true,
    fields: { id: str(), householdId: str(), name: opt(), notes: opt(), ...timestamps() },
    relations: { shares: { model: "payerSplitShare", kind: "many", from: "splitId" } },
    uniques: [],
  },
  {
    delegate: "payerSplitShare",
    pk: "id",
    fields: { id: str(), splitId: str(), personId: str(), shareBps: num(), notes: opt() },
    relations: {
      split: { model: "payerSplit", kind: "one", fk: "splitId" },
      person: { model: "person", kind: "one", fk: "personId" },
    },
    uniques: [{ name: "splitId_personId", fields: ["splitId", "personId"] }],
  },
  {
    delegate: "reminderSetting",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      label: str(),
      enabled: flag(true),
      leadDays: ints(),
      notes: opt(),
      ...timestamps(),
    },
    relations: {},
    uniques: [],
  },
  {
    delegate: "payee",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      name: str(),
      categoryId: opt(),
      accountLast4: opt(),
      website: opt(),
      phone: opt(),
      notes: opt(),
      sortOrder: num(0),
      isActive: flag(true),
      archivedAt: stamp(),
      ...timestamps(),
    },
    relations: { category: { model: "category", kind: "one", fk: "categoryId" } },
    uniques: [],
  },
  {
    delegate: "cardIssuer",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      name: str(),
      sortOrder: num(0),
      isActive: flag(true),
      ...timestamps(),
    },
    relations: {},
    uniques: [{ name: "householdId_name", fields: ["householdId", "name"] }],
  },
  {
    delegate: "lookupLabel",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      table: str(),
      key: str(),
      label: str(),
      sortOrder: num(0),
      isActive: flag(true),
      isSystem: flag(true),
      ...timestamps(),
    },
    relations: {},
    uniques: [{ name: "householdId_table_key", fields: ["householdId", "table", "key"] }],
  },
  {
    delegate: "bill",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      name: str(),
      payeeId: opt(),
      propertyId: str(),
      categoryId: str(),
      amountKind: en(AMOUNT_KIND, "fixed"),
      amount: money(),
      anchorDate: { kind: "date" },
      autopay: flag(false),
      paymentMethodId: opt(),
      notes: opt(),
      portalUrl: opt(),
      frequency: en(FREQUENCY, "monthly"),
      intervalN: num(1),
      intervalUnit: en(INTERVAL, "months"),
      dayOfMonth: num(undefined, true),
      endDate: day(),
      endCount: num(undefined, true),
      shiftWeekends: en(SHIFT, "none"),
      reminderDays: ints(),
      graceDays: num(0),
      generatedThrough: day(),
      paymentMode: en(PAYMENT_MODE, "manual"),
      coveredByBillId: opt(),
      dueOnNote: opt(),
      dueRuleKind: en(DUE_RULE, "schedule"),
      sessionEveryN: num(undefined, true),
      sessionCount: num(0),
      balanceThreshold: money(),
      accountBalance: money(),
      personId: opt(),
      muted: flag(false),
      archivedAt: stamp(),
      ...timestamps(),
    },
    relations: {
      payee: { model: "payee", kind: "one", fk: "payeeId" },
      property: { model: "property", kind: "one", fk: "propertyId" },
      category: { model: "category", kind: "one", fk: "categoryId" },
      paymentMethod: { model: "paymentMethod", kind: "one", fk: "paymentMethodId" },
      coveredBy: { model: "bill", kind: "one", fk: "coveredByBillId" },
      covers: { model: "bill", kind: "many", from: "coveredByBillId" },
      person: { model: "person", kind: "one", fk: "personId" },
      occurrences: { model: "occurrence", kind: "many", from: "billId" },
      payments: { model: "payment", kind: "many", from: "billId" },
      creditCard: { model: "creditCard", kind: "one", from: "billId" },
      monthEntries: { model: "monthEntry", kind: "many", from: "billId" },
    },
    uniques: [],
  },
  {
    delegate: "occurrence",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      billId: str(),
      propertyId: str(),
      cycleIndex: num(),
      dueDate: { kind: "date" },
      originalDueDate: day(),
      expectedAmount: { kind: "decimal" },
      skippedAt: stamp(),
      snoozedUntil: day(),
      ...timestamps(),
    },
    relations: {
      bill: { model: "bill", kind: "one", fk: "billId" },
      property: { model: "property", kind: "one", fk: "propertyId" },
      payments: { model: "payment", kind: "many", from: "occurrenceId" },
      reminders: { model: "reminderDelivery", kind: "many", from: "occurrenceId" },
    },
    uniques: [{ name: "billId_cycleIndex", fields: ["billId", "cycleIndex"] }],
  },
  {
    delegate: "payment",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      occurrenceId: str(),
      billId: str(),
      propertyId: str(),
      payeeId: str(),
      paidOn: { kind: "date" },
      amount: { kind: "decimal" },
      paymentMethodId: opt(),
      confirmationNumber: opt(),
      note: opt(),
      undoneAt: stamp(),
      ...timestamps(),
    },
    relations: {
      occurrence: { model: "occurrence", kind: "one", fk: "occurrenceId" },
      bill: { model: "bill", kind: "one", fk: "billId" },
      property: { model: "property", kind: "one", fk: "propertyId" },
      payee: { model: "payee", kind: "one", fk: "payeeId" },
      paymentMethod: { model: "paymentMethod", kind: "one", fk: "paymentMethodId" },
    },
    uniques: [],
  },
  {
    delegate: "creditCard",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      propertyId: str(),
      billId: opt(),
      issuer: { kind: "string", default: "" },
      nickname: { kind: "string", default: "" },
      last4: str(),
      creditLimit: money(),
      currentBalance: money(),
      statementDay: num(undefined, true),
      dueDay: num(undefined, true),
      minimumPayment: money(),
      apr: money(),
      autopay: flag(false),
      cardholderId: opt(),
      archivedAt: stamp(),
      ...timestamps(),
    },
    relations: {
      property: { model: "property", kind: "one", fk: "propertyId" },
      bill: { model: "bill", kind: "one", fk: "billId" },
      cardholder: { model: "person", kind: "one", fk: "cardholderId" },
    },
    uniques: [{ name: "billId", fields: ["billId"] }],
  },
  {
    delegate: "monthEntry",
    pk: "id",
    hasUpdatedAt: true,
    fields: {
      id: str(),
      householdId: str(),
      billId: str(),
      yearMonth: str(),
      amount: money(),
      paidOn: day(),
      status: en(MONTH_STATUS, "not_done"),
      dueDate: day(),
      statementAmount: money(),
      amountPaid: money(),
      note: opt(),
      ...timestamps(),
    },
    relations: { bill: { model: "bill", kind: "one", fk: "billId" } },
    uniques: [{ name: "billId_yearMonth", fields: ["billId", "yearMonth"] }],
  },
  {
    delegate: "ledgerMonth",
    pk: "id",
    hasUpdatedAt: false,
    fields: {
      id: str(),
      householdId: str(),
      yearMonth: str(),
      archivedAt: stamp(),
      createdAt: { kind: "datetime" },
    },
    relations: {},
    uniques: [{ name: "householdId_yearMonth", fields: ["householdId", "yearMonth"] }],
  },
  {
    delegate: "auditLog",
    pk: "id",
    hasUpdatedAt: false,
    fields: {
      id: str(),
      householdId: str(),
      entityType: str(),
      entityId: str(),
      action: str(),
      summary: str(),
      createdAt: { kind: "datetime" },
    },
    relations: {},
    uniques: [],
  },
  {
    delegate: "householdPrefs",
    pk: "householdId",
    hasUpdatedAt: false,
    fields: {
      householdId: str(),
      reminderDays: ints([7, 3, 1, 0]),
      digestHour: num(8),
      digestMinute: num(0),
      dueSoonDays: num(7),
      quietStart: num(1320),
      quietEnd: num(420),
      backupDir: opt(),
      autoBackup: flag(true),
      retention: num(14),
      shiftWeekends: en(SHIFT, "none"),
      lastBackupOn: day(),
    },
    relations: { household: { model: "household", kind: "one", fk: "householdId" } },
    uniques: [],
  },
  {
    delegate: "pluginState",
    pk: "id",
    hasUpdatedAt: false,
    fields: { id: str(), householdId: str(), pluginId: str(), enabled: flag(true) },
    relations: {},
    uniques: [{ name: "householdId_pluginId", fields: ["householdId", "pluginId"] }],
  },
  {
    delegate: "reminderDelivery",
    pk: "id",
    hasUpdatedAt: false,
    fields: {
      id: str(),
      householdId: str(),
      dedupeKey: str(),
      occurrenceId: opt(),
      billId: opt(),
      kind: str(),
      offsetDays: num(0),
      channel: str(),
      sentAt: { kind: "datetime" },
    },
    relations: { occurrence: { model: "occurrence", kind: "one", fk: "occurrenceId" } },
    uniques: [{ name: "dedupeKey", fields: ["dedupeKey"] }],
  },
];

export const MODEL_BY_DELEGATE = new Map(MODELS.map((model) => [model.delegate, model]));

export function modelOf(delegate: string): Model {
  const model = MODEL_BY_DELEGATE.get(delegate);
  if (!model) throw new Error(`Unknown model ${delegate}`);
  return model;
}
