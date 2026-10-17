import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { propertyCreateSchema } from "@/server/schemas";
import { createProperty, listProperties } from "@/server/services/properties";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ properties: await listProperties() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = propertyCreateSchema.parse(await request.json());
    const property = await createProperty(body);
    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
