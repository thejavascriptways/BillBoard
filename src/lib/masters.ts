export const MASTER_TABLES = [
  { id: "homes", label: "Homes", creatable: true, system: false },
  { id: "utility-types", label: "Utility types", creatable: true, system: false },
  { id: "categories", label: "Categories", creatable: true, system: false },
  { id: "payees", label: "Providers", creatable: true, system: false },
  { id: "payment-methods", label: "Payment methods", creatable: true, system: false },
  { id: "payment-modes", label: "Payment modes", creatable: false, system: false },
  { id: "people", label: "People", creatable: true, system: false },
  { id: "issuers", label: "Card issuers", creatable: true, system: false },
  { id: "property-types", label: "Property types", creatable: true, system: false },
  { id: "system", label: "System lists", creatable: false, system: true },
] as const;

export type MasterTableId = (typeof MASTER_TABLES)[number]["id"];

export type MasterRow = {
  id: string;
  key: string;
  name: string;
  detail: string | null;
  color: string | null;
  parentId: string | null;
  parentName: string | null;
  isActive: boolean;
  sortOrder: number;
  usage: number;
  system: boolean;
  address: string | null;
  notes: string | null;
  status: string | null;
  last4: string | null;
};

export const PAYMENT_MODE_KEYS = [
  { key: "auto", label: "Autopay" },
  { key: "manual", label: "Manual" },
  { key: "check", label: "Check" },
  { key: "paycheck", label: "Paycheck" },
  { key: "covered", label: "Covered" },
] as const;

export const PROPERTY_TYPE_KEYS = [
  { key: "primary", label: "Primary home" },
  { key: "rental", label: "Rental" },
  { key: "vacation", label: "Vacation" },
  { key: "other", label: "Other" },
] as const;

export const SYSTEM_LISTS: { group: string; items: string[] }[] = [
  { group: "Amount kind", items: ["Fixed", "Variable", "Estimated"] },
  { group: "Repeats", items: ["Weekly", "Every 2 weeks", "Monthly", "Quarterly", "Twice a year", "Yearly", "Every N", "One time"] },
  { group: "Weekend shift", items: ["None", "Earlier", "Later"] },
  { group: "Interval", items: ["Days", "Weeks", "Months"] },
  { group: "Month status", items: ["Not done", "Done", "Failed", "Not applicable", "Included", "Skipped", "Pending"] },
  { group: "Due rule", items: ["Schedule", "Day of month", "Last day", "Last business day", "Every N months", "On demand", "Usage", "Balance", "Event", "Statement"] },
  { group: "Home status", items: ["Active", "Upcoming", "Archived"] },
];
