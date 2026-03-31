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
});
