import { type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { yearMatrixCsv } from "@/server/services/months";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    const year = request.nextUrl.searchParams.get("year") ?? String(new Date().getFullYear());
    const csv = await yearMatrixCsv(year);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="billboard-${year}.csv"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
