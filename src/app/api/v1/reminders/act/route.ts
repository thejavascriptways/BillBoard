import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { reminderAction } from "@/server/services/reminders";

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = (await request.json()) as { occurrenceId?: string; action?: "paid" | "snooze" };
    if (!body.occurrenceId || (body.action !== "paid" && body.action !== "snooze")) {
      return NextResponse.json({ error: { code: "invalid", message: "Choose mark paid or snooze." } }, { status: 400 });
    }
    return NextResponse.json(await reminderAction(body.occurrenceId, body.action));
  } catch (error) {
    return jsonError(error);
  }
}
