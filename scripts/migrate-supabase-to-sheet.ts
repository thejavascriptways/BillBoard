import { PrismaClient } from "@prisma/client";

import { dataRuntime } from "../src/server/db";
import type { Row } from "../src/server/sheet/memory-db";

const MODELS = [
  "household",
  "householdPrefs",
  "property",
  "category",
  "paymentMethod",
  "person",
  "payee",
  "cardIssuer",
  "lookupLabel",
  "vehicle",
  "occupancyPeriod",
  "payerSplit",
  "payerSplitShare",
  "reminderSetting",
  "bill",
  "creditCard",
  "occurrence",
  "payment",
  "monthEntry",
  "ledgerMonth",
  "expense",
  "auditLog",
  "pluginState",
  "reminderDelivery",
] as const;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL in .env. This command is the only one that reads Postgres.");
    process.exitCode = 1;
    return;
  }
  const sourceClient = new PrismaClient();
  try {
    const source: Record<string, Row[]> = {};
    for (const model of MODELS) {
      const rows = await (sourceClient as unknown as Record<string, { findMany: () => Promise<Row[]> }>)[model].findMany();
      source[model] = JSON.parse(JSON.stringify(rows)) as Row[];
    }
    await dataRuntime.boot();
    const counts = await dataRuntime.migrate(source);
    console.log(JSON.stringify(counts, null, 2));
    if (!process.env.BILLBOARD_GOOGLE_ACCESS_TOKEN || !process.env.BILLBOARD_SPREADSHEET_ID) {
      console.log("No Google sheet was configured in this process. On the running app, use Settings → Data → Copy from Supabase.");
      console.log("To write a sheet from this command, set BILLBOARD_GOOGLE_ACCESS_TOKEN and BILLBOARD_SPREADSHEET_ID.");
    }
  } finally {
    await sourceClient.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
