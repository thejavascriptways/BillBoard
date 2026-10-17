import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { getDueBoard } from "@/server/services/dashboard";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json(await getDueBoard(request.nextUrl.searchParams.get("propertyId")));
  } catch (error) {
    return jsonError(error);
  }
}
