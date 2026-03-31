import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  message_id: z.string().describe("ID of the message to react to"),
  emoji: z.string().describe("Emoji to react with (unicode or custom format <:name:id>)"),
  channel_id: z.string().optional().describe("Direct channel ID"),
  guild_id: z.string().optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const addReaction: ToolDefinition = {
  name: "add_reaction",
  description: "Add a reaction emoji to a message.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = resolveTarget(input, ctx.config);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const message = await channel.messages.fetch(input.message_id);
    await message.react(input.emoji);

    return toolResult(`Added reaction ${input.emoji} to message ${input.message_id}`);
  },
};
