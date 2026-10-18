import type { PrismaClient } from "@/server/prisma-types";

/**
 * Persistence seam for BillBoard.
 *
 * The books live in a Google Sheet named BillBoard, inside a Drive folder
 * of the same name. The running app reads and writes an in-memory copy of
 * that sheet. Domain services talk to that copy through a Prisma-shaped client.
 */
export interface LedgerStore {
  readonly kind: "sheet";
  readonly client: PrismaClient;
}

export function openLedgerStore(client: PrismaClient): LedgerStore {
  return { kind: "sheet", client };
}
