import { z } from "zod";
import { AuditLogEvent } from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const auditLogEventNames = Object.keys(AuditLogEvent).filter((k) => isNaN(Number(k)));

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  limit: z.number().min(1).max(100).default(25).describe("Number of entries to fetch (max 100)"),
  user_id: snowflakeId.optional().describe("Filter by the user who performed the action"),
  action_type: z
    .string()
    .optional()
    .describe(
      `Filter by action type (e.g. MemberKick, MemberBanAdd, ChannelCreate). Available: ${auditLogEventNames.slice(0, 10).join(", ")}...`,
    ),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const queryAuditLog: ToolDefinition = {
  name: "query_audit_log",
  description:
    "Query the guild audit log. Filter by user, action type, or fetch recent entries. Requires ViewAuditLog permission.",
  category: "audit",
  inputSchema,
  permissions: ["ViewAuditLog"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);

    const options: { limit: number; user?: string; type?: number } = {
      limit: input.limit,
    };

    if (input.user_id) {
      options.user = input.user_id;
    }

    if (input.action_type) {
      const eventValue = AuditLogEvent[input.action_type as keyof typeof AuditLogEvent];
      if (eventValue !== undefined) {
        options.type = eventValue as number;
      }
    }

    const auditLog = await guild.fetchAuditLogs(options);

    const entries = auditLog.entries.map((entry) => ({
      id: entry.id,
      action: AuditLogEvent[entry.action] ?? entry.action,
      executor: entry.executor ? { id: entry.executor.id, tag: entry.executor.tag } : null,
      target: entry.target ? { id: (entry.target as any).id ?? null } : null,
      reason: entry.reason,
      created_at: entry.createdAt.toISOString(),
      changes: entry.changes.map((c) => ({
        key: c.key,
        old: c.old,
        new: c.new,
      })),
    }));

    return toolResultJson({
      guild_id: input.guild_id,
      count: entries.length,
      entries,
    });
  },
};
