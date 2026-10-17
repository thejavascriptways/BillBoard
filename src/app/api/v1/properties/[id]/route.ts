import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { propertyPatchSchema } from "@/server/schemas";
import { deleteProperty, updateProperty } from "@/server/services/properties";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    const body = propertyPatchSchema.parse(await request.json());
    const property = await updateProperty(id, body);
    return NextResponse.json({ property });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    await deleteProperty(id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
