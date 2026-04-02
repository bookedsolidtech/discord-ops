import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { allTools } from "./tools/index.js";
import type { ToolContext } from "./tools/types.js";
import { sanitizeError } from "./security/sanitizer.js";
import { auditToolCall } from "./security/audit.js";
import { RateLimiter } from "./security/rate-limiter.js";
import { checkPermissions } from "./security/permissions.js";
import { filterTools } from "./profiles/index.js";
import { logger } from "./utils/logger.js";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../package.json") as { version: string };

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

export interface ServerOptions {
  dryRun?: boolean;
  profile?: string;
  tools?: string[];
  profileAdd?: string[];
  profileRemove?: string[];
}

export interface ServerMeta {
  version: string;
  toolCount: number;
  totalTools: number;
  profileName: string;
  startedAt: string;
  standardLimiter: RateLimiter;
  destructiveLimiter: RateLimiter;
}

export interface CreateServerResult {
  server: McpServer;
  meta: ServerMeta;
}

function isDryRunEnabled(options?: ServerOptions): boolean {
  if (options?.dryRun) return true;
  return !!(process.env.DISCORD_OPS_DRY_RUN || process.env.DRY_RUN);
}

export function createServer(ctx: ToolContext, options?: ServerOptions): CreateServerResult {
  const dryRun = isDryRunEnabled(options);

  if (dryRun) {
    logger.warn("Dry-run mode active — destructive tools will simulate execution");
  }

  // Filter tools by profile/explicit list, with optional add/remove overrides
  const tools = filterTools(allTools, {
    profile: options?.profile,
    tools: options?.tools,
    add: options?.profileAdd,
    remove: options?.profileRemove,
  });

  const profileName = options?.tools?.length ? "custom" : (options?.profile ?? "full");

  const destructiveLimiter = new RateLimiter(10, 60);
  const standardLimiter = new RateLimiter(30, 60);

  const server = new McpServer({
    name: "discord-ops",
    version: PKG_VERSION,
  });

  for (const tool of tools) {
    const shape = getZodShape(tool.inputSchema);

    const callback = async (params: Record<string, unknown>) => {
      const start = Date.now();
      try {
        // Rate limiting — tighter for destructive ops
        const limiter = tool.destructive ? destructiveLimiter : standardLimiter;
        const rateCheck = limiter.check(tool.name);
        if (!rateCheck.allowed) {
          const retryAfter = Math.ceil((rateCheck.retryAfterMs ?? 1000) / 1000);
          return {
            content: [
              {
                type: "text" as const,
                text: `Rate limited on ${tool.name}. Retry after ${retryAfter}s.`,
              },
            ],
            isError: true,
          };
        }

        const parsed = tool.inputSchema.parse(params);

        // Permission pre-flight — check bot has required perms before calling Discord API
        if (tool.permissions?.length && tool.requiresGuild && parsed.guild_id) {
          try {
            const token = parsed.project
              ? (await import("./config/index.js")).getTokenForProject(parsed.project, ctx.config)
              : undefined;
            const guild = await ctx.discord.getGuild(parsed.guild_id, token);
            const botMember = await guild.members.fetchMe();
            const permCheck = checkPermissions(botMember, tool.permissions);
            if (!permCheck.allowed) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Bot lacks required permissions: ${permCheck.missing.join(", ")}`,
                  },
                ],
                isError: true,
              };
            }
          } catch {
            // If we can't check perms (e.g. guild not cached yet), let the tool try and fail naturally
          }
        }

        // Dry-run intercept — skip Discord API calls for destructive tools
        if (dryRun && tool.destructive) {
          const simulated = {
            dryRun: true,
            tool: tool.name,
            action: "simulated",
            params: parsed,
            message: `[DRY RUN] Would execute ${tool.name} — no changes made`,
          };

          auditToolCall({
            tool: tool.name,
            params,
            durationMs: Date.now() - start,
            success: true,
            error: undefined,
          });

          return {
            content: [{ type: "text" as const, text: JSON.stringify(simulated, null, 2) }],
          };
        }

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

  logger.info(`Registered ${tools.length}/${allTools.length} tools (profile: ${profileName})`);

  const meta: ServerMeta = {
    version: PKG_VERSION,
    toolCount: tools.length,
    totalTools: allTools.length,
    profileName,
    startedAt: new Date().toISOString(),
    standardLimiter,
    destructiveLimiter,
  };

  return { server, meta };
}
