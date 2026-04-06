import { describe, it, expect } from "vitest";
import * as http from "node:http";
import { startHttpTransport } from "../../src/transport/http.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function makeMockServer(): McpServer {
  return { connect: async () => {} } as unknown as McpServer;
}

function getHeaderFromPort(port: number, path = "/health"): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://localhost:${port}${path}`, (res) => {
        resolve(res.headers["access-control-allow-origin"]);
        res.resume();
      })
      .on("error", reject);
  });
}

describe("HTTP transport CORS origin", () => {
  it("defaults to http://localhost when no allowedOrigin is set", async () => {
    const port = 19800;
    await startHttpTransport(makeMockServer(), { port });
    const origin = await getHeaderFromPort(port);
    expect(origin).toBe("http://localhost");
  });

  it("uses a custom allowedOrigin when specified", async () => {
    const port = 19801;
    await startHttpTransport(makeMockServer(), {
      port,
      allowedOrigin: "https://my-app.example.com",
    });
    const origin = await getHeaderFromPort(port);
    expect(origin).toBe("https://my-app.example.com");
  });

  it("does NOT use wildcard * by default", async () => {
    const port = 19802;
    await startHttpTransport(makeMockServer(), { port });
    const origin = await getHeaderFromPort(port);
    expect(origin).not.toBe("*");
  });
});
