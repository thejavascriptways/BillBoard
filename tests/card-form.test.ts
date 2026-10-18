import { describe, expect, it } from "vitest";

import { cardDayValue, cardLast4Message, cardPropertyForSave } from "@/lib/card-form";

describe("card form", () => {
  it("requires exactly four digits and keeps optional days null", () => {
    expect(cardLast4Message("1234")).toBeNull();
    expect(cardLast4Message("12a")).toBe("Enter exactly 4 digits.");
    expect(cardLast4Message("")).toBe("Enter exactly 4 digits.");
    expect(cardLast4Message("12345")).toBe("Enter exactly 4 digits.");
    expect(cardDayValue("")).toEqual({ day: null, message: null });
    expect(cardDayValue("   ")).toEqual({ day: null, message: null });
    expect(cardDayValue("15").day).toBe(15);
    expect(cardDayValue("10").day).toBe(10);
    expect(cardDayValue("0").message).toBe("Use a day from 1 to 31, or leave it blank.");
    expect(cardDayValue("32").message).toBe("Use a day from 1 to 31, or leave it blank.");
  });

  it("saves a blank property onto the home currently in view", () => {
    expect(cardPropertyForSave("", "home-little")).toBe("home-little");
    expect(cardPropertyForSave("home-personal", "home-little")).toBe("home-personal");
    expect(cardPropertyForSave("", "all")).toBeNull();
  });
});