import { NextResponse, type NextRequest } from "next/server";

import { passwordsMatch, signSession } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";
import { todayInChicago } from "@/lib/dates";
import { jsonError, sessionCookie } from "@/server/http";
import { ServiceError } from "@/server/errors";
import { loginBodySchema } from "@/server/schemas";

const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export async function POST(request: NextRequest) {
  try {
    const password = process.env.APP_PASSWORD;
    const secret = process.env.AUTH_SECRET;
    if (!password || !secret || secret.length < 16) {
      throw new ServiceError(
        "BillBoard auth is not configured. Set APP_PASSWORD and AUTH_SECRET.",
        500,
        "misconfigured",
      );
    }
    const ip = clientIp(request);
    const now = Date.now();
    const bucket = attempts.get(ip);
    if (bucket && bucket.resetAt > now && bucket.count >= 8) {
      throw new ServiceError("Too many attempts. Wait a few minutes and try again.", 429, "rate_limited");
    }
    const body = loginBodySchema.parse(await request.json().catch(() => ({})));
    if (!passwordsMatch(body.password, password)) {
      if (!bucket || bucket.resetAt <= now) {
        attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
      } else {
        bucket.count += 1;
      }
      throw new ServiceError("That password doesn't match.", 401, "unauthorized");
    }
    attempts.delete(ip);
    const response = NextResponse.json({
      authenticated: true,
      app: APP_NAME,
      today: todayInChicago(),
      timezone: "America/Chicago",
    });
    const cookie = sessionCookie(signSession(secret));
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
