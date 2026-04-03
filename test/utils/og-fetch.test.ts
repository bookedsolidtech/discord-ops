import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchOgMetadata } from "../../src/utils/og-fetch.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchOgMetadata — SSRF protection (M-2)", () => {
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

  it("allows legitimate public HTTPS URL", async () => {
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

  // Issue 1 — redirect blocking
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

  // Issue 2 — full 127.0.0.0/8 loopback range
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

  // Issue 3 — IPv4-mapped IPv6
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

  // IPv6 loopback ::1
  it("blocks ::1 (IPv6 loopback)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await fetchOgMetadata("http://[::1]/");
    expect(result).toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Unspecified addresses
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
});
