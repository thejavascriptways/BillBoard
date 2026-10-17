import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { getPrefs, toPrefsDTO, updatePrefs } from "@/server/services/prefs";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ prefs: toPrefsDTO(await getPrefs()) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ prefs: await updatePrefs(await request.json()) });
  } catch (error) {
    return jsonError(error);
  }
}
