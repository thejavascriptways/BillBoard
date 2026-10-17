import type { PrismaClient } from "@prisma/client";

/**
 * Persistence seam for BillBoard.
 *
 * Today the books live in Supabase Postgres through Prisma. Supabase encrypts
 * that database at rest. The UI and the expense services talk to Prisma.
 *
 * A later local store (SQLCipher) can implement LedgerStore and be chosen in
 * openLedgerStore. That swap should not require a new UI.
 */
export interface LedgerStore {
  readonly kind: "supabase";
  readonly client: PrismaClient;
}

export function openLedgerStore(client: PrismaClient): LedgerStore {
  return { kind: "supabase", client };
}
