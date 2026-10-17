import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { deletePerson, updatePerson } from "@/server/services/people";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    return NextResponse.json({ person: await updatePerson(id, await request.json()) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await assertSession(request);
    const { id } = await context.params;
    await deletePerson(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
