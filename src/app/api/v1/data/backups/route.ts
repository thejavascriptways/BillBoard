import { NextResponse, type NextRequest } from "next/server";

import { dataRuntime } from "@/server/db";
import { allowData } from "@/server/sheet/access";
import { jsonError } from "@/server/http";

export async function POST(request: NextRequest) {
  try {
    allowData(request);
    const body = (await request.json()) as { enabled?: boolean };
    return NextResponse.json(await dataRuntime.setDriveBackups(body.enabled !== false));
  } catch (error) {
    return jsonError(error);
  }
}
