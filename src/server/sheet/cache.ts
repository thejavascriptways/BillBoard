import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Decimal } from "@/server/prisma-types";
import { MODELS } from "@/server/sheet/catalog";
import { cloneRow, type Row } from "@/server/sheet/memory-db";

const DIRECTORY = path.join(process.cwd(), ".billboard");

function keyMaterial(): Buffer {
  const fromEnv = process.env.BILLBOARD_CACHE_KEY?.trim();
  if (fromEnv) return scryptSync(fromEnv, "billboard-cache", 32);
  fs.mkdirSync(DIRECTORY, { recursive: true });
  const file = path.join(DIRECTORY, "cache.key");
  if (!fs.existsSync(file)) fs.writeFileSync(file, randomBytes(32).toString("hex"));
  return scryptSync(fs.readFileSync(file, "utf8"), "billboard-cache", 32);
}

function revive(delegate: string, row: Row): Row {
  const model = MODELS.find((item) => item.delegate === delegate);
  const next = cloneRow(row);
  if (!model) return next;
  for (const [field, spec] of Object.entries(model.fields)) {
    const value = next[field];
    if (value == null) continue;
    if (spec.kind === "decimal" && typeof value === "string") next[field] = new Decimal(value);
    if ((spec.kind === "date" || spec.kind === "datetime") && typeof value === "string") next[field] = new Date(value);
  }
  return next;
}

export function cacheEnabled(): boolean {
  return !process.env.VITEST;
}

export function readCache(): Record<string, Row[]> | null {
  if (!cacheEnabled()) return null;
  const file = path.join(DIRECTORY, "cache.bin");
  if (!fs.existsSync(file)) return null;
  try {
    const payload = fs.readFileSync(file);
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const data = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(json) as { tables?: Record<string, Row[]> };
    const tables: Record<string, Row[]> = {};
    for (const [delegate, rows] of Object.entries(parsed.tables ?? {})) tables[delegate] = rows.map((row) => revive(delegate, row));
    return tables;
  } catch {
    return null;
  }
}

export function writeCache(tables: Record<string, Row[]>): void {
  if (!cacheEnabled()) return;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ tables })), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.mkdirSync(DIRECTORY, { recursive: true });
  fs.writeFileSync(path.join(DIRECTORY, "cache.bin"), Buffer.concat([iv, tag, body]));
}
