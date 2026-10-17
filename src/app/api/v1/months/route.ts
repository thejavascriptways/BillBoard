import { NextResponse, type NextRequest } from "next/server";

import { todayInChicago } from "@/lib/dates";
import { assertSession, jsonError } from "@/server/http";
import { archiveMonth, billTimeline, ensureMonth, getChecklist } from "@/server/services/months";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    const params = request.nextUrl.searchParams;
    const billId = params.get("billId");
    if (billId) return NextResponse.json(await billTimeline(billId));
    const yearMonth = params.get("yearMonth") ?? todayInChicago().slice(0, 7);
    return NextResponse.json(
      await getChecklist({
        yearMonth,
        propertyId: params.get("propertyId"),
        categoryId: params.get("categoryId"),
        personId: params.get("personId"),
        paymentMode: params.get("paymentMode"),
        status: params.get("status"),
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = (await request.json()) as { action?: string; yearMonth?: string };
    if (body.action === "archive") return NextResponse.json(await archiveMonth(body.yearMonth ?? ""));
    return NextResponse.json(await ensureMonth(body.yearMonth ?? ""));
  } catch (error) {
    return jsonError(error);
  }
}
