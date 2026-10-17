import { NextResponse, type NextRequest } from "next/server";

import { passwordsMatch, signSession } from "@/lib/auth";
import { sessionCookie } from "@/server/http";

export async function POST(request: NextRequest) {
  const expected = process.env.BILLBOARD_DESKTOP_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Desktop unlock is off." } },
      { status: 404 },
    );
  }
  const header = request.headers.get("x-billboard-desktop-token") ?? "";
  if (!header || !passwordsMatch(header, expected)) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json(
      { error: { code: "misconfigured", message: "AUTH_SECRET is missing." } },
      { status: 500 },
    );
  }
  const response = NextResponse.json({ authenticated: true, app: "BillBoard" });
  const cookie = sessionCookie(signSession(secret));
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
