import { NextResponse, type NextRequest } from "next/server";

import type { ExpenseQuery } from "@/lib/types";
import { assertSession, jsonError } from "@/server/http";
import { expenseBodySchema } from "@/server/schemas";
import { createExpense, listExpenses } from "@/server/services/expenses";

function readQuery(request: NextRequest): ExpenseQuery {
  const params = request.nextUrl.searchParams;
  const limitText = params.get("limit");
  const limit = limitText ? Number(limitText) : undefined;
  return {
    propertyId: params.get("propertyId") || undefined,
    categoryId: params.get("categoryId") || undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    q: params.get("q") || undefined,
    cursor: params.get("cursor") || undefined,
    limit: limit !== undefined && Number.isFinite(limit) ? limit : undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json(await listExpenses(readQuery(request)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = expenseBodySchema.parse(await request.json());
    const expense = await createExpense(body);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
