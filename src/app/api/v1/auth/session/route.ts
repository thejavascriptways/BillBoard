import { NextResponse, type NextRequest } from "next/server";

import { verifySession } from "@/lib/auth";
import { APP_NAME, SESSION_COOKIE, TIMEZONE } from "@/lib/constants";
import { todayInChicago } from "@/lib/dates";

export async function GET(request: NextRequest) {
  const authenticated = verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env.AUTH_SECRET,
  );
  if (!authenticated) {
    return NextResponse.json({ authenticated: false, app: APP_NAME });
  }
  return NextResponse.json({
    authenticated: true,
    app: APP_NAME,
    today: todayInChicago(),
    timezone: TIMEZONE,
  });
}
