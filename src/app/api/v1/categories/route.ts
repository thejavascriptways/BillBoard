import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { categoryCreateSchema } from "@/server/schemas";
import { createCategory, listCategories } from "@/server/services/categories";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ categories: await listCategories() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = categoryCreateSchema.parse(await request.json());
    const category = await createCategory(body);
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
