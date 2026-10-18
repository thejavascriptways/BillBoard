import { NextResponse, type NextRequest } from "next/server";

import { dataRuntime } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { allowData } from "@/server/sheet/access";
import { jsonError } from "@/server/http";

export async function POST(request: NextRequest) {
  try {
    allowData(request);
    const body = (await request.json()) as { spreadsheetId?: string };
    if (!body.spreadsheetId?.trim()) throw new ServiceError("Paste a spreadsheet id.", 400, "invalid");
    return NextResponse.json(await dataRuntime.adoptSpreadsheet(body.spreadsheetId.trim()));
  } catch (error) {
    if (error instanceof Error && !(error instanceof ServiceError)) {
      return jsonError(new ServiceError(error.message, 400, "invalid"));
    }
    return jsonError(error);
  }
}
