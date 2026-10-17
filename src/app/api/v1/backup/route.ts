import { NextResponse, type NextRequest } from "next/server";

import { assertSession, jsonError } from "@/server/http";
import { exportEncrypted, maybeAutoBackup, restoreBackup } from "@/server/services/backup";

export async function POST(request: NextRequest) {
  try {
    await assertSession(request);
    const body = (await request.json()) as { password?: string; mode?: string; fileBase64?: string; auto?: boolean };
    if (body.auto) {
      const result = await maybeAutoBackup(body.password ?? "");
      return NextResponse.json({
        skipped: result.skipped,
        filename: result.filename,
        fileBase64: result.bytes ? result.bytes.toString("base64") : undefined,
      });
    }
    if (body.fileBase64) {
      const mode = body.mode === "merge" ? "merge" : "replace";
      const result = await restoreBackup(Buffer.from(body.fileBase64, "base64"), body.password ?? "", mode);
      return NextResponse.json(result);
    }
    const file = await exportEncrypted(body.password ?? "");
    return NextResponse.json({ filename: file.filename, fileBase64: file.bytes.toString("base64") });
  } catch (error) {
    return jsonError(error);
  }
}
