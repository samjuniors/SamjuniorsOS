/**
 * Server Security: Edge-Compatible Sliding Window Rate Limiter
 *
 * Implements deterministic in-memory request quota tracking with:
 *  - IETF standard RateLimit-* headers (Limit, Remaining, Reset)
 *  - Configurable policies per route sensitivity
 *  - Automatic TTL eviction & memory bounds to prevent state exhaustion DoS
 *  - Deterministic reset hooks for unit & integration testing
 */

export interface RateLimitPolicy {
  /** Window duration in milliseconds */
  windowMs: number;
  /** Maximum requests admitted within windowMs */
  maxRequests: number;
}

export interface RateLimitResult {
  /** Whether the request is permitted */
  allowed: boolean;
  /** Maximum quota in the active window */
  limit: number;
  /** Remaining quota in the active window */
  remaining: number;
  /** Seconds until quota resets */
  resetSeconds: number;
}

export const RATE_LIMIT_POLICIES = {
  /** Standard API routes: 120 requests per 60s window (2 req/s average) */
  STANDARD_API: {
    windowMs: 60_000,
    maxRequests: 120,
  } as RateLimitPolicy,

  /** Sensitive / Executive routes: 60 requests per 60s window (1 req/s average) */
  EXECUTIVE_API: {
    windowMs: 60_000,
    maxRequests: 60,
  } as RateLimitPolicy,

  /** Machine cron / Scheduler heartbeat: 600 requests per 60s window */
  CRON_MACHINE: {
    windowMs: 60_000,
    maxRequests: 600,
  } as RateLimitPolicy,
};

export class MemoryRateLimiter {
  private buckets = new Map<string, number[]>();
  private readonly maxBuckets: number;
  private lastCleanup = Date.now();
  private readonly cleanupIntervalMs = 60_000;

  constructor(maxBuckets = 10_000) {
    this.maxBuckets = maxBuckets;
  }

  /**
   * Check whether a client request is admitted under the specified policy.
   * Employs sliding-window timestamp tracking.
   */
  check(key: string, policy: RateLimitPolicy, now = Date.now()): RateLimitResult {
    this.maybeCleanup(now);

    const windowStart = now - policy.windowMs;
    const history = this.buckets.get(key) || [];
    const active = history.filter((t) => t > windowStart);

    if (active.length >= policy.maxRequests) {
      const oldestInWindow = active[0] || windowStart;
      const resetSeconds = Math.max(1, Math.ceil((oldestInWindow + policy.windowMs - now) / 1000));
      return {
        allowed: false,
        limit: policy.maxRequests,
        remaining: 0,
        resetSeconds,
      };
    }

    active.push(now);
    this.buckets.set(key, active);

    const oldestInWindow = active[0] || now;
    const resetSeconds = Math.max(1, Math.ceil((oldestInWindow + policy.windowMs - now) / 1000));
    return {
      allowed: true,
      limit: policy.maxRequests,
      remaining: Math.max(0, policy.maxRequests - active.length),
      resetSeconds,
    };
  }

  /**
   * Periodically purge expired buckets and enforce hard capacity limits.
   */
  private maybeCleanup(now: number) {
    if (now - this.lastCleanup < this.cleanupIntervalMs && this.buckets.size < this.maxBuckets) {
      return;
    }
    this.lastCleanup = now;

    const maxAge = 120_000; // 2 minutes
    for (const [key, timestamps] of this.buckets.entries()) {
      const recent = timestamps.filter((t) => t > now - maxAge);
      if (recent.length === 0) {
        this.buckets.delete(key);
      } else {
        this.buckets.set(key, recent);
      }
    }

    // Hard ceiling eviction if attacked with distinct keys
    if (this.buckets.size > this.maxBuckets) {
      const excess = this.buckets.size - this.maxBuckets;
      const keysToDelete = Array.from(this.buckets.keys()).slice(0, excess);
      for (const k of keysToDelete) {
        this.buckets.delete(k);
      }
    }
  }

  /**
   * Reset all bucket state (for testing isolation).
   */
  reset(): void {
    this.buckets.clear();
    this.lastCleanup = Date.now();
  }

  /**
   * Get active tracked keys count (for metrics and test assertion).
   */
  getBucketCount(): number {
    return this.buckets.size;
  }
}

/** Global singleton instance for middleware consumption */
export const globalRateLimiter = new MemoryRateLimiter();

/**
 * Extract a stable client identifier for rate-limiting.
 * Respects standard reverse-proxy headers in order of precedence.
 */
export function getClientIdentifier(req: { headers: { get: (name: string) => string | null } }): string {
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp.trim();

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "127.0.0.1";
}
