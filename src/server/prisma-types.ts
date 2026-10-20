/** Local stand-in for the Prisma types the services already use. */

export class Decimal {
  private readonly raw: string;

  constructor(value: Decimal | string | number) {
    if (value instanceof Decimal) {
      this.raw = value.raw;
      return;
    }
    const text = String(value).trim();
    if (!text || Number.isNaN(Number(text))) {
      this.raw = "0";
      return;
    }
    this.raw = text;
  }

  toFixed(digits = 2): string {
    return Number(this.raw).toFixed(digits);
  }

  toString(): string {
    return this.raw;
  }

  toNumber(): number {
    return Number(this.raw);
  }

  toJSON(): string {
    return this.raw;
  }
}

export type PropertyKind = "primary" | "rental" | "vacation" | "other";
export type PropertyStatus = "active" | "upcoming" | "archived";

export type Property = {
  id: string;
  householdId: string;
  slug: string;
  name: string;
  address: string | null;
  notes: string | null;
  kind: PropertyKind;
  status: PropertyStatus;
  purchaseDate: Date | null;
  roleStartsOn: Date | null;
  roleBecomes: PropertyKind | null;
  typeKey: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Category = {
  id: string;
  householdId: string;
  slug: string;
  name: string;
  color: string;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PaymentMethod = {
  id: string;
  householdId: string;
  slug: string;
  nickname: string;
  last4: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Person = {
  id: string;
  householdId: string;
  name: string;
  notes: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Expense = {
  id: string;
  householdId: string;
  expenseDate: Date;
  propertyId: string;
  categoryId: string;
  paymentMethodId: string;
  payee: string;
  amount: Decimal;
  notes: string | null;
  isSample: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Bill = {
  id: string;
  householdId: string;
  name: string;
  payeeId: string | null;
  propertyId: string;
  categoryId: string;
  amountKind: "fixed" | "variable" | "estimated";
  amount: Decimal | null;
  anchorDate: Date;
  autopay: boolean;
  paymentMethodId: string | null;
  notes: string | null;
  portalUrl: string | null;
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "every_n" | "once";
  intervalN: number;
  intervalUnit: "days" | "weeks" | "months";
  dayOfMonth: number | null;
  endDate: Date | null;
  endCount: number | null;
  shiftWeekends: "none" | "earlier" | "later";
  reminderDays: number[];
  graceDays: number;
  generatedThrough: Date | null;
  paymentMode: "auto" | "manual" | "check" | "paycheck" | "covered";
  coveredByBillId: string | null;
  dueOnNote: string | null;
  dueRuleKind: string;
  sessionEveryN: number | null;
  sessionCount: number;
  balanceThreshold: Decimal | null;
  accountBalance: Decimal | null;
  personId: string | null;
  muted: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PrismaClient = import("@/server/sheet/memory-db").MemoryDb;

export const Prisma = { Decimal };

export namespace Prisma {
  export type Decimal = InstanceType<typeof Decimal>;
  export type TransactionClient = import("@/server/sheet/memory-db").MemoryDb;
  export type PrismaClient = import("@/server/sheet/memory-db").MemoryDb;
  export type PrismaPromise<T> = Promise<T>;
  export type CategoryUpdateInput = {
    name?: string;
    color?: string;
    parent?: { connect: { id: string } } | { disconnect: boolean };
    [key: string]: unknown;
  };
  export type ExpenseWhereInput = Record<string, unknown>;
}
