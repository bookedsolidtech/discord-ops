import { describe, it, expect } from "vitest";
import { RateLimiter } from "../../src/security/rate-limiter.js";

describe("RateLimiter", () => {
  it("allows requests within limit", () => {
    const limiter = new RateLimiter(5, 60);
    for (let i = 0; i < 5; i++) {
      expect(limiter.check("test").allowed).toBe(true);
    }
  });

  it("blocks requests over limit", () => {
    const limiter = new RateLimiter(3, 60);
    limiter.check("test");
    limiter.check("test");
    limiter.check("test");
    const result = limiter.check("test");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks buckets independently", () => {
    const limiter = new RateLimiter(1, 60);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });

  it("resets specific bucket", () => {
    const limiter = new RateLimiter(1, 60);
    limiter.check("test");
    limiter.reset("test");
    expect(limiter.check("test").allowed).toBe(true);
  });

  it("stats() returns 0 when no requests made", () => {
    const limiter = new RateLimiter(5, 60);
    const s = limiter.stats();
    expect(s.used).toBe(0);
    expect(s.limit).toBe(5);
    expect(s.windowMs).toBe(60_000);
  });

  it("stats() used reflects the most-loaded bucket, not the sum", () => {
    const limiter = new RateLimiter(10, 60);
    limiter.check("tool_a");
    limiter.check("tool_a");
    limiter.check("tool_a"); // 3 in tool_a
    limiter.check("tool_b");
    limiter.check("tool_b"); // 2 in tool_b
    const s = limiter.stats();
    expect(s.used).toBe(3); // max, not sum (5)
    expect(s.limit).toBe(10);
  });

  it("stats() used/limit is a meaningful per-bucket ratio", () => {
    const limiter = new RateLimiter(5, 60);
    limiter.check("x");
    limiter.check("x");
    limiter.check("x"); // 3/5 on bucket "x"
    limiter.check("y"); // 1/5 on bucket "y"
    const s = limiter.stats();
    expect(s.used).toBe(3);
    expect(s.limit).toBe(5);
  });
});
