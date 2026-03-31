import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  channel_id: z.string().optional().describe("Direct channel ID"),
  guild_id: z.string().optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  notification_type: z.string().optional().describe("Notification type for auto-routing"),
  query: z.string().min(1).describe("Text to search for in message content"),
  author_id: snowflakeId.optional().describe("Filter by author user ID"),
  limit: z.number().min(1).max(100).default(50).describe("Max messages to scan (default 50)"),
  before: z.string().optional().describe("Fetch messages before this message ID"),
  after: z.string().optional().describe("Fetch messages after this message ID"),
});

export const searchMessages: ToolDefinition = {
  name: "search_messages",
  description:
    "Search for messages containing specific text in a channel. Scans recent messages and filters by content, optionally by author. Supports project routing.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = resolveTarget(input, ctx.config);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);

    const fetchOptions: Record<string, unknown> = { limit: input.limit };
    if (input.before) fetchOptions.before = input.before;
    if (input.after) fetchOptions.after = input.after;

    const messages = await channel.messages.fetch(fetchOptions);
    const queryLower = input.query.toLowerCase();

    const matches = [...messages.values()]
      .filter((msg) => {
        if (!msg.content.toLowerCase().includes(queryLower)) return false;
        if (input.author_id && msg.author.id !== input.author_id) return false;
        return true;
      })
      .map((msg) => ({
        id: msg.id,
        content: msg.content.length > 200 ? msg.content.slice(0, 200) + "..." : msg.content,
        author: msg.author.tag,
        author_id: msg.author.id,
        timestamp: msg.createdAt.toISOString(),
        pinned: msg.pinned,
      }));

    return toolResultJson({
      channel: channel.name,
      channel_id: channel.id,
      query: input.query,
      scanned: messages.size,
      matches: matches.length,
      results: matches,
    });
  },
};
