import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { duplicateBill } from "@/server/services/bills";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    return NextResponse.json({ bill: await duplicateBill(id) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
