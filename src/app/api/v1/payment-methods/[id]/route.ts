import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { paymentMethodPatchSchema } from "@/server/schemas";
import { deletePaymentMethod, updatePaymentMethod } from "@/server/services/payment-methods";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    const body = paymentMethodPatchSchema.parse(await request.json());
    const paymentMethod = await updatePaymentMethod(id, body);
    return NextResponse.json({ paymentMethod });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    await deletePaymentMethod(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
