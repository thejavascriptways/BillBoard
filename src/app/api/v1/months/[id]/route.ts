import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { markMonthPaid, setMonthAmount, setMonthStatus, undoMonthPaid } from "@/server/services/months";

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
    if (body.action === "amount") return NextResponse.json(await setMonthAmount(id, body.amount ?? null));
    if (body.action === "undo") return NextResponse.json(await undoMonthPaid(id));
    return NextResponse.json(await markMonthPaid(id, body));
  } catch (error) {
    return jsonError(error);
  }
}
