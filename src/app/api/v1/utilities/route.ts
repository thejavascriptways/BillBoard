import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { createUtility, utilityCatalog, type UtilityWrite } from "@/server/services/utilities";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json(await utilityCatalog());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const bill = await createUtility((await request.json()) as UtilityWrite);
    return NextResponse.json({ bill }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
