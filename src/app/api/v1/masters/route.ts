import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { MASTER_TABLES } from "@/lib/masters";
import { assertSession, jsonError } from "@/server/http";
import { assertTable, createMaster, deleteMaster, listMasters, mergeMaster, setActive, updateMaster, type MasterWrite } from "@/server/services/masters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    const table = request.nextUrl.searchParams.get("table");
    if (!table) return json({ tables: MASTER_TABLES });
    const rows = await listMasters(assertTable(table), {
      activeOnly: request.nextUrl.searchParams.get("active") === "1",
      q: request.nextUrl.searchParams.get("q"),
      includeId: request.nextUrl.searchParams.get("include"),
    });
    return json({ rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = (await request.json()) as MasterWrite & { table?: string; action?: string; id?: string; intoId?: string };
    const table = assertTable(body.table ?? "");
    const respond = (data: unknown, status = 200) => {
      revalidatePath("/", "layout");
      return json(data, status);
    };
    if (body.action === "update" && body.id) return respond({ row: await updateMaster(table, body.id, body) });
    if (body.action === "active" && body.id) return respond(await setActive(table, body.id, body.isActive !== false));
    if (body.action === "merge" && body.id && body.intoId) return respond(await mergeMaster(table, body.id, body.intoId));
    if (body.action === "delete" && body.id) {
      await deleteMaster(table, body.id);
      return respond({ ok: true });
    }
    return respond({ row: await createMaster(table, body) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
