import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { listPayees, savePayee } from "@/server/services/bills";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ payees: await listPayees() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ payee: await savePayee(await request.json()) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
