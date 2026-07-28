/**
 * A small fixed-window rate limiter for the one endpoint that costs money.
 *
 * The live app is public and, once a key is configured, that key is somebody
 * else's. Everything else on this endpoint bounds cost per call — small model,
 * 600-token cap, per-account cache — but nothing bounded the *number* of calls a
 * stranger could make. This does.
 *
 * In-memory and therefore per-instance: on serverless the real ceiling is this
 * limit multiplied by the number of warm instances. That is a deliberate
 * trade-off for a prototype — the correct production answer is a shared counter
 * in Redis or the platform's own rate limiting, and it is one function swap. It
 * is still the difference between a bounded bill and an unbounded one.
 */

interface Window {
  count: number;
  resetAt: number;
}

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 10 * 60_000);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX ?? 40);
const MAX_TRACKED_CLIENTS = 5_000;

const windows = new Map<string, Window>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(clientKey: string, now = Date.now()): RateLimitResult {
  // Opportunistic sweep. Without it the map grows for every distinct caller and
  // never shrinks, which is a slow leak in a long-lived process.
  if (windows.size > MAX_TRACKED_CLIENTS) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }

  const existing = windows.get(clientKey);
  if (!existing || existing.resetAt <= now) {
    windows.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS - existing.count, retryAfterSeconds: 0 };
}

/**
 * Identify the caller. Behind Vercel the client address is in `x-forwarded-for`;
 * the first entry is the original client. Falls back to a single shared bucket
 * rather than to "unlimited" when no header is present.
 */
export function clientKeyFrom(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown-client';
}

/** Test seam. */
export function resetRateLimits() {
  windows.clear();
}
