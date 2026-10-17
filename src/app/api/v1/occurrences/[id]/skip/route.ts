import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { skipOccurrence } from "@/server/services/bills";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    return NextResponse.json({ occurrence: await skipOccurrence(id) });
  } catch (error) {
    return jsonError(error);
  }
}
