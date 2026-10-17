import { describe, expect, it } from "vitest";

import { cardDates, cardDisplayName, totalUtilization, utilizationPercent } from "@/core/cards";
import { decryptBackup, encryptBackup } from "@/core/backup-crypto";
import { guessMapping, mapBillRows, parseCsv } from "@/core/csv-bills";
import { EventBus } from "@/core/events";
import { PluginHost } from "@/core/plugins";
import { generateDueDates, shiftWeekend } from "@/core/recurrence";
import { planReminders } from "@/core/reminders";
import { occurrenceStatus } from "@/core/status";
import { sampleJsonBills } from "../plugins/sample-json-bills/plugin";

describe("recurrence", () => {
  it("clamps month-end, honors last day, weekends, every-N, and an end count", () => {
    const monthly = generateDueDates(
      {
        frequency: "monthly",
        interval: 1,
        unit: "months",
        dayOfMonth: 31,
        anchorDate: "2026-01-31",
        endDate: null,
        endCount: 3,
        shift: "none",
      },
      "2027-01-01",
    );
    expect(monthly.map((row) => row.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);

    const last = generateDueDates(
      {
        frequency: "monthly",
        interval: 1,
        unit: "months",
        dayOfMonth: -1,
        anchorDate: "2026-01-15",
        endDate: null,
        endCount: 2,
        shift: "none",
      },
      "2026-12-31",
    );
    expect(last[1]?.dueDate).toBe("2026-02-28");

    expect(shiftWeekend("2026-10-17", "earlier")).toBe("2026-10-16");
    expect(shiftWeekend("2026-10-18", "later")).toBe("2026-10-19");

    const every = generateDueDates(
      {
        frequency: "every_n",
        interval: 10,
        unit: "days",
        dayOfMonth: null,
        anchorDate: "2026-10-01",
        endDate: "2026-10-21",
        endCount: null,
        shift: "none",
      },
      "2027-01-01",
    );
    expect(every.map((row) => row.dueDate)).toEqual(["2026-10-01", "2026-10-11", "2026-10-21"]);
  });
});

describe("reminders", () => {
  it("plans a lead reminder once and skips it after it is marked sent", () => {
    const base = {
      today: "2026-10-14",
      minutesNow: 8 * 60,
      digestHour: 8,
      digestMinute: 0,
      digestSent: true,
      occurrences: [
        {
          occurrenceId: "occ-1",
          billId: "bill-1",
          billName: "Electric",
          propertyName: "Little Elm Home",
          dueDate: "2026-10-17",
          open: true,
          offsets: [3, 1, 0],
          snoozedUntil: null,
          sentKeys: [] as string[],
        },
      ],
    };
    const first = planReminders(base);
    expect(first.map((item) => item.dedupeKey)).toContain("occ-1:lead:3");
    const second = planReminders({
      ...base,
      occurrences: [{ ...base.occurrences[0], sentKeys: first.map((item) => item.dedupeKey) }],
    });
    expect(second.find((item) => item.dedupeKey === "occ-1:lead:3")).toBeUndefined();
  });

  it("sends overdue again the next day and a digest once", () => {
    const overdue = planReminders({
      today: "2026-10-18",
      minutesNow: 9 * 60,
      digestHour: 8,
      digestMinute: 0,
      digestSent: false,
      occurrences: [
        {
          occurrenceId: "occ-1",
          billId: "bill-1",
          billName: "HOA",
          propertyName: "Little Elm Home",
          dueDate: "2026-10-17",
          open: true,
          offsets: [3, 1, 0],
          snoozedUntil: null,
          sentKeys: [],
        },
      ],
    });
    expect(overdue.some((item) => item.kind === "overdue")).toBe(true);
    expect(overdue.some((item) => item.kind === "digest")).toBe(true);
    const again = planReminders({
      today: "2026-10-18",
      minutesNow: 9 * 60,
      digestHour: 8,
      digestMinute: 0,
      digestSent: true,
      occurrences: [
        {
          occurrenceId: "occ-1",
          billId: "bill-1",
          billName: "HOA",
          propertyName: "Little Elm Home",
          dueDate: "2026-10-17",
          open: true,
          offsets: [3],
          snoozedUntil: "2026-10-19",
          sentKeys: ["occ-1:overdue:2026-10-18"],
        },
      ],
    });
    expect(again).toHaveLength(0);
  });
});

describe("cards", () => {
  it("names a card from the issuer when the nickname is blank", () => {
    expect(cardDisplayName("Chase", "", "4421")).toBe("Chase •••• 4421");
    expect(cardDisplayName("", "", "4421")).toBe("Card •••• 4421");
    expect(cardDisplayName("Chase", "Sapphire", "4421")).toBe("Sapphire");
  });

  it("computes the next statement, due date, and utilization", () => {
    expect(cardDates("2026-10-17", 15, 10)).toEqual({
      nextStatement: "2026-11-15",
      nextDue: "2026-11-10",
    });
    expect(cardDates("2026-10-05", 15, 10)).toEqual({
      nextStatement: "2026-10-15",
      nextDue: "2026-10-10",
    });
    expect(utilizationPercent(25000, 100000)).toBe(25);
    expect(totalUtilization([
      { balanceCents: 20000, limitCents: 100000 },
      { balanceCents: 30000, limitCents: 100000 },
    ])).toBe(25);
    expect(occurrenceStatus({
      dueDate: "2026-10-17",
      expectedCents: 1000,
      paidCents: 400,
      skipped: false,
      today: "2026-10-17",
      dueSoonDays: 7,
    })).toBe("partial");
  });
});

describe("backup", () => {
  it("round-trips a payload and rejects the wrong password", async () => {
    const file = await encryptBackup(JSON.stringify({ version: 1, hello: "bills" }), "correct-horse");
    expect(file.subarray(0, 5).toString()).toBe("BBBK1");
    await expect(decryptBackup(file, "correct-horse")).resolves.toContain("bills");
    await expect(decryptBackup(file, "wrong-password")).rejects.toThrow(/password/i);
  });
});

describe("sample plugin", () => {
  it("imports JSON bills without the core parser knowing the format", () => {
    const host = new PluginHost();
    host.activate(sampleJsonBills);
    const rows = host.parse(
      "sample-json-bills",
      JSON.stringify({
        bills: [{ name: "Electric", payee: "Oncor", amount: "140.00", dueDate: "2026-11-06", property: "Little Elm Home" }],
      }),
    );
    expect(rows).toEqual([
      expect.objectContaining({ name: "Electric", payee: "Oncor", amount: "140.00", dueDate: "2026-11-06" }),
    ]);
    host.deactivate(sampleJsonBills);
    expect(() => host.parse("sample-json-bills", "{}")).toThrow(/not enabled/);
  });

  it("guesses CSV columns", () => {
    const table = parseCsv("Bill,Vendor,Amount,Due date\nElectric,Oncor,140.00,2026-11-06\n");
    const mapping = guessMapping(table[0] ?? []);
    expect(mapBillRows(table, mapping)[0]).toMatchObject({
      name: "Electric",
      payee: "Oncor",
      amount: "140.00",
      dueDate: "2026-11-06",
    });
  });
});

describe("event bus", () => {
  it("delivers payment.recorded", () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on("payment.recorded", (payload) => seen.push(payload.paymentId));
    bus.emit("payment.recorded", { paymentId: "pay-1", billId: "bill-1", amount: "10.00" });
    expect(seen).toEqual(["pay-1"]);
  });
});
