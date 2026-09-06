import type { NextApiRequest } from "next";

type Bucket = { count: number; resetAt: number };

// In-memory sliding-window limiters. Dev-appropriate: state resets on restart
// or serverless cold starts. Swappable for Upstash Redis (already a dependency)
// if persistent, multi-instance limiting is needed later.
const buckets = new Map<string, Bucket>();

export type RateLimitResult = { ok: boolean; remaining: number; retryAfter?: number };

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  if (buckets.size > 10_000) {
    const now = Date.now();
    for (const [candidate, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(candidate);
  }
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count };
}

export const clientIp = (req: NextApiRequest): string => {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return ip || req.socket?.remoteAddress || "unknown";
};