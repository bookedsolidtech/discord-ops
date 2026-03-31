import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { logger } from "../utils/logger.js";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export interface HttpTransportOptions {
  port?: number;
}

export async function startHttpTransport(
  server: McpServer,
  options: HttpTransportOptions = {},
): Promise<void> {
  const port = options.port ?? 3000;

  // Track active transports by session ID for message routing
  const transports = new Map<string, SSEServerTransport>();

  const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    // Apply CORS headers to all responses
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      res.setHeader(key, value);
    }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

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

    // Health probe
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", sessions: transports.size }));
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
