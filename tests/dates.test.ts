import { describe, expect, it } from "vitest";

import { isIsoDate, lastDayIso, monthRange, shiftMonth, todayInChicago } from "@/lib/dates";

describe("Chicago calendar dates", () => {
  it("uses the Chicago calendar day, including just before and after midnight", () => {
    expect(todayInChicago(new Date("2026-10-17T04:59:00.000Z"))).toBe("2026-10-16");
    expect(todayInChicago(new Date("2026-10-17T05:00:00.000Z"))).toBe("2026-10-17");
  });

  it("rejects impossible dates and accepts month bounds", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-10-17")).toBe(true);
    expect(lastDayIso(2026, 2)).toBe("2026-02-28");
    expect(monthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthRange("2026-13")).toBeNull();
  });

  it("keeps shifted sample dates inside the same calendar year", () => {
    expect(shiftMonth("2026-10-17", -1, 31)).toBe("2026-09-30");
    expect(shiftMonth("2026-01-15", -1, 1)).toBeNull();
  });
});
