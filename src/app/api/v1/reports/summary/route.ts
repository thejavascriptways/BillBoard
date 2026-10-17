import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { getSummary } from "@/server/services/reports";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json(await getSummary());
  } catch (error) {
    return jsonError(error);
  }
}
