import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { renderTemplate } from "../../templates/registry.js";
import { buildOwnerMentions } from "../../config/owners.js";

const inputSchema = z.object({
  content: z.string().min(1).max(2000).describe("Message content (max 2000 chars)"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  notification_type: z.string().optional().describe("Notification type for auto-routing"),
  reply_to: snowflakeId.optional().describe("Message ID to reply to"),
  raw: z
    .boolean()
    .default(false)
    .describe("Send as plain text instead of auto-wrapping in an embed (default: false)"),
});

export const sendMessage: ToolDefinition = {
  name: "send_message",
  description:
    "Send a message to a Discord channel. Messages are automatically wrapped in a polished embed. Set raw=true for plain text. For richer formatting, use send_template instead.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const mentions = buildOwnerMentions(target.project, input.notification_type, ctx.config);

    // Auto-wrap in simple embed unless raw=true
    if (!input.raw) {
      const rendered = renderTemplate("simple", { message: input.content });
      const message = await channel.send({
        ...(mentions ? { content: mentions } : {}),
        embeds: rendered.embeds,
        ...(input.reply_to ? { reply: { messageReference: input.reply_to } } : {}),
      });

      return toolResultJson({
        id: message.id,
        channel_id: message.channelId,
        template: "simple",
        author: message.author.tag,
        timestamp: message.createdAt.toISOString(),
        ...(target.project ? { project: target.project } : {}),
      });
    }

    const message = await channel.send({
      content: mentions ? `${mentions}\n${input.content}` : input.content,
      ...(input.reply_to ? { reply: { messageReference: input.reply_to } } : {}),
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
