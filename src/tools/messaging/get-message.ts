import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { serializeMessage } from "./message-shape.js";

const inputSchema = z.object({
  message_id: snowflakeId.describe("ID of the message to fetch"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const getMessage = defineTool({
  name: "get_message",
  description:
    "Fetch a single message by ID — the primitive for re-checking a message you posted earlier. " +
    "Use after send_message (capture its message_id) to observe what happened since: current " +
    "reactions, pin state, edits, whether a thread was opened on it, and what it replies to. " +
    "Pair with get_reactions to see who reacted and get_replies to collect responses.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const message = await channel.messages.fetch(input.message_id).catch(() => undefined);
    if (!message) {
      return toolResult(
        `Message ${input.message_id} not found in channel ${target.channelId}`,
        true,
      );
    }

    return toolResultJson({
      channel_id: target.channelId,
      ...serializeMessage(message),
      author_bot: message.author.bot ?? false,
      pinned: message.pinned,
      edited_timestamp: message.editedAt?.toISOString() ?? null,
      has_thread: message.hasThread ?? false,
      thread_id: message.thread?.id ?? null,
    });
  },
});
