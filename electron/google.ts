import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { URL } from "node:url";

import { shell } from "electron";

const SCOPE = "https://www.googleapis.com/auth/drive.file openid email";

export type GoogleSession = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  email: string;
  pickerApiKey?: string;
  folderId?: string;
  spreadsheetId?: string;
  backupsFolderId?: string;
};

export async function signInWithGoogle(input: {
  clientId: string;
  clientSecret: string;
  pickerApiKey?: string;
}): Promise<GoogleSession> {
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  if (!clientId || !clientSecret) throw new Error("Enter the desktop OAuth client id and secret.");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const { code, redirectUri } = await waitForCode(clientId, challenge);
  const tokens = await exchange(clientId, clientSecret, verifier, code, redirectUri);
  const email = await accountEmail(tokens.accessToken);
  return {
    clientId,
    clientSecret,
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    email,
    pickerApiKey: input.pickerApiKey?.trim() || undefined,
  };
}

function waitForCode(clientId: string, challenge: string): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let redirectUri = "";
    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/oauth/callback") {
        response.writeHead(404);
        response.end();
        return;
      }
      const authCode = url.searchParams.get("code");
      const failure = url.searchParams.get("error");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<p>You can close this window and return to BillBoard.</p>");
      server.close();
      if (authCode) resolve({ code: authCode, redirectUri });
      else reject(new Error(failure || "Google did not return a code."));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.searchParams.set("client_id", clientId);
      auth.searchParams.set("redirect_uri", redirectUri);
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("scope", SCOPE);
      auth.searchParams.set("code_challenge", challenge);
      auth.searchParams.set("code_challenge_method", "S256");
      auth.searchParams.set("access_type", "offline");
      auth.searchParams.set("prompt", "consent");
      void shell.openExternal(auth.toString());
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Google sign-in timed out."));
    }, 180_000).unref();
  });
}

async function exchange(clientId: string, clientSecret: string, verifier: string, code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) throw new Error("Google did not accept the sign-in code.");
  const payload = (await response.json()) as { access_token?: string; refresh_token?: string };
  if (!payload.access_token || !payload.refresh_token) throw new Error("Google did not return a refresh token. Try signing in again.");
  return { accessToken: payload.access_token, refreshToken: payload.refresh_token };
}

async function accountEmail(accessToken: string): Promise<string> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return "";
  const payload = (await response.json()) as { email?: string };
  return payload.email ?? "";
}
