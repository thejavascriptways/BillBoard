import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { categoryPatchSchema } from "@/server/schemas";
import { deleteCategory, updateCategory } from "@/server/services/categories";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    const body = categoryPatchSchema.parse(await request.json());
    const category = await updateCategory(id, body);
    return NextResponse.json({ category });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    await deleteCategory(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
