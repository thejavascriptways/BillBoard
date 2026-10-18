import { NextResponse, type NextRequest } from "next/server";

import { MASTER_TABLES } from "@/lib/masters";
import { assertSession, jsonError } from "@/server/http";
import { assertTable, createMaster, deleteMaster, listMasters, mergeMaster, setActive, updateMaster, type MasterWrite } from "@/server/services/masters";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    const table = request.nextUrl.searchParams.get("table");
    if (!table) return NextResponse.json({ tables: MASTER_TABLES });
    const rows = await listMasters(assertTable(table), {
      activeOnly: request.nextUrl.searchParams.get("active") === "1",
      q: request.nextUrl.searchParams.get("q"),
    });
    return NextResponse.json({ rows });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = (await request.json()) as MasterWrite & { table?: string; action?: string; id?: string; intoId?: string };
    const table = assertTable(body.table ?? "");
    if (body.action === "update" && body.id) return NextResponse.json({ row: await updateMaster(table, body.id, body) });
    if (body.action === "active" && body.id) return NextResponse.json(await setActive(table, body.id, body.isActive !== false));
    if (body.action === "merge" && body.id && body.intoId) return NextResponse.json(await mergeMaster(table, body.id, body.intoId));
    if (body.action === "delete" && body.id) {
      await deleteMaster(table, body.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ row: await createMaster(table, body) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
