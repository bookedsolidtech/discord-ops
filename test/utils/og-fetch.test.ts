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
      headers: { get: () => "text/html; charset=utf-8" },
      text: async () =>
        `<meta property="og:title" content="Example Site">`,
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
      headers: { get: () => "application/json" },
      text: async () => '{"key":"value"}',
    } as any);

    const result = await fetchOgMetadata("https://example.com/api");
    expect(result).toEqual({});
  });
});
