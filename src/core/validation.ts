import { isIsoDate } from "@/lib/dates";

import type { MonthStatus } from "@/core/months";

const AMOUNT = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export function dateRejection(iso: string): string | null {
  const value = iso.trim();
  if (!value || value.includes("-00")) return "That date is not a real day.";
  if (!isIsoDate(value)) return "That date is not a real day.";
  const year = Number(value.slice(0, 4));
  if (year === 2000 || year === 2001) return "Year 2000 and 2001 are placeholders. Enter the real year.";
  if (year < 2020 || year > 2100) return "Enter a year between 2020 and 2100.";
  return null;
}

/** Empty is blank. 0.00 is a real zero. Mixed text is rejected. */
export function parseLedgerAmount(input: unknown): { blank: true } | { cents: number } | { error: string } {
  if (input == null) return { blank: true };
  const raw = String(input).trim().replace(/[$,\s]/g, "");
  if (!raw) return { blank: true };
  if (!AMOUNT.test(raw)) return { error: "Enter a dollar amount with up to two decimals." };
  const [whole, fraction = ""] = raw.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 99_999_999_99) return { error: "Amount is too large." };
  return { cents };
}

export function paymentWarnings(input: {
  paidOn: string | null;
  dueDate: string | null;
  amount: string | null;
  recentAmounts: string[];
  duplicate: boolean;
  markingDone: boolean;
  confirm: boolean;
}): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (input.paidOn) {
    const rejected = dateRejection(input.paidOn);
    if (rejected) errors.push(rejected);
  }
  if (input.markingDone && !input.confirm) {
    const missingAmount = input.amount == null || input.amount === "";
    if (missingAmount || !input.paidOn) errors.push("Done needs an amount and a paid date, or confirm to save it anyway.");
  }
  if (input.paidOn && input.dueDate && !dateRejection(input.paidOn) && !dateRejection(input.dueDate)) {
    const [py, pm] = input.paidOn.slice(0, 7).split("-").map(Number);
    const [dy, dm] = input.dueDate.slice(0, 7).split("-").map(Number);
    if (Math.abs(py * 12 + pm - (dy * 12 + dm)) > 1) warnings.push("Paid date is far from the due month.");
  }
  if (input.amount != null && input.amount !== "") {
    const amount = Number(input.amount);
    const recent = input.recentAmounts.map(Number).filter((value) => value > 0);
    if (recent.length > 0 && amount > 0) {
      const average = recent.reduce((sum, value) => sum + value, 0) / recent.length;
      if (amount >= average * 5 || amount * 5 <= average) warnings.push("Amount is far from the recent average.");
    }
  }
  if (input.duplicate) warnings.push("A payment for this amount and date is already recorded.");
  return { errors, warnings };
}

export function missingPastDue(input: { status: MonthStatus; amount: string | null; dueDate: string | null; today: string }): boolean {
  if (input.status === "done" || input.status === "not_applicable" || input.status === "included" || input.status === "skipped") {
    return false;
  }
  if (!input.dueDate || input.dueDate >= input.today) return false;
  return input.amount == null;
}
