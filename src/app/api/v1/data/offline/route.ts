import { NextResponse, type NextRequest } from "next/server";

import { dataRuntime } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { allowData } from "@/server/sheet/access";
import { jsonError } from "@/server/http";

export async function POST(request: NextRequest) {
  try {
    allowData(request);
    const body = (await request.json()) as { offline?: boolean };
    return NextResponse.json(await dataRuntime.setOffline(Boolean(body.offline)));
  } catch (error) {
    if (error instanceof Error && !(error instanceof ServiceError)) {
      return jsonError(new ServiceError(error.message, 400, "invalid"));
    }
    return jsonError(error);
  }
}
