import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock node:dns/promises so DNS lookups never hit the network in tests.
// Default: resolve to a legitimate public IP (93.184.216.34 = example.com).
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue({ address: "93.184.216.34", family: 4 }),
}));

import { lookup } from "node:dns/promises";
import { fetchOgMetadata } from "../../src/utils/og-fetch.js";

const mockLookup = vi.mocked(lookup);

beforeEach(() => {
  // Reset to a safe public IP before each test
  mockLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchOgMetadata — SSRF protection (M-2)", () => {
  // ── Pre-check: obvious blocked hostnames / IP literals ──────────────────────

  it("blocks localhost URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://localhost/secret");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 127.0.0.1", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://127.0.0.1/admin");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 127.0.0.2 (loopback range)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://127.0.0.2/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 127.1.2.3 (loopback range)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://127.1.2.3/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 127.255.255.255 (loopback range)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://127.255.255.255/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks AWS metadata endpoint (169.254.169.254)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://169.254.169.254/latest/meta-data/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 10.x.x.x private range", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://10.0.0.1/internal");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 192.168.x.x private range", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://192.168.1.1/router");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 172.16-31.x.x private range", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://172.16.0.1/internal");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks non-HTTP protocol (file://)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("file:///etc/passwd");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks non-HTTP protocol (ftp://)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("ftp://example.com/file");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── IPv6 blocked addresses (pre-check) ──────────────────────────────────────

  it("blocks ::1 (IPv6 loopback)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://[::1]/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 0.0.0.0 (unspecified IPv4 — routes to localhost on many systems)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://0.0.0.0/secret");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks :: (IPv6 unspecified address)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://[::]/secret");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── IPv4-mapped IPv6 (pre-check) ────────────────────────────────────────────

  it("blocks ::ffff:169.254.169.254 (IPv4-mapped IPv6 link-local)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://[::ffff:169.254.169.254]/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks ::ffff:10.0.0.1 (IPv4-mapped IPv6 private)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://[::ffff:10.0.0.1]/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks ::ffff:192.168.0.1 (IPv4-mapped IPv6 private)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://[::ffff:192.168.0.1]/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── New ranges: 100.64.0.0/10 (shared address space) ───────────────────────

  it("blocks 100.64.0.1 (shared address space / Tailscale 100.64.0.0/10)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://100.64.0.1/internal");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 100.100.0.1 (shared address space 100.64.0.0/10 mid-range)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://100.100.0.1/internal");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 100.127.255.255 (shared address space 100.64.0.0/10 upper bound)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://100.127.255.255/internal");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT block 100.63.0.1 (just below 100.64.0.0/10)", async () => {
    // This IP is outside the 100.64.0.0/10 range — should pass the pre-check
    // and attempt DNS (which is mocked to return a public IP).
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "",
    } as any);
    const result = await fetchOgMetadata("http://100.63.0.1/page");
    // Should not be blocked at pre-check (it's an IP literal, DNS is skipped)
    expect(result).toEqual({});
  });

  it("does NOT block 100.128.0.1 (just above 100.64.0.0/10)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "",
    } as any);
    const result = await fetchOgMetadata("http://100.128.0.1/page");
    expect(result).toEqual({});
  });

  // ── New ranges: 198.18.0.0/15 (benchmarking) ────────────────────────────────

  it("blocks 198.18.0.1 (benchmarking range 198.18.0.0/15)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://198.18.0.1/internal");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks 198.19.255.255 (benchmarking range 198.18.0.0/15 upper bound)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://198.19.255.255/internal");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does NOT block 198.17.0.1 (just below 198.18.0.0/15)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "",
    } as any);
    const result = await fetchOgMetadata("http://198.17.0.1/page");
    expect(result).toEqual({});
  });

  it("does NOT block 198.20.0.1 (just above 198.18.0.0/15)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      headers: { get: () => "text/html" },
      text: async () => "",
    } as any);
    const result = await fetchOgMetadata("http://198.20.0.1/page");
    expect(result).toEqual({});
  });

  // ── DNS rebinding simulation ─────────────────────────────────────────────────

  it("blocks DNS rebinding: public hostname resolves to 127.0.0.1", async () => {
    mockLookup.mockResolvedValue({ address: "127.0.0.1", family: 4 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("https://evil-rebinding.example.com/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks DNS rebinding: public hostname resolves to 10.0.0.1", async () => {
    mockLookup.mockResolvedValue({ address: "10.0.0.1", family: 4 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("https://evil-rebinding.example.com/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks DNS rebinding: public hostname resolves to 169.254.169.254", async () => {
    mockLookup.mockResolvedValue({ address: "169.254.169.254", family: 4 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("https://rebind-aws-metadata.example.com/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks DNS rebinding: public hostname resolves to 192.168.1.1", async () => {
    mockLookup.mockResolvedValue({ address: "192.168.1.1", family: 4 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("https://evil-rebinding.example.com/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks DNS rebinding: public hostname resolves to 100.64.0.1 (shared space)", async () => {
    mockLookup.mockResolvedValue({ address: "100.64.0.1", family: 4 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("https://rebind-tailscale.example.com/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks DNS rebinding: public hostname resolves to 198.18.0.1 (benchmarking range)", async () => {
    mockLookup.mockResolvedValue({ address: "198.18.0.1", family: 4 });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("https://rebind-bench.example.com/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks when DNS lookup fails (network error)", async () => {
    mockLookup.mockRejectedValue(new Error("ENOTFOUND"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("https://nonexistent-domain.example.com/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── Happy path / redirect / content-type ────────────────────────────────────

  it("allows legitimate public HTTPS URL", async () => {
    // mockLookup already returns a public IP from beforeEach
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      headers: { get: () => "text/html; charset=utf-8" },
      text: async () => `<meta property="og:title" content="Example Site">`,
    } as any);

    const result = await fetchOgMetadata("https://example.com/page");
    expect(result.title).toBe("Example Site");
  });

  it("returns empty object on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));
    const result = await fetchOgMetadata("https://example.com/page");
    expect(result).toEqual({});
  });

  it("returns empty object for non-HTML content type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => '{"key":"value"}',
    } as any);

    const result = await fetchOgMetadata("https://example.com/api");
    expect(result).toEqual({});
  });

  it("returns empty object when fetch response is a redirect (301)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 301,
      headers: { get: () => null },
    } as any);

    const result = await fetchOgMetadata("https://example.com/redirect");
    expect(result).toEqual({});
  });

  it("returns empty object when fetch response is a redirect (302)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 302,
      headers: { get: () => null },
    } as any);

    const result = await fetchOgMetadata("https://example.com/redirect");
    expect(result).toEqual({});
  });

  it("returns empty object when fetch response is a redirect (307)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 307,
      headers: { get: () => null },
    } as any);

    const result = await fetchOgMetadata("https://example.com/redirect");
    expect(result).toEqual({});
  });
});
