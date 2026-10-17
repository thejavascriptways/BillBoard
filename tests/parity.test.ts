import { describe, expect, it } from "vitest";

import { cardMonthFlags } from "@/core/card-month";
import { parseDueOn } from "@/core/due-on";
import { checklistBand, excludedFromTotals, initialMonthEntry, monthTotals } from "@/core/months";
import { inQuietHours, planReminders } from "@/core/reminders";
import { dateRejection, missingPastDue, parseLedgerAmount, paymentWarnings } from "@/core/validation";

describe("due-on parser", () => {
  it("reads day, mode, and the original note", () => {
    const parsed = parseDueOn("6th of every month (auto paid)");
    expect(parsed.dueRuleKind).toBe("day_of_month");
    expect(parsed.dayOfMonth).toBe(6);
    expect(parsed.frequency).toBe("monthly");
    expect(parsed.paymentMode).toBe("auto");
    expect(parsed.autopay).toBe(true);
    expect(parsed.note).toBe("6th of every month (auto paid)");
    expect(parseDueOn("20th of every month (by check)").paymentMode).toBe("check");
    expect(parseDueOn("on demand").dueRuleKind).toBe("on_demand");
    expect(parseDueOn("event based").dueRuleKind).toBe("event");
    expect(parseDueOn("on low balance").dueRuleKind).toBe("balance");
    expect(parseDueOn("every 8 classes").sessionEveryN).toBe(8);
    expect(parseDueOn("every 6 months").dueRuleKind).toBe("every_n_months");
    expect(parseDueOn("annually").frequency).toBe("annual");
    expect(parseDueOn("bill due date").dueRuleKind).toBe("statement");
    expect(parseDueOn("last business day").dayOfMonth).toBe(-2);
    expect(parseDueOn("paid in paycheck").paymentMode).toBe("paycheck");
  });
});

describe("rollover", () => {
  it("prefills fixed amounts, leaves variable blank, and records a card zero", () => {
    expect(initialMonthEntry({ paymentMode: "manual", amountKind: "fixed", amount: "45.00", isCard: false, balanceCents: null }).amount).toBe("45.00");
    const variable = initialMonthEntry({ paymentMode: "manual", amountKind: "variable", amount: "80.00", isCard: false, balanceCents: null });
    expect(variable.amount).toBeNull();
    expect(variable.prompt).toBe(true);
    const zero = initialMonthEntry({ paymentMode: "manual", amountKind: "variable", amount: "40.00", isCard: true, balanceCents: 0 });
    expect(zero.statementAmount).toBe("0.00");
    expect(zero.amount).toBe("0.00");
    expect(initialMonthEntry({ paymentMode: "auto", amountKind: "fixed", amount: "10.00", isCard: false, balanceCents: null }).status).toBe("pending");
  });
});

describe("statuses and totals", () => {
  it("drops N/A, included, skipped, paycheck, and covered rows, and keeps zero distinct from blank", () => {
    expect(excludedFromTotals("not_applicable", "manual")).toBe(true);
    expect(excludedFromTotals("included", "manual")).toBe(true);
    expect(excludedFromTotals("not_done", "paycheck")).toBe(true);
    expect(excludedFromTotals("not_done", "covered")).toBe(true);
    const totals = monthTotals([
      { status: "not_done", paymentMode: "manual", amount: "10.00" },
      { status: "done", paymentMode: "manual", amount: "5.00" },
      { status: "not_done", paymentMode: "manual", amount: "0.00" },
      { status: "not_done", paymentMode: "manual", amount: null },
      { status: "not_applicable", paymentMode: "manual", amount: "99.00" },
      { status: "included", paymentMode: "covered", amount: null },
    ]);
    expect(totals.dueCents).toBe(1500);
    expect(totals.paidCents).toBe(500);
    expect(checklistBand({
      status: "not_done",
      paymentMode: "paycheck",
      dueDate: "2026-10-06",
      today: "2026-10-17",
      yearMonth: "2026-10",
      dueSoonDays: 7,
      dueRuleKind: "day_of_month",
      frequency: "monthly",
    })).toBe("reference");
  });
});

describe("validation", () => {
  it("rejects placeholder years and day 0, and warns on odd payments", () => {
    expect(dateRejection("2000-05-01")).toMatch(/placeholder/i);
    expect(dateRejection("2001-01-15")).toMatch(/placeholder/i);
    expect(dateRejection("2026-10-00")).toMatch(/real day/i);
    expect(parseLedgerAmount("0.00")).toEqual({ cents: 0 });
    expect(parseLedgerAmount("")).toEqual({ blank: true });
    expect("error" in parseLedgerAmount("221..64")).toBe(true);
    const review = paymentWarnings({
      paidOn: "2026-01-02",
      dueDate: "2026-10-06",
      amount: "1000.00",
      recentAmounts: ["100.00", "110.00"],
      duplicate: true,
      markingDone: true,
      confirm: false,
    });
    expect(review.warnings.join(" ")).toMatch(/far from the due month/);
    expect(review.warnings.join(" ")).toMatch(/recent average/);
    expect(review.warnings.join(" ")).toMatch(/already recorded/);
    expect(paymentWarnings({
      paidOn: null,
      dueDate: "2026-10-06",
      amount: null,
      recentAmounts: [],
      duplicate: false,
      markingDone: true,
      confirm: false,
    }).errors[0]).toMatch(/amount and a paid date/);
    expect(missingPastDue({ status: "not_done", amount: null, dueDate: "2026-10-01", today: "2026-10-17" })).toBe(true);
  });
});

describe("card flags", () => {
  it("flags a short payment and treats $0 as a real balance", () => {
    expect(cardMonthFlags("200.00", "40.00")).toEqual({ paidBelowStatement: true, balanceCarried: true, zeroBalance: false });
    expect(cardMonthFlags("0.00", "0.00").zeroBalance).toBe(true);
    expect(cardMonthFlags(null, null).zeroBalance).toBe(false);
  });
});

describe("reminder additions", () => {
  it("stays quiet, verifies autopay, and catches up after the machine was off", () => {
    expect(inQuietHours(23 * 60, 22 * 60, 7 * 60)).toBe(true);
    expect(inQuietHours(8 * 60, 22 * 60, 7 * 60)).toBe(false);
    const quiet = planReminders({
      today: "2026-10-17",
      minutesNow: 23 * 60,
      digestHour: 8,
      digestMinute: 0,
      digestSent: true,
      quietStart: 22 * 60,
      quietEnd: 7 * 60,
      occurrences: [],
    });
    expect(quiet).toEqual([]);
    const verify = planReminders({
      today: "2026-10-18",
      minutesNow: 9 * 60,
      digestHour: 8,
      digestMinute: 0,
      digestSent: true,
      occurrences: [
        {
          occurrenceId: "occ",
          billId: "bill",
          billName: "Electric",
          propertyName: "Little Elm Home",
          dueDate: "2026-10-17",
          open: true,
          offsets: [7, 3, 1, 0],
          snoozedUntil: null,
          sentKeys: [],
          autopay: true,
        },
      ],
    });
    expect(verify.some((item) => item.kind === "verify")).toBe(true);
    const catchUp = planReminders({
      today: "2026-10-16",
      minutesNow: 9 * 60,
      digestHour: 8,
      digestMinute: 0,
      digestSent: true,
      catchUpDays: 3,
      occurrences: [
        {
          occurrenceId: "occ",
          billId: "bill",
          billName: "HOA",
          propertyName: "Little Elm Home",
          dueDate: "2026-10-17",
          open: true,
          offsets: [3],
          snoozedUntil: null,
          sentKeys: [],
          variable: true,
          amountBlank: true,
        },
      ],
    });
    expect(catchUp.some((item) => item.kind === "enter_amount")).toBe(true);
  });
});
