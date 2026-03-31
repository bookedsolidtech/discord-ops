import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  content: z.string().min(1).max(2000).describe("Message content (max 2000 chars)"),
  channel_id: z.string().optional().describe("Direct channel ID"),
  guild_id: z.string().optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  notification_type: z.string().optional().describe("Notification type for auto-routing"),
  reply_to: z.string().optional().describe("Message ID to reply to"),
});

export const sendMessage: ToolDefinition = {
  name: "send_message",
  description:
    "Send a message to a Discord channel. Supports project routing (project + channel alias), notification routing (notification_type), or direct channel_id.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = resolveTarget(input, ctx.config);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);

    const message = await channel.send({
      content: input.content,
      ...(input.reply_to
        ? { reply: { messageReference: input.reply_to } }
        : {}),
    });

    return toolResultJson({
      id: message.id,
      channel_id: message.channelId,
      content: message.content,
      author: message.author.tag,
      timestamp: message.createdAt.toISOString(),
      ...(target.project ? { project: target.project } : {}),
    });
  },
};
