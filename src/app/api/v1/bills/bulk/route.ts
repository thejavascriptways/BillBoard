import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { archiveBills } from "@/server/services/bills";

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = (await request.json()) as { ids?: string[]; archived?: boolean };
    const count = await archiveBills(body.ids ?? [], body.archived !== false);
    return NextResponse.json({ count });
  } catch (error) {
    return jsonError(error);
  }
}
