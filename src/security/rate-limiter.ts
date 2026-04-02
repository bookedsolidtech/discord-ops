/**
 * Client-side sliding window rate limiter.
 * Acts as a first line of defense before Discord's own rate limits.
 */

interface RateLimitBucket {
  timestamps: number[];
}

export class RateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 30, windowSeconds: number = 60) {
    this.maxRequests = maxRequests;
    this.windowMs = windowSeconds * 1000;
  }

  check(bucket: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const entry = this.buckets.get(bucket) ?? { timestamps: [] };

    // Prune expired timestamps
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < this.windowMs);

    if (entry.timestamps.length >= this.maxRequests) {
      const oldestInWindow = entry.timestamps[0]!;
      const retryAfterMs = this.windowMs - (now - oldestInWindow);
      return { allowed: false, retryAfterMs };
    }

    entry.timestamps.push(now);
    this.buckets.set(bucket, entry);
    return { allowed: true };
  }

  stats(): { used: number; limit: number; windowMs: number } {
    const now = Date.now();
    let used = 0;
    for (const entry of this.buckets.values()) {
      used += entry.timestamps.filter((ts) => now - ts < this.windowMs).length;
    }
    return { used, limit: this.maxRequests, windowMs: this.windowMs };
  }

  reset(bucket?: string): void {
    if (bucket) {
      this.buckets.delete(bucket);
    } else {
      this.buckets.clear();
    }
  }
}
