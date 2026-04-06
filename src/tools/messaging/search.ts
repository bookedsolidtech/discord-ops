import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  channel_id: z.string().optional().describe("Direct channel ID"),
  guild_id: z.string().optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  query: z.string().min(1).describe("Text to search for (case-insensitive substring match)"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(25)
    .describe("Maximum number of matching messages to return"),
  max_pages: z
    .number()
    .min(1)
    .max(5)
    .default(1)
    .describe("Maximum pages of message history to scan (100 messages per page)"),
});

export const searchMessages: ToolDefinition = {
  name: "search_messages",
  description: "Search message history in a Discord channel for a given text string.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = resolveTarget(input, ctx.config);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const needle = input.query.toLowerCase();
    const results: Array<{
      id: string;
      author: string;
      content: string;
      timestamp: string;
    }> = [];

    let before: string | undefined;
    let has_more = false;

    for (let page = 0; page < input.max_pages; page++) {
      const fetched = await channel.messages.fetch({
        limit: 100,
        ...(before ? { before } : {}),
      });

      if (fetched.size === 0) {
        break;
      }

      const messages = [...fetched.values()];

      for (const msg of messages) {
        if (msg.content.toLowerCase().includes(needle)) {
          results.push({
            id: msg.id,
            author: msg.author.tag,
            content: msg.content,
            timestamp: msg.createdAt.toISOString(),
          });
          if (results.length >= input.limit) {
            break;
          }
        }
      }

      if (results.length >= input.limit) {
        // We hit the limit; there may be more history but we stopped early.
        has_more = true;
        break;
      }

      // The oldest message ID on this page becomes the cursor for the next page.
      const oldest = messages[messages.length - 1];
      before = oldest?.id;

      // If this page returned fewer than 100 messages there is no further history.
      if (fetched.size < 100) {
        break;
      }

      // If we've consumed all pages, signal that more history may exist.
      if (page === input.max_pages - 1) {
        has_more = true;
      }
    }

    return toolResultJson({
      channel_id: target.channelId,
      query: input.query,
      count: results.length,
      has_more,
      messages: results,
    });
  },
};
