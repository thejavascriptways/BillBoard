import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { reorderSchema } from "@/server/schemas";
import { reorderCategories } from "@/server/services/categories";

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = reorderSchema.parse(await request.json());
    return NextResponse.json({ categories: await reorderCategories(body.ids) });
  } catch (error) {
    return jsonError(error);
  }
}
