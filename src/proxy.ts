import { NextResponse, type NextRequest } from "next/server";

import { verifySession } from "@/lib/auth";
import { isPublicAsset, safeNextPath } from "@/lib/paths";
import { SESSION_COOKIE } from "@/lib/constants";

const PUBLIC_PATHS = new Set(["/login", "/api/v1/auth/login", "/api/v1/auth/session"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/_next/") || isPublicAsset(pathname)) return NextResponse.next();

  const authenticated = verifySession(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env.AUTH_SECRET,
  );

  if (PUBLIC_PATHS.has(pathname)) {
    if (authenticated && pathname === "/login") {
      const next = safeNextPath(request.nextUrl.searchParams.get("next"));
      return NextResponse.redirect(new URL(next, request.url));
    }
    return NextResponse.next();
  }

  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401 },
    );
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // `_next/` includes the dev HMR socket. Gating that socket sends the login
    // page a redirect instead of a WebSocket upgrade, so the form never hydrates.
    "/((?!_next/|favicon.ico|sw.js|manifest.webmanifest|brand/|.*\\.(?:png|svg|ico|webp|jpg|jpeg)$).*)",
  ],
};
