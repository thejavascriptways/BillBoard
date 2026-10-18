import { describe, expect, it } from "vitest";

import { committedOption } from "@/lib/select-value";

describe("committedOption", () => {
  it("keeps a blank choice when the select allows one", () => {
    expect(committedOption("", ["home-a"], true)).toBeNull();
  });

  it("adopts the first option when an empty value is showing that option", () => {
    expect(committedOption("", ["home-a", "home-b"], false)).toBe("home-a");
  });

  it("leaves a value that is already in the list", () => {
    expect(committedOption("home-b", ["home-a", "home-b"], false)).toBeNull();
  });
});
