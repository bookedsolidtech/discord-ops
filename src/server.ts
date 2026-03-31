import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { allTools } from "./tools/index.js";
import type { ToolContext } from "./tools/types.js";
import { sanitizeError } from "./security/sanitizer.js";
import { auditToolCall } from "./security/audit.js";
import { logger } from "./utils/logger.js";

/**
 * Extract the raw shape from a ZodObject for MCP SDK registration.
 * The SDK expects Record<string, ZodType> (the shape), not the ZodObject itself.
 */
function getZodShape(schema: z.ZodType): Record<string, z.ZodType> | undefined {
  const def = (schema as any)._def;
  if (def?.typeName === "ZodObject") {
    return def.shape();
  }
  return undefined;
}

export function createServer(ctx: ToolContext): McpServer {
  const server = new McpServer({
    name: "discord-ops",
    version: "0.1.0",
  });

  for (const tool of allTools) {
    const shape = getZodShape(tool.inputSchema);

    const callback = async (params: Record<string, unknown>) => {
      const start = Date.now();
      try {
        const parsed = tool.inputSchema.parse(params);
        const result = await tool.handle(parsed, ctx);

        auditToolCall({
          tool: tool.name,
          params,
          durationMs: Date.now() - start,
          success: !result.isError,
          error: result.isError ? result.content[0]?.text : undefined,
        });

        return result;
      } catch (err) {
        const sanitized = sanitizeError(err);

        auditToolCall({
          tool: tool.name,
          params,
          durationMs: Date.now() - start,
          success: false,
          error: sanitized,
        });

        logger.error(`Tool ${tool.name} failed`, { error: sanitized });

        return {
          content: [{ type: "text" as const, text: sanitized }],
          isError: true,
        };
      }
    };

    if (shape) {
      server.tool(tool.name, tool.description, shape, callback as any);
    } else {
      server.tool(tool.name, tool.description, callback as any);
    }
  }

  logger.info(`Registered ${allTools.length} tools`);
  return server;
}
