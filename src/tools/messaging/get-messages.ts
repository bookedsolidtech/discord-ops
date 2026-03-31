import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  channel_id: z.string().optional().describe("Direct channel ID"),
  guild_id: z.string().optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  limit: z.number().min(1).max(100).default(50).describe("Number of messages to fetch (max 100)"),
  before: z.string().optional().describe("Get messages before this message ID"),
  after: z.string().optional().describe("Get messages after this message ID"),
});

export const getMessages: ToolDefinition = {
  name: "get_messages",
  description: "Fetch recent messages from a Discord channel.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = resolveTarget(input, ctx.config);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId);

    const messages = await channel.messages.fetch({
      limit: input.limit,
      ...(input.before ? { before: input.before } : {}),
      ...(input.after ? { after: input.after } : {}),
    });

    const result = [...messages.values()].map((msg) => ({
      id: msg.id,
      author: msg.author.tag,
      content: msg.content,
      timestamp: msg.createdAt.toISOString(),
      attachments: msg.attachments.size,
      embeds: msg.embeds.length,
      reactions: [...(msg.reactions?.cache?.values?.() ?? [])].map((r: any) => ({
        emoji: r.emoji.name,
        count: r.count,
      })),
    }));

    return toolResultJson({
      channel_id: target.channelId,
      count: result.length,
      messages: result,
    });
  },
};
