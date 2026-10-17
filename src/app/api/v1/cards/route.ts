import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { createCard, listCards } from "@/server/services/cards";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ cards: await listCards(request.nextUrl.searchParams.get("propertyId")) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ card: await createCard(await request.json()) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
