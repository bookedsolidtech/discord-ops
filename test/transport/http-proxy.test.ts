import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import { getClientIp } from "../../src/transport/http.js";

function makeReq(remoteAddress: string, xForwardedFor?: string): IncomingMessage {
  return {
    socket: { remoteAddress },
    headers: xForwardedFor ? { "x-forwarded-for": xForwardedFor } : {},
  } as unknown as IncomingMessage;
}

describe("getClientIp", () => {
  describe("trustProxy: false (default)", () => {
    it("returns remoteAddress regardless of X-Forwarded-For", () => {
      const req = makeReq("1.2.3.4", "5.6.7.8, 9.10.11.12");
      expect(getClientIp(req, false)).toBe("1.2.3.4");
    });

    it("returns remoteAddress when no X-Forwarded-For header", () => {
      const req = makeReq("1.2.3.4");
      expect(getClientIp(req, false)).toBe("1.2.3.4");
    });

    it("ignores forged X-Forwarded-For when trustProxy is false", () => {
      const req = makeReq("10.0.0.1", "8.8.8.8");
      expect(getClientIp(req, false)).toBe("10.0.0.1");
    });
  });

  describe("trustProxy: true", () => {
    it("returns leftmost non-private IP from X-Forwarded-For", () => {
      const req = makeReq("10.0.0.1", "203.0.113.5, 10.0.0.1");
      expect(getClientIp(req, true)).toBe("203.0.113.5");
    });

    it("skips private IPs in X-Forwarded-For to find real client", () => {
      const req = makeReq("10.0.0.2", "192.168.1.1, 203.0.113.10, 10.0.0.2");
      expect(getClientIp(req, true)).toBe("203.0.113.10");
    });

    it("falls back to remoteAddress when all X-Forwarded-For IPs are private", () => {
      const req = makeReq("10.0.0.1", "192.168.1.1, 172.16.0.1");
      expect(getClientIp(req, true)).toBe("10.0.0.1");
    });

    it("falls back to remoteAddress when X-Forwarded-For is absent", () => {
      const req = makeReq("203.0.113.5");
      expect(getClientIp(req, true)).toBe("203.0.113.5");
    });

    it("handles single IP in X-Forwarded-For", () => {
      const req = makeReq("10.0.0.1", "203.0.113.99");
      expect(getClientIp(req, true)).toBe("203.0.113.99");
    });

    it("filters 127.x loopback addresses", () => {
      const req = makeReq("10.0.0.1", "127.0.0.1, 203.0.113.1");
      expect(getClientIp(req, true)).toBe("203.0.113.1");
    });

    it("filters IPv4-mapped IPv6 addresses", () => {
      const req = makeReq("10.0.0.1", "::ffff:192.168.1.1, 203.0.113.2");
      expect(getClientIp(req, true)).toBe("203.0.113.2");
    });

    it("filters IPv6 loopback ::1", () => {
      const req = makeReq("10.0.0.1", "::1, 203.0.113.3");
      expect(getClientIp(req, true)).toBe("203.0.113.3");
    });

    it("returns unknown when remoteAddress is undefined and no valid header", () => {
      const req = {
        socket: { remoteAddress: undefined },
        headers: {},
      } as unknown as IncomingMessage;
      expect(getClientIp(req, true)).toBe("unknown");
    });
  });
});
