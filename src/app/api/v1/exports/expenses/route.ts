import { type NextRequest } from "next/server";

import { todayInChicago } from "@/lib/dates";
import { assertSession, jsonError } from "@/server/http";
import { exportExpenses } from "@/server/services/expenses";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    const params = request.nextUrl.searchParams;
    const csv = await exportExpenses({
      propertyId: params.get("propertyId") || undefined,
      categoryId: params.get("categoryId") || undefined,
      from: params.get("from") || undefined,
      to: params.get("to") || undefined,
      q: params.get("q") || undefined,
    });
    const filename = `billboard-expenses-${todayInChicago()}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
