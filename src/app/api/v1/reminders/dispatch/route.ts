import { NextResponse, type NextRequest } from "next/server";

import { jsonError } from "@/server/http";
import { assertSession } from "@/server/http";
import { dispatchReminders } from "@/server/services/reminders";

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json(await dispatchReminders());
  } catch (error) {
    return jsonError(error);
  }
}
