import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID to list threads from"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
  archived: z.boolean().default(false).describe("Include archived threads"),
});

export const listThreads = defineTool({
  name: "list_threads",
  description: "List active (and optionally archived) threads in a guild.",
  category: "threads",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);
    const active = await guild.channels.fetchActiveThreads();

    const allThreads = [...active.threads.values()];

    // Fetch archived threads if requested
    if (input.archived) {
      const channels = await guild.channels.fetch();
      for (const [, channel] of channels) {
        if (channel && "threads" in channel && channel.threads) {
          try {
            const archived = await channel.threads.fetchArchived();
            for (const [, thread] of archived.threads) {
              // Avoid duplicates (a thread could appear in both)
              if (!allThreads.some((t) => t.id === thread.id)) {
                allThreads.push(thread);
              }
            }
          } catch {
            // Channel may not support threads or bot lacks access
          }
        }
      }
    }

    const threads = allThreads.map((thread) => ({
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
});
