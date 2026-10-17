import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/constants";
import { assertSession, jsonError } from "@/server/http";

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const response = NextResponse.json({ authenticated: false });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
