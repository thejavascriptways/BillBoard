import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { deleteBill, getBill, updateBill } from "@/server/services/bills";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    return NextResponse.json({ bill: await getBill(id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    return NextResponse.json({ bill: await updateBill(id, await request.json()) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    await deleteBill(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
