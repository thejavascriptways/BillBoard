import { addDays, compareIso } from "@/lib/dates";
import { toCents } from "@/lib/money";

import type { DueRuleKind, PaymentMode } from "@/core/due-on";
import { isNonMonthly } from "@/core/due-on";

export type MonthStatus = "not_done" | "done" | "failed" | "not_applicable" | "included" | "skipped" | "pending";
export type AmountKind = "fixed" | "variable" | "estimated";

export type MonthSeed = {
  amount: string | null;
  statementAmount: string | null;
  amountPaid: string | null;
  status: MonthStatus;
  prompt: boolean;
};

/** What a new month row should contain. Blank (null) stays distinct from $0.00. */
export function initialMonthEntry(input: {
  paymentMode: PaymentMode;
  amountKind: AmountKind;
  amount: string;
  isCard: boolean;
  balanceCents: number | null;
}): MonthSeed {
  if (input.paymentMode === "covered") {
    return { amount: null, statementAmount: null, amountPaid: null, status: "included", prompt: false };
  }
  if (input.paymentMode === "paycheck") {
    return { amount: input.amount, statementAmount: null, amountPaid: null, status: "not_applicable", prompt: false };
  }
  if (input.isCard && input.balanceCents === 0) {
    return { amount: "0.00", statementAmount: "0.00", amountPaid: "0.00", status: "not_done", prompt: false };
  }
  const status: MonthStatus = input.paymentMode === "auto" ? "pending" : "not_done";
  if (input.isCard || input.amountKind !== "fixed") {
    return { amount: null, statementAmount: null, amountPaid: null, status, prompt: true };
  }
  return { amount: input.amount, statementAmount: null, amountPaid: null, status, prompt: false };
}

export function excludedFromTotals(status: MonthStatus, mode: PaymentMode): boolean {
  if (mode === "covered" || mode === "paycheck") return true;
  if (status === "not_applicable" || status === "included" || status === "skipped") return true;
  return false;
}

export function monthContribution(row: { status: MonthStatus; paymentMode: PaymentMode; amount: string | null }): {
  due: number;
  paid: number;
} {
  if (excludedFromTotals(row.status, row.paymentMode) || row.amount == null) return { due: 0, paid: 0 };
  const due = toCents(row.amount);
  return { due, paid: row.status === "done" ? due : 0 };
}

export function monthTotals(rows: { status: MonthStatus; paymentMode: PaymentMode; amount: string | null }[]): {
  dueCents: number;
  paidCents: number;
  remainingCents: number;
} {
  const totals = rows.reduce(
    (sum, row) => {
      const part = monthContribution(row);
      return { dueCents: sum.dueCents + part.due, paidCents: sum.paidCents + part.paid };
    },
    { dueCents: 0, paidCents: 0 },
  );
  return { ...totals, remainingCents: totals.dueCents - totals.paidCents };
}

export type ChecklistBand = "annual" | "overdue" | "due_soon" | "upcoming" | "paid" | "reference";

export function checklistBand(input: {
  status: MonthStatus;
  paymentMode: PaymentMode;
  dueDate: string | null;
  today: string;
  yearMonth: string;
  dueSoonDays: number;
  dueRuleKind: DueRuleKind;
  frequency: string;
}): ChecklistBand {
  if (
    input.paymentMode === "paycheck" ||
    input.paymentMode === "covered" ||
    input.status === "not_applicable" ||
    input.status === "included"
  ) {
    return "reference";
  }
  if (input.status === "done" || input.status === "skipped") return "paid";
  const nonMonthly = isNonMonthly(input.dueRuleKind, input.frequency);
  const pastMonth = input.yearMonth < input.today.slice(0, 7);
  const overdue = input.status === "failed" || pastMonth || (input.dueDate != null && compareIso(input.dueDate, input.today) < 0);
  if (nonMonthly && !overdue) return "annual";
  if (overdue) return "overdue";
  if (nonMonthly) return "annual";
  if (!input.dueDate) return "upcoming";
  const soon = addDays(input.today, input.dueSoonDays);
  if (compareIso(input.dueDate, soon) <= 0) return "due_soon";
  return "upcoming";
}

export type YearDot = "done" | "missed" | "na" | "pending" | "open" | "empty";

export function yearDot(status: MonthStatus | null, dueDate: string | null, today: string): YearDot {
  if (!status) return "empty";
  if (status === "not_applicable" || status === "included" || status === "skipped") return "na";
  if (status === "done") return "done";
  if (status === "pending") return "pending";
  if (status === "failed") return "missed";
  if (dueDate && compareIso(dueDate, today) < 0) return "missed";
  return "open";
}

export function reminderSkipped(status: MonthStatus, mode: PaymentMode, muted: boolean): boolean {
  if (muted) return true;
  if (mode === "covered" || mode === "paycheck") return true;
  return status === "not_applicable" || status === "included" || status === "skipped" || status === "done";
}
