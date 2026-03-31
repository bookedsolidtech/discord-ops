import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID to list threads from"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
  archived: z.boolean().default(false).describe("Include archived threads"),
});

export const listThreads: ToolDefinition = {
  name: "list_threads",
  description: "List active (and optionally archived) threads in a guild.",
  category: "threads",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);
    const active = await guild.channels.fetchActiveThreads();

    const threads = active.threads.map((thread) => ({
      id: thread.id,
      name: thread.name,
      parent_id: thread.parentId,
      parent_name: thread.parent?.name,
      archived: thread.archived,
      message_count: thread.messageCount,
      member_count: thread.memberCount,
      created_at: thread.createdAt?.toISOString(),
    }));

    return toolResultJson({
      guild_id: input.guild_id,
      count: threads.length,
      threads,
    });
  },
};
