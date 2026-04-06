import { describe, it, expect } from "vitest";
import * as http from "node:http";
import { startHttpTransport } from "../../src/transport/http.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function makeMockServer(): McpServer {
  return { connect: async () => {} } as unknown as McpServer;
}

function request(
  port: number,
  method: string,
  path: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "localhost", port, path, method, headers }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("HTTP transport auth", () => {
  it("allows requests when no auth token is configured", async () => {
    const port = 19820;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const res = await request(port, "GET", "/health");
    expect(res.status).toBe(200);
  });

  it("returns 401 when Authorization header is missing", async () => {
    const port = 19821;
    await startHttpTransport(makeMockServer(), { port, authToken: "test-token" });
    const res = await request(port, "GET", "/sse");
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toBe("Missing Authorization header");
  });

  it("returns 401 for non-Bearer scheme", async () => {
    const port = 19822;
    await startHttpTransport(makeMockServer(), { port, authToken: "test-token" });
    const res = await request(port, "GET", "/sse", { Authorization: "Basic dXNlcjpwYXNz" });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toBe("Authorization must use Bearer scheme");
  });

  it("returns 401 for invalid bearer token", async () => {
    const port = 19823;
    await startHttpTransport(makeMockServer(), { port, authToken: "correct-token" });
    const res = await request(port, "GET", "/sse", { Authorization: "Bearer wrong-token" });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toBe("Invalid token");
  });

  it("returns 401 for Bearer with no value", async () => {
    const port = 19824;
    await startHttpTransport(makeMockServer(), { port, authToken: "test-token" });
    const res = await request(port, "GET", "/sse", { Authorization: "Bearer" });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toBe("Authorization must use Bearer scheme");
  });
});

describe("HTTP transport routes", () => {
  it("returns 404 for unknown paths", async () => {
    const port = 19825;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const res = await request(port, "GET", "/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body).toBe("Not found");
  });

  it("returns 400 for POST /messages without sessionId", async () => {
    const port = 19826;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const res = await request(port, "POST", "/messages");
    expect(res.status).toBe(400);
    expect(res.body).toBe("Missing sessionId query parameter");
  });

  it("returns 404 for POST /messages with unknown sessionId", async () => {
    const port = 19827;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const res = await request(port, "POST", "/messages?sessionId=nonexistent");
    expect(res.status).toBe(404);
    expect(res.body).toBe("Unknown session");
  });

  it("returns 404 for wrong HTTP method on known paths", async () => {
    const port = 19828;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });
    const res = await request(port, "DELETE", "/health");
    expect(res.status).toBe(404);
    expect(res.body).toBe("Not found");
  });
});

describe("HTTP transport rate limiting", () => {
  it("returns 429 after exceeding rate limit", async () => {
    const port = 19829;
    await startHttpTransport(makeMockServer(), { port, allowUnauthenticated: true });

    // Send 121 requests (limit is 120)
    const promises: Promise<{ status: number }>[] = [];
    for (let i = 0; i < 121; i++) {
      promises.push(request(port, "GET", "/health"));
    }
    const results = await Promise.all(promises);
    const statuses = results.map((r) => r.status);
    expect(statuses).toContain(429);
  });
});
