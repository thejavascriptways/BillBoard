import { NextResponse, type NextRequest } from "next/server";

import { dataRuntime } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { allowData } from "@/server/sheet/access";
import { jsonError } from "@/server/http";

export async function POST(request: NextRequest) {
  try {
    allowData(request);
    const body = (await request.json()) as {
      clientId?: string;
      clientSecret?: string;
      pickerApiKey?: string;
      email?: string;
      accessToken?: string;
      refreshToken?: string;
      folderId?: string;
      spreadsheetId?: string;
    };
    if (body.accessToken) return NextResponse.json(await dataRuntime.connectGoogle(body));
    if (!body.clientId?.trim() || !body.clientSecret?.trim()) {
      throw new ServiceError("Enter the desktop OAuth client id and secret.", 400, "invalid");
    }
    return NextResponse.json(await dataRuntime.connectPractice(body));
  } catch (error) {
    if (error instanceof Error && !(error instanceof ServiceError)) {
      return jsonError(new ServiceError(error.message, 400, "invalid"));
    }
    return jsonError(error);
  }
}
