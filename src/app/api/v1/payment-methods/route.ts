import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { paymentMethodCreateSchema } from "@/server/schemas";
import { createPaymentMethod, listPaymentMethods } from "@/server/services/payment-methods";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ paymentMethods: await listPaymentMethods() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = paymentMethodCreateSchema.parse(await request.json());
    const paymentMethod = await createPaymentMethod(body);
    return NextResponse.json({ paymentMethod }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
