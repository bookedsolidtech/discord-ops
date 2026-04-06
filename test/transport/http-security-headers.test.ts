import { describe, it, expect } from "vitest";
import * as http from "node:http";
import { startHttpTransport } from "../../src/transport/http.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function makeMockServer(): McpServer {
  return { connect: async () => {} } as unknown as McpServer;
}

function getHeaders(
  port: number,
  path = "/health",
  method = "GET",
): Promise<http.IncomingHttpHeaders> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "localhost", port, path, method }, (res) => {
      resolve(res.headers);
      res.resume();
    });
    req.on("error", reject);
    req.end();
  });
}

describe("HTTP transport security headers", () => {
  it("sets X-Content-Type-Options: nosniff on /health", async () => {
    const port = 19810;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const headers = await getHeaders(port, "/health");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY on /health", async () => {
    const port = 19811;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const headers = await getHeaders(port, "/health");
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  it("sets Content-Security-Policy: default-src 'none' on /health", async () => {
    const port = 19812;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const headers = await getHeaders(port, "/health");
    expect(headers["content-security-policy"]).toBe("default-src 'none'");
  });

  it("sets Referrer-Policy: no-referrer on /health", async () => {
    const port = 19813;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const headers = await getHeaders(port, "/health");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });

  it("omits security headers on OPTIONS preflight", async () => {
    const port = 19814;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const headers = await getHeaders(port, "/sse", "OPTIONS");
    expect(headers["x-content-type-options"]).toBeUndefined();
    expect(headers["x-frame-options"]).toBeUndefined();
    expect(headers["content-security-policy"]).toBeUndefined();
    expect(headers["referrer-policy"]).toBeUndefined();
  });

  it("sets all four security headers on /sse (unauthenticated gets 401 but still has headers)", async () => {
    const port = 19815;
    await startHttpTransport(makeMockServer(), { port, authToken: "secret" });
    const headers = await getHeaders(port, "/sse");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toBe("default-src 'none'");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });

  it("sets all four security headers on /messages (unauthenticated gets 401 but still has headers)", async () => {
    const port = 19816;
    await startHttpTransport(makeMockServer(), { port, authToken: "secret" });
    const headers = await getHeaders(port, "/messages", "POST");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toBe("default-src 'none'");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });
});
