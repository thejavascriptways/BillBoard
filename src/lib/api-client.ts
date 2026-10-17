export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;

  constructor(message: string, status: number, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 401 && !path.startsWith("/api/v1/auth/login")) {
    const next = `${window.location.pathname}${window.location.search}`;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load so the proxy can require sign-in
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
    throw new ApiError("Sign in required.", 401);
  }
  const text = await response.text();
  const data = text ? (JSON.parse(text) as { error?: { message?: string; fieldErrors?: Record<string, string> } }) : null;
  if (!response.ok) {
    throw new ApiError(data?.error?.message || "Something went wrong.", response.status, data?.error?.fieldErrors);
  }
  return data as T;
}
