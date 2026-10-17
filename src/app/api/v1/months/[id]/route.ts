import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { markMonthPaid, setMonthStatus } from "@/server/services/months";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      status?: string;
      amount?: string | null;
      paidOn?: string | null;
      confirm?: boolean;
      statementAmount?: string | null;
    };
    if (body.action === "status") return NextResponse.json(await setMonthStatus(id, body.status ?? ""));
    return NextResponse.json(await markMonthPaid(id, body));
  } catch (error) {
    return jsonError(error);
  }
}
