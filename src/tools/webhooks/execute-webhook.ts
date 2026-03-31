import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  webhook_id: snowflakeId.describe("Webhook ID to execute"),
  guild_id: snowflakeId.describe("Guild ID (needed for bot token resolution)"),
  content: z.string().max(2000).optional().describe("Message content"),
  username: z.string().max(80).optional().describe("Override the webhook's display name"),
  avatar_url: z.string().url().optional().describe("Override the webhook's avatar URL"),
  embeds: z
    .array(
      z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        color: z.number().optional(),
        url: z.string().url().optional(),
        footer: z.object({ text: z.string() }).optional(),
        timestamp: z.string().optional(),
        fields: z
          .array(
            z.object({
              name: z.string(),
              value: z.string(),
              inline: z.boolean().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional()
    .describe("Array of embed objects"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const executeWebhook: ToolDefinition = {
  name: "execute_webhook",
  description:
    "Send a message through a webhook. Supports content, embeds, and username/avatar overrides. Great for CI/CD notifications.",
  category: "webhooks",
  inputSchema,
  permissions: ["ManageWebhooks"],
  destructive: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const client = await ctx.discord.getClient(token);
    const webhook = await client.fetchWebhook(input.webhook_id);

    if (!webhook.token) {
      return toolResult(
        "Webhook has no token — cannot execute (bot-created webhooks without tokens need the webhook token)",
        true,
      );
    }

    if (!input.content && (!input.embeds || input.embeds.length === 0)) {
      return toolResult("At least content or embeds must be provided", true);
    }

    const message = await webhook.send({
      content: input.content,
      username: input.username,
      avatarURL: input.avatar_url,
      embeds: input.embeds,
    });

    return toolResultJson({
      id: message.id,
      channel_id: message.channelId,
      webhook_id: input.webhook_id,
      content: message.content,
      timestamp: message.createdAt?.toISOString(),
    });
  },
};
