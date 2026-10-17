import { NextResponse, type NextRequest } from "next/server";

import { assertSession, clearedSessionCookie, jsonError } from "@/server/http";

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const response = NextResponse.json({ authenticated: false });
    const cookie = clearedSessionCookie();
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
