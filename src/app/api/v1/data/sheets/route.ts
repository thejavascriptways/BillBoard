import { NextResponse, type NextRequest } from "next/server";

import { dataRuntime } from "@/server/db";
import { allowData } from "@/server/sheet/access";
import { jsonError } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    allowData(request);
    await dataRuntime.boot();
    return NextResponse.json({ sheets: await dataRuntime.listSheets() });
  } catch (error) {
    return jsonError(error);
  }
}
