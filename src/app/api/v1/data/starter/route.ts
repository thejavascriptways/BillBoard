import { NextResponse, type NextRequest } from "next/server";

import { dataRuntime } from "@/server/db";
import { allowData } from "@/server/sheet/access";
import { jsonError } from "@/server/http";

export async function POST(request: NextRequest) {
  try {
    allowData(request);
    return NextResponse.json(await dataRuntime.startStarterLists());
  } catch (error) {
    return jsonError(error);
  }
}
