import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../utils/logger.js";

const DEFAULT_ALLOWED_ORIGIN = "http://localhost";

function buildCorsHeaders(allowedOrigin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export interface HttpTransportOptions {
  port?: number;
  /** Bearer token required for all requests. Read from DISCORD_OPS_HTTP_TOKEN env if not set. */
  authToken?: string;
  /** Allowed CORS origin. Defaults to "http://localhost". Set to "*" to allow all origins (not recommended). */
  allowedOrigin?: string;
  /**
   * Allow the server to start without any auth token configured.
   * Must be explicitly set to true — the default is to refuse startup when no token is present.
   */
  allowUnauthenticated?: boolean;
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

  // Hash both values to fixed-length buffers before comparing.
  // This eliminates the length oracle (early return on length mismatch) and
  // delegates to Node's constant-time crypto.timingSafeEqual.
  const hashValue = createHash("sha256").update(value).digest();
  const hashToken = createHash("sha256").update(token).digest();
  if (!timingSafeEqual(hashValue, hashToken)) {
    return { authorized: false, error: "Invalid token" };
  }

  return { authorized: true };
}

// Per-IP sliding-window rate limiter for HTTP transport.
// Prevents a single client from exhausting the shared MCP tool rate limits.
interface IpBucket {
  count: number;
  resetAt: number;
}

const IP_WINDOW_MS = 60_000;
const IP_MAX_REQUESTS = 120; // generous enough for legitimate use (~2 req/s)

function checkIpRateLimit(ipCounters: Map<string, IpBucket>, ip: string): { allowed: boolean } {
  const now = Date.now();
  const bucket = ipCounters.get(ip);
  if (!bucket || now > bucket.resetAt) {
    ipCounters.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return { allowed: true };
  }
  bucket.count++;
  return { allowed: bucket.count <= IP_MAX_REQUESTS };
}

export async function startHttpTransport(
  server: McpServer,
  options: HttpTransportOptions = {},
): Promise<void> {
  const port = options.port ?? 3000;
  const authToken = options.authToken ?? process.env.DISCORD_OPS_HTTP_TOKEN;
  const allowedOrigin = options.allowedOrigin ?? DEFAULT_ALLOWED_ORIGIN;
  const corsHeaders = buildCorsHeaders(allowedOrigin);

  if (!authToken) {
    if (!options.allowUnauthenticated) {
      // Refuse to start: unauthenticated HTTP exposes full bot capabilities.
      // Operator must either set DISCORD_OPS_HTTP_TOKEN or pass --allow-unauthenticated.
      console.error(
        "ERROR: HTTP transport requires an auth token. " +
          "Set the DISCORD_OPS_HTTP_TOKEN environment variable, " +
          "or pass --allow-unauthenticated to explicitly opt in to unauthenticated access.",
      );
      process.exit(1);
    }

    logger.warn(
      "HTTP transport running WITHOUT authentication (--allow-unauthenticated). " +
        "Set DISCORD_OPS_HTTP_TOKEN to require bearer auth.",
    );
  }

  // Track active transports by session ID for message routing
  const transports = new Map<string, SSEServerTransport>();
  const ipCounters = new Map<string, IpBucket>();

  // Prune expired IP buckets periodically to prevent unbounded map growth
  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, bucket] of ipCounters) {
      if (now > bucket.resetAt) ipCounters.delete(ip);
    }
  }, IP_WINDOW_MS);
  pruneInterval.unref(); // don't keep the process alive for cleanup alone

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Handle CORS preflight (no auth required)
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }

    // Apply CORS headers to all responses
    for (const [key, value] of Object.entries(corsHeaders)) {
      res.setHeader(key, value);
    }

    // Per-IP rate limiting — applied before auth to protect against enumeration
    const ip = req.socket.remoteAddress ?? "unknown";
    if (!checkIpRateLimit(ipCounters, ip).allowed) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many requests" }));
      return;
    }

    // Health endpoint — intentionally auth-exempt for load balancers / probes.
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
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
    clearInterval(pruneInterval);
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
