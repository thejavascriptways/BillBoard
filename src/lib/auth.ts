import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { SESSION_MAX_AGE_SECONDS } from "@/lib/constants";

export function passwordsMatch(input: string, expected: string): boolean {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function signSession(secret: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_SECONDS;
  const payload = `v1.${exp}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(
  token: string | undefined,
  secret: string | undefined,
  nowMs = Date.now(),
): boolean {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expText, signature] = parts;
  if (version !== "v1" || !expText || !signature) return false;
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp * 1000 <= nowMs) return false;
  const expected = createHmac("sha256", secret).update(`${version}.${expText}`).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
