import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  name: z.string().min(1).max(100).describe("Thread name"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  message_id: snowflakeId.optional().describe("Message ID to create thread from"),
  auto_archive_duration: z
    .enum(["60", "1440", "4320", "10080"])
    .default("1440")
    .describe("Auto-archive duration in minutes (60, 1440, 4320, 10080)"),
});

export const createThread = defineTool({
  name: "create_thread",
  description: "Create a thread in a channel, optionally from an existing message.",
  category: "threads",
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);

    const thread = await channel.threads.create({
      name: input.name,
      ...(input.message_id ? { startMessage: input.message_id } : {}),
      autoArchiveDuration: Number(input.auto_archive_duration) as 60 | 1440 | 4320 | 10080,
    });

    return toolResultJson({
      id: thread.id,
      name: thread.name,
      parent_id: thread.parentId,
      archived: thread.archived,
      auto_archive_duration: thread.autoArchiveDuration,
    });
  },
});
