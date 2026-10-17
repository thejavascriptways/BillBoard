import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { queryOccurrences } from "@/server/services/bills";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    const params = request.nextUrl.searchParams;
    const occurrences = await queryOccurrences({
      propertyId: params.get("propertyId"),
      categoryId: params.get("categoryId"),
      status: params.get("status"),
      from: params.get("from"),
      to: params.get("to"),
      q: params.get("q"),
    });
    return NextResponse.json({ occurrences });
  } catch (error) {
    return jsonError(error);
  }
}
