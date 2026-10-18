import type { MasterTableId } from "@/lib/masters";
import { listMasters, type MasterWrite } from "@/server/services/masters";

/** Every household dropdown reads the Configuration master table. */
export const DROPDOWN_TABLES = [
  "homes",
  "utility-types",
  "categories",
  "payees",
  "payment-methods",
  "payment-modes",
  "people",
  "issuers",
  "property-types",
] as const satisfies readonly MasterTableId[];

export async function loadDropdown(table: MasterTableId, includeId?: string | null) {
  return listMasters(table, { activeOnly: true, includeId });
}

export type { MasterWrite };
