import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  webhook_id: snowflakeId.describe("Webhook ID to delete"),
  guild_id: snowflakeId.describe("Guild ID (needed for bot token resolution)"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const deleteWebhook: ToolDefinition = {
  name: "delete_webhook",
  description: "Delete a webhook. This is irreversible. Requires ManageWebhooks permission.",
  category: "webhooks",
  inputSchema,
  permissions: ["ManageWebhooks"],
  destructive: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const client = await ctx.discord.getClient(token);
    const webhook = await client.fetchWebhook(input.webhook_id);

    const webhookName = webhook.name;
    await webhook.delete(input.reason);

    return toolResult(`Deleted webhook "${webhookName}" (${input.webhook_id})`);
  },
};
