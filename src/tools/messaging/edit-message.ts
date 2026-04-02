import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  message_id: snowflakeId.describe("ID of the message to edit"),
  content: z.string().min(1).max(2000).describe("New message content"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const editMessage: ToolDefinition = {
  name: "edit_message",
  description: "Edit a message sent by the bot.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const message = await channel.messages.fetch(input.message_id);
    const edited = await message.edit(input.content);

    return toolResultJson({
      id: edited.id,
      channel_id: edited.channelId,
      content: edited.content,
      edited_timestamp: edited.editedAt?.toISOString(),
    });
  },
};
