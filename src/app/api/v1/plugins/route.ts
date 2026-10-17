import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { listPlugins, setPluginEnabled } from "@/server/services/imports";

export async function GET(request: NextRequest) {
  try {
    await assertSession(request);
    return NextResponse.json({ plugins: await listPlugins() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await assertSession(request);
    const body = (await request.json()) as { pluginId?: string; enabled?: boolean };
    return NextResponse.json({ plugins: await setPluginEnabled(body.pluginId ?? "", Boolean(body.enabled)) });
  } catch (error) {
    return jsonError(error);
  }
}
