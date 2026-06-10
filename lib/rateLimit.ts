/**
 * In-memory sliding-window rate limiter, keyed per IP per route.
 *
 * This protects a single long-running Node process. On serverless platforms
 * with multiple instances, each instance enforces its own limit — it raises
 * the cost of abuse but isn't a hard global cap. Swap for Upstash Redis
 * (or similar shared store) if/when that's available.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so the map doesn't grow unbounded.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const key of Array.from(buckets.keys())) {
    const bucket = buckets.get(key)!;
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60_000);
cleanup.unref?.();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export function rateLimit(key: string, limit: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + WINDOW_MS;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, limit };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt, limit };
  }

  bucket.count++;
  return {
    allowed: true,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
    limit,
  };
}

/** Best-effort client IP extraction behind a proxy/load balancer. */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unknown";
}

export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return Response.json(
    { error: "Too many requests. Please wait a moment and try again." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
