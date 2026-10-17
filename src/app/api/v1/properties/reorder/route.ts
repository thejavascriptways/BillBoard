import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { reorderSchema } from "@/server/schemas";
import { reorderProperties } from "@/server/services/properties";

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = reorderSchema.parse(await request.json());
    return NextResponse.json({ properties: await reorderProperties(body.ids) });
  } catch (error) {
    return jsonError(error);
  }
}
