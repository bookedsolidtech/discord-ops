import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  webhook_id: snowflakeId.describe("Webhook ID to edit"),
  guild_id: snowflakeId.describe("Guild ID (needed for bot token resolution)"),
  name: z.string().min(1).max(80).optional().describe("New webhook name"),
  channel_id: snowflakeId.optional().describe("Move webhook to a different channel"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const editWebhook: ToolDefinition = {
  name: "edit_webhook",
  description: "Edit a webhook's name or channel. Requires ManageWebhooks permission.",
  category: "webhooks",
  inputSchema,
  permissions: ["ManageWebhooks"],
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const client = await ctx.discord.getClient(token);
    const webhook = await client.fetchWebhook(input.webhook_id);

    const updated = await webhook.edit({
      name: input.name,
      channel: input.channel_id,
      reason: input.reason,
    });

    return toolResultJson({
      id: updated.id,
      name: updated.name,
      channel_id: updated.channelId,
      guild_id: updated.guildId,
    });
  },
};
