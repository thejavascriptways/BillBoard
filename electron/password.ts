import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export const MIN_LOCK_PASSWORD_LENGTH = 8;

export type LockHash = {
  v: 1;
  salt: string;
  hash: string;
  n: number;
  r: number;
  p: number;
  keylen: number;
};

export async function hashLockPassword(password: string): Promise<LockHash> {
  if (password.length < MIN_LOCK_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_LOCK_PASSWORD_LENGTH} characters.`);
  }
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, KEYLEN)) as Buffer;
  return {
    v: 1,
    salt: salt.toString("base64url"),
    hash: hash.toString("base64url"),
    n: N,
    r: R,
    p: P,
    keylen: KEYLEN,
  };
}

export async function verifyLockPassword(password: string, stored: LockHash): Promise<boolean> {
  if (stored.v !== 1) return false;
  const salt = Buffer.from(stored.salt, "base64url");
  const expected = Buffer.from(stored.hash, "base64url");
  const actual = (await scrypt(password, salt, stored.keylen)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function clampAutoLockMinutes(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(240, Math.max(1, Math.round(parsed)));
}
