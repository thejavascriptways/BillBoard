import { NextResponse, type NextRequest } from "next/server";

import { allowData } from "@/server/sheet/access";
import { dataRuntime } from "@/server/db";
import { jsonError } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    allowData(request);
    await dataRuntime.boot();
    return NextResponse.json(dataRuntime.status());
  } catch (error) {
    return jsonError(error);
  }
}
