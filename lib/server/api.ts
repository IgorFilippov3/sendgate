import { NextResponse } from "next/server";
import { authorize, rateLimit } from "./guard";

export function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

/**
 * Shared request handling for the v2 API: auth, rate limit, JSON parsing and
 * error mapping. `handle` receives the parsed body.
 */
export async function handleApi(
  request: Request,
  handle: (body: Record<string, unknown>) => Promise<NextResponse>,
): Promise<NextResponse> {
  const auth = authorize(request.headers);
  if (!auth.ok) return apiError(auth.status, auth.status === 403 ? "api_disabled" : "unauthorized", auth.error);

  const wait = rateLimit(auth.key);
  if (wait > 0) {
    return apiError(429, "rate_limited", `Too many requests. Retry in ${wait}s.`, {
      "Retry-After": String(wait),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "invalid_body", "Request body must be a JSON object.");
  }

  try {
    return await handle(body as Record<string, unknown>);
  } catch (err) {
    console.error("[api] unexpected error", err);
    return apiError(500, "internal_error", "Internal server error.");
  }
}
