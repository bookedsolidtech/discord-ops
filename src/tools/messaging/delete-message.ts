import { z } from "zod";
import { defineTool, toolResult } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  message_id: snowflakeId.describe("ID of the message to delete"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const deleteMessage = defineTool({
  name: "delete_message",
  description:
    "Delete a message. Bot can only delete its own messages or messages in channels where it has Manage Messages permission.",
  category: "messaging",
  inputSchema,
  destructive: true,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const message = await channel.messages.fetch(input.message_id);
    await message.delete();

    return toolResult(`Deleted message ${input.message_id}`);
  },
});
