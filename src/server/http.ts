import { NextResponse, type NextRequest } from "next/server";

import { verifySession } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";
import { ServiceError } from "@/server/errors";

type Issue = { path: PropertyKey[]; message: string };

function isZodError(error: unknown): error is { issues: Issue[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown }).issues)
  );
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof ServiceError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          fieldErrors: error.fieldErrors,
        },
      },
      { status: error.status },
    );
  }
  if (isZodError(error)) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const key = issue.path.map(String).join(".") || "form";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    const first = Object.values(fieldErrors)[0] ?? "Check the highlighted fields.";
    return NextResponse.json(
      { error: { code: "invalid", message: first, fieldErrors } },
      { status: 400 },
    );
  }
  console.error(error);
  return NextResponse.json(
    { error: { code: "server", message: "Something went wrong." } },
    { status: 500 },
  );
}

export function assertSession(request: NextRequest): void {
  const secret = process.env.AUTH_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!verifySession(token, secret)) {
    throw new ServiceError("Sign in required.", 401, "unauthorized");
  }
}

function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: sessionCookieOptions(SESSION_MAX_AGE_SECONDS),
  };
}

export function clearedSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: sessionCookieOptions(0),
  };
}
