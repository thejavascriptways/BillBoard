import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { rescheduleOccurrence } from "@/server/services/bills";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    const body = (await request.json()) as { dueDate?: string };
    return NextResponse.json({ occurrence: await rescheduleOccurrence(id, body.dueDate ?? "") });
  } catch (error) {
    return jsonError(error);
  }
}
