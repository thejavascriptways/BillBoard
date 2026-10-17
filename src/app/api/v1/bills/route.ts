import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { createBill, listBills } from "@/server/services/bills";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    return NextResponse.json({ bills: await listBills(propertyId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const bill = await createBill(await request.json());
    return NextResponse.json({ bill }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
