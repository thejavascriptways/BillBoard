import type { NextRequest } from "next/server";

import { passwordsMatch } from "@/lib/auth";
import { assertSession } from "@/server/http";

export function allowData(request: NextRequest): void {
  const expected = process.env.BILLBOARD_DESKTOP_TOKEN;
  const header = request.headers.get("x-billboard-desktop-token") ?? "";
  if (expected && header && passwordsMatch(header, expected)) return;
  assertSession(request);
}
