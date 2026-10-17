import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/csv";
import { fromCents, parseAmountInput, toCents } from "@/lib/money";
import { hasAccountNumber } from "@/lib/secrets";

describe("money", () => {
  it("parses dollars and cents without float drift", () => {
    expect(parseAmountInput("1,240.50")).toEqual({ cents: 124050 });
    expect(parseAmountInput("$15.99")).toEqual({ cents: 1599 });
    expect(parseAmountInput("0")).toEqual({ error: "Enter an amount greater than zero." });
    expect(parseAmountInput("10.555")).toEqual({ error: "Enter a dollar amount with up to two decimals." });
    expect(fromCents(toCents("2418.66"))).toBe("2418.66");
  });
});

describe("account numbers", () => {
  it("allows a nickname and last 4, and rejects full numbers", () => {
    expect(hasAccountNumber("Chase ••4421")).toBe(false);
    expect(hasAccountNumber("Check 10234")).toBe(false);
    expect(hasAccountNumber("4111111111111111")).toBe(true);
    expect(hasAccountNumber("4111-1111-1111-1111")).toBe(true);
    expect(hasAccountNumber("acct 12345678")).toBe(true);
  });
});

describe("csv", () => {
  it("quotes commas and neutralizes spreadsheet formulas", () => {
    const csv = toCsv(["Payee", "Notes"], [["SAMPLE, \"Oncor\"", "line\nbreak"], ["=cmd", ""]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"SAMPLE, ""Oncor"""');
    expect(csv).toContain('"line\nbreak"');
    expect(csv).toContain("'=cmd");
  });
});
