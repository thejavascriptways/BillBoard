import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { listPayments } from "@/server/services/bills";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    const params = request.nextUrl.searchParams;
    const payments = await listPayments({
      billId: params.get("billId"),
      payeeId: params.get("payeeId"),
      propertyId: params.get("propertyId"),
    });
    return NextResponse.json({ payments });
  } catch (error) {
    return jsonError(error);
  }
}
