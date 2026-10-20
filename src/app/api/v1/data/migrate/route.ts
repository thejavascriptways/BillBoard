import { NextResponse, type NextRequest } from "next/server";

import { dataRuntime } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { allowData } from "@/server/sheet/access";
import { jsonError } from "@/server/http";
import type { Row } from "@/server/sheet/memory-db";

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

export async function POST(request: NextRequest) {
  try {
    allowData(request);
    if (!process.env.DATABASE_URL) {
      throw new ServiceError(
        "Copy from Supabase needs DATABASE_URL in .env for this one command. The running app does not use it after the copy.",
        400,
        "invalid",
      );
    }
    const { PrismaClient } = await import("@prisma/client");
    const sourceClient = new PrismaClient();
    try {
      const source: Record<string, Row[]> = {};
      for (const model of MODELS) {
        const rows = await (sourceClient as unknown as Record<string, { findMany: () => Promise<Row[]> }>)[model].findMany();
        source[model] = JSON.parse(JSON.stringify(rows)) as Row[];
      }
      const counts = await dataRuntime.migrate(source);
      return NextResponse.json({ counts });
    } finally {
      await sourceClient.$disconnect();
    }
  } catch (error) {
    if (error instanceof Error && !(error instanceof ServiceError)) {
      return jsonError(new ServiceError(error.message, 400, "invalid"));
    }
    return jsonError(error);
  }
}
