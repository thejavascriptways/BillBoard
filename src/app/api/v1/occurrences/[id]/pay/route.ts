import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { payOccurrence } from "@/server/services/bills";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ occurrence: await payOccurrence(id, body) });
  } catch (error) {
    return jsonError(error);
  }
}
