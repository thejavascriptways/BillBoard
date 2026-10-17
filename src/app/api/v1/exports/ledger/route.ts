import { type NextRequest } from "next/server";

import { todayInChicago } from "@/lib/dates";
import { assertSession, jsonError } from "@/server/http";
import { exportBillsCsv, exportCardsCsv, exportPaymentsCsv } from "@/server/services/imports";

async function csv(request: NextRequest, kind: "bills" | "payments" | "cards") {
  await assertSession(request);
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const body =
    kind === "bills" ? await exportBillsCsv(propertyId) : kind === "payments" ? await exportPaymentsCsv(propertyId) : await exportCardsCsv();
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="billboard-${kind}-${todayInChicago()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const requested = request.nextUrl.searchParams.get("kind");
    const kind = requested === "cards" || requested === "payments" ? requested : "bills";
    return await csv(request, kind);
  } catch (error) {
    return jsonError(error);
  }
}
