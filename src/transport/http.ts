import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerMeta } from "../server.js";
import { logger } from "../utils/logger.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export interface HttpTransportOptions {
  port?: number;
  /** Bearer token required for all requests. Read from DISCORD_OPS_HTTP_TOKEN env if not set. */
  authToken?: string;
}

function checkAuth(
  req: IncomingMessage,
  token: string | undefined,
): { authorized: boolean; error?: string } {
  if (!token) return { authorized: true }; // no token configured = open (localhost dev)

  const header = req.headers.authorization;
  if (!header) return { authorized: false, error: "Missing Authorization header" };

  const [scheme, value] = header.split(" ", 2);
  if (scheme !== "Bearer" || !value) {
    return { authorized: false, error: "Authorization must use Bearer scheme" };
  }

  // Constant-time comparison to prevent timing attacks
  if (value.length !== token.length) return { authorized: false, error: "Invalid token" };
  let mismatch = 0;
  for (let i = 0; i < value.length; i++) {
    mismatch |= value.charCodeAt(i) ^ token.charCodeAt(i);
  }
  if (mismatch !== 0) return { authorized: false, error: "Invalid token" };

  return { authorized: true };
}

export async function startHttpTransport(
  server: McpServer,
  meta: ServerMeta,
  options: HttpTransportOptions = {},
): Promise<void> {
  const port = options.port ?? 3000;
  const authToken = options.authToken ?? process.env.DISCORD_OPS_HTTP_TOKEN;

  if (!authToken) {
    logger.warn(
      "HTTP transport running WITHOUT authentication. Set DISCORD_OPS_HTTP_TOKEN to require bearer auth.",
    );
  }

  // Track active transports by session ID for message routing
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Handle CORS preflight (no auth required)
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    // Apply CORS headers to all responses
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      res.setHeader(key, value);
    }

    // Health endpoint is exempt from auth (for load balancers / probes)
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      const startMs = new Date(meta.startedAt).getTime();
      const uptimeSeconds = Math.floor((Date.now() - startMs) / 1000);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          version: meta.version,
          uptime: uptimeSeconds,
          toolProfile: meta.profileName,
          toolCount: meta.toolCount,
          totalTools: meta.totalTools,
          sessions: transports.size,
          rateLimiter: {
            standard: meta.standardLimiter.stats(),
            destructive: meta.destructiveLimiter.stats(),
          },
        }),
      );
      return;
    }

    // Authenticate all other endpoints
    const auth = checkAuth(req, authToken);
    if (!auth.authorized) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: auth.error }));
      return;
    }

    // SSE connection endpoint — client GETs this to open the stream
    if (req.method === "GET" && url.pathname === "/sse") {
      logger.info("SSE client connected");

      const transport = new SSEServerTransport("/messages", res);
      transports.set(transport.sessionId, transport);

      transport.onclose = () => {
        logger.info("SSE client disconnected", { sessionId: transport.sessionId });
        transports.delete(transport.sessionId);
      };

      await server.connect(transport);
      return;
    }

    // Message endpoint — client POSTs JSON-RPC messages here
    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        res.writeHead(400).end("Missing sessionId query parameter");
        return;
      }

      const transport = transports.get(sessionId);
      if (!transport) {
        res.writeHead(404).end("Unknown session");
        return;
      }

      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404).end("Not found");
  });

  // Graceful shutdown helper
  const shutdown = () => {
    logger.info("Shutting down HTTP transport...");
    for (const transport of transports.values()) {
      transport.close().catch(() => {});
    }
    transports.clear();
    httpServer.close();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      logger.info(`MCP server started on HTTP transport`, { port });
      logger.info(`  SSE endpoint:     http://localhost:${port}/sse`);
      logger.info(`  Message endpoint: http://localhost:${port}/messages`);
      logger.info(`  Health endpoint:  http://localhost:${port}/health`);
      resolve();
    });
  });
}
