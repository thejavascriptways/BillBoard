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
  AUTH_SECRET: string;
  APP_PASSWORD?: string;
  DATABASE_URL?: string;
  DIRECT_URL?: string;
};

export function secretsFromEnv(env: Record<string, string | undefined>): SecretBundle | null {
  const authSecret = env.AUTH_SECRET?.trim();
  if (!authSecret || authSecret.length < 16) return null;
  const databaseUrl = env.DATABASE_URL?.trim();
  const directUrl = env.DIRECT_URL?.trim() || databaseUrl;
  if (databaseUrl && !databaseUrl.startsWith("postgres")) return null;
  const appPassword = env.APP_PASSWORD?.trim();
  return {
    AUTH_SECRET: authSecret,
    ...(appPassword ? { APP_PASSWORD: appPassword } : {}),
    ...(databaseUrl && directUrl ? { DATABASE_URL: databaseUrl, DIRECT_URL: directUrl } : {}),
  };
}
