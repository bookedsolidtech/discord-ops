import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult, toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  channel_id: snowflakeId.describe("Channel ID to create the webhook in"),
  name: z.string().min(1).max(80).describe("Webhook name"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const createWebhook: ToolDefinition = {
  name: "create_webhook",
  description: "Create a webhook for a channel. Requires ManageWebhooks permission.",
  category: "webhooks",
  inputSchema,
  permissions: ["ManageWebhooks"],
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getChannel(input.channel_id, token);

    if (!("createWebhook" in channel)) {
      return toolResult("Channel does not support webhooks", true);
    }

    const webhook = await (channel as any).createWebhook({
      name: input.name,
      reason: input.reason,
    });

    return toolResultJson({
      id: webhook.id,
      name: webhook.name,
      channel_id: webhook.channelId,
      guild_id: webhook.guildId,
      token: webhook.token ? "[PRESENT]" : null,
      url: webhook.url ? "[PRESENT]" : null,
      created_at: webhook.createdAt?.toISOString(),
    });
  },
};
