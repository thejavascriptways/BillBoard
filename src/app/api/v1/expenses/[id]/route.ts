import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { expenseBodySchema } from "@/server/schemas";
import { deleteExpense, getExpense, updateExpense } from "@/server/services/expenses";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    return NextResponse.json({ expense: await getExpense(id) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    const body = expenseBodySchema.parse(await request.json());
    return NextResponse.json({ expense: await updateExpense(id, body) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    await deleteExpense(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
