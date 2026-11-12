import { timingSafeEqual, createHash } from "node:crypto";
import { CONFIG } from "@/lib/engine/config";
import { RateLimiter } from "@/lib/engine/util/cache";

const store = globalThis as unknown as { __sendgateRateLimiter?: RateLimiter };

function limiter(): RateLimiter {
  store.__sendgateRateLimiter ??= new RateLimiter(CONFIG.rateLimitPerMinute);
  return store.__sendgateRateLimiter;
}

/**
 * Best-effort client identifier. Behind a reverse proxy the first
 * X-Forwarded-For entry is the client; without one all requests share a key,
 * which still caps total throughput.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "unknown";
}

/** Returns seconds to wait, or 0 if the request may proceed. */
export function rateLimit(key: string): number {
  return limiter().take(key);
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export type ApiAuth =
  | { ok: true; key: string }
  | { ok: false; status: 401 | 403; error: string };

/** Checks the Bearer token against SENDGATE_API_KEY in constant time. */
export function authorize(headers: Headers): ApiAuth {
  const expected = CONFIG.apiKey;
  if (!expected) {
    return {
      ok: false,
      status: 403,
      error: "API access is disabled on this instance. Set SENDGATE_API_KEY to enable it.",
    };
  }
  const header = headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !timingSafeEqual(digest(token), digest(expected))) {
    return { ok: false, status: 401, error: "Invalid or missing API key." };
  }
  return { ok: true, key: `api:${digest(token).toString("hex").slice(0, 16)}` };
}
