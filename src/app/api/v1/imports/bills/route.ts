import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { importBillCsv, importWithPlugin, previewBillCsv } from "@/server/services/imports";
import type { BillColumn } from "@/core/csv-bills";

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = (await request.json()) as {
      action?: "preview" | "import" | "plugin";
      text?: string;
      mapping?: Partial<Record<BillColumn, number | null>>;
      pluginId?: string;
    };
    if (body.action === "plugin") {
      const bills = await importWithPlugin(body.pluginId ?? "", body.text ?? "");
      return NextResponse.json({ created: bills.length, bills });
    }
    if (body.action === "import") {
      return NextResponse.json(await importBillCsv(body.text ?? "", (body.mapping ?? {}) as Record<BillColumn, number | null>));
    }
    return NextResponse.json(previewBillCsv(body.text ?? "", body.mapping));
  } catch (error) {
    return jsonError(error);
  }
}
