import { describe, expect, it } from "vitest";

import { parseEnvFile, secretsFromEnv } from "../electron/env-file";
import { clampAutoLockMinutes, hashLockPassword, verifyLockPassword } from "../electron/password";
import { openLedgerStore } from "@/core/ledger-store";

describe("desktop lock password", () => {
  it("accepts the password that was set and rejects a different one", async () => {
    const stored = await hashLockPassword("household-lock");
    expect(await verifyLockPassword("household-lock", stored)).toBe(true);
    expect(await verifyLockPassword("other-password", stored)).toBe(false);
  });

  it("refuses a short password", async () => {
    await expect(hashLockPassword("short")).rejects.toThrow(/8 characters/);
  });

  it("keeps auto-lock between 1 and 240 minutes", () => {
    expect(clampAutoLockMinutes(10)).toBe(10);
    expect(clampAutoLockMinutes(0)).toBe(1);
    expect(clampAutoLockMinutes(999)).toBe(240);
    expect(clampAutoLockMinutes("nope")).toBe(10);
  });
});

describe("env import", () => {
  it("reads quoted values and skips comments", () => {
    const parsed = parseEnvFile(`
# comment
DATABASE_URL="postgresql://billboard:p%40ss@127.0.0.1:5432/billboard"
AUTH_SECRET='dev-only-billboard-secret-change-me'
`);
    expect(parsed.DATABASE_URL).toContain("p%40ss");
    expect(parsed.AUTH_SECRET).toBe("dev-only-billboard-secret-change-me");
  });

  it("requires both a postgres URL and a long AUTH_SECRET", () => {
    expect(secretsFromEnv({ DATABASE_URL: "postgresql://localhost/db", AUTH_SECRET: "short" })).toBeNull();
    const bundle = secretsFromEnv({
      DATABASE_URL: "postgresql://localhost/db",
      AUTH_SECRET: "dev-only-billboard-secret-change-me",
    });
    expect(bundle?.DIRECT_URL).toBe("postgresql://localhost/db");
  });
});

describe("ledger store", () => {
  it("names Supabase as the current store", () => {
    const store = openLedgerStore({} as never);
    expect(store.kind).toBe("supabase");
  });
});
