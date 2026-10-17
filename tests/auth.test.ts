import { describe, expect, it } from "vitest";

import { passwordsMatch, signSession, verifySession } from "@/lib/auth";
import { safeNextPath } from "@/lib/paths";

describe("session cookie", () => {
  const secret = "dev-only-billboard-secret-change-me";

  it("accepts a signed session and rejects tampering or expiry", () => {
    const now = Date.parse("2026-10-17T12:00:00.000Z");
    const token = signSession(secret, now);
    expect(verifySession(token, secret, now + 1000)).toBe(true);
    expect(verifySession(token, "other-secret-value-here", now + 1000)).toBe(false);
    expect(verifySession(`${token}x`, secret, now + 1000)).toBe(false);
    expect(verifySession(token, secret, now + 40 * 24 * 60 * 60 * 1000)).toBe(false);
    expect(passwordsMatch("billboard-dev", "billboard-dev")).toBe(true);
    expect(passwordsMatch("nope", "billboard-dev")).toBe(false);
  });

  it("only follows same-site paths after login", () => {
    expect(safeNextPath("/expenses/new")).toBe("/expenses/new");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
  });
});
