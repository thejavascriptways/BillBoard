import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { undoPayment } from "@/server/services/bills";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    await undoPayment(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
