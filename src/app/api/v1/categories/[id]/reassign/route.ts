import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { reassignSchema } from "@/server/schemas";
import { reassignCategory } from "@/server/services/categories";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    const body = reassignSchema.parse(await request.json());
    const result = await reassignCategory(id, body.toId);
    return NextResponse.json({ ...result, deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
