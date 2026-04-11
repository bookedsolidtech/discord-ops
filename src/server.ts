import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { allTools } from "./tools/index.js";
import type { ToolContext } from "./tools/types.js";
import { sanitizeError } from "./security/sanitizer.js";
import { auditToolCall } from "./security/audit.js";
import { RateLimiter } from "./security/rate-limiter.js";
import { checkPermissions } from "./security/permissions.js";
import {
  filterTools,
  validateProfileToolNames,
  PROFILES,
  isProfileName,
} from "./profiles/index.js";
import { logger } from "./utils/logger.js";
import { getTokenForProject, getBotPersona } from "./config/index.js";
import { resolveProject } from "./config/profiles.js";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../package.json") as { version: string };

/**
 * Extract the raw shape from a ZodObject for MCP SDK registration.
 * The SDK expects Record<string, ZodType> (the shape), not the ZodObject itself.
 */
function getZodShape(schema: z.ZodType): Record<string, z.ZodType> | undefined {
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodType>;
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

  // Validate profile tool names against actual tool registry (catches stale entries).
  // Guard: only validate when the full tool registry is loaded (not in test harnesses
  // that mock allTools with a small synthetic subset).
  if (allTools.length >= 10) {
    validateProfileToolNames(new Set(allTools.map((t) => t.name)));
  }

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
        // Include project in rate limit key for per-context isolation.
        // Use raw params.project (pre-validation) since this only needs a string key.
        const project = typeof params.project === "string" ? params.project : undefined;
        const rateLimitKey = project ? `${project}:${tool.name}` : tool.name;
        const rateCheck = limiter.check(rateLimitKey);
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

        // Per-project/per-bot tool profile enforcement — runtime gate
        if (typeof parsed.project === "string") {
          const resolvedProj = resolveProject(
            parsed.project,
            ctx.config.global,
            ctx.config.perProject,
          );
          if (resolvedProj) {
            // Determine effective profile: project tool_profile, or bot's default_profile
            let effectiveProfile = resolvedProj.toolProfile;
            let effectiveAdd = resolvedProj.toolProfileAdd;
            let effectiveRemove = resolvedProj.toolProfileRemove;

            if (!effectiveProfile) {
              const channelAlias = typeof parsed.channel === "string" ? parsed.channel : undefined;
              const persona = getBotPersona(parsed.project, channelAlias, ctx.config);
              if (persona) {
                effectiveProfile = persona.default_profile;
                if (!effectiveAdd) effectiveAdd = persona.profile_add;
                if (!effectiveRemove) effectiveRemove = persona.profile_remove;
              }
            }

            if (effectiveProfile && isProfileName(effectiveProfile)) {
              const profileTools = PROFILES[effectiveProfile];
              if (profileTools !== "all") {
                const allowed = new Set(profileTools);
                // Apply add/remove overrides
                if (effectiveAdd) {
                  for (const name of effectiveAdd) allowed.add(name);
                }
                if (effectiveRemove) {
                  for (const name of effectiveRemove) allowed.delete(name);
                }
                if (!allowed.has(tool.name)) {
                  return {
                    content: [
                      {
                        type: "text" as const,
                        text: `Tool "${tool.name}" is not allowed by the "${effectiveProfile}" profile for project "${parsed.project}"`,
                      },
                    ],
                    isError: true,
                  };
                }
              }
            }
          }
        }

        // Permission pre-flight — check bot has required perms before calling Discord API.
        // Resolves guild from guild_id (guild tools) or channel_id (channel tools).
        if (tool.permissions?.length && tool.requiresGuild) {
          try {
            const token = parsed.project
              ? getTokenForProject(parsed.project, ctx.config)
              : undefined;
            let guild;
            if (parsed.guild_id) {
              guild = await ctx.discord.getGuild(parsed.guild_id as string, token);
            } else if (parsed.channel_id) {
              const ch = await ctx.discord.getAnyChannel(parsed.channel_id as string, token);
              guild = await ctx.discord.getGuild(ch.guild.id, token);
            }
            if (guild) {
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
            }
          } catch (err) {
            // Permission pre-flight is best-effort — log and let the tool handle auth errors
            logger.debug("Permission pre-flight skipped", {
              tool: tool.name,
              error: err instanceof Error ? err.message : String(err),
            });
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

    // ToolResult is structurally compatible with the SDK callback return type;
    // the cast is intentional (see src/tools/types.ts lines 37-43).
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
  };

  return { server, meta };
}
