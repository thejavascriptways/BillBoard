import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { clearSampleExpenses, countSampleExpenses } from "@/server/services/expenses";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ count: await countSampleExpenses() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await assertSession(request);
    const deleted = await clearSampleExpenses();
    return NextResponse.json({ deleted });
  } catch (error) {
    return jsonError(error);
  }
}
