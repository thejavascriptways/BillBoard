export function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export type SecretBundle = {
  DATABASE_URL: string;
  DIRECT_URL: string;
  AUTH_SECRET: string;
};

export function secretsFromEnv(env: Record<string, string | undefined>): SecretBundle | null {
  const databaseUrl = env.DATABASE_URL?.trim();
  const directUrl = env.DIRECT_URL?.trim() || databaseUrl;
  const authSecret = env.AUTH_SECRET?.trim();
  if (!databaseUrl || !directUrl || !authSecret || authSecret.length < 16) return null;
  if (!databaseUrl.startsWith("postgres")) return null;
  return { DATABASE_URL: databaseUrl, DIRECT_URL: directUrl, AUTH_SECRET: authSecret };
}
