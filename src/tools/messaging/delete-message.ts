import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  message_id: z.string().describe("ID of the message to delete"),
  channel_id: z.string().optional().describe("Direct channel ID"),
  guild_id: z.string().optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const deleteMessage: ToolDefinition = {
  name: "delete_message",
  description: "Delete a message. Bot can only delete its own messages or messages in channels where it has Manage Messages permission.",
  category: "messaging",
  inputSchema,
  destructive: true,
  handle: async (input, ctx) => {
    const target = resolveTarget(input, ctx.config);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId);
    const message = await channel.messages.fetch(input.message_id);
    await message.delete();

    return toolResult(`Deleted message ${input.message_id}`);
  },
};
