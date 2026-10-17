import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { createPerson, listPeople } from "@/server/services/people";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ people: await listPeople() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const person = await createPerson(await request.json());
    return NextResponse.json({ person }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
