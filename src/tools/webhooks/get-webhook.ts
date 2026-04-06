import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  webhook_id: snowflakeId.describe("Webhook ID to fetch"),
  guild_id: snowflakeId.describe("Guild ID (needed for bot token resolution)"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const getWebhook = defineTool({
  name: "get_webhook",
  description: "Get details about a specific webhook.",
  category: "webhooks",
  inputSchema,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const client = await ctx.discord.getClient(token);
    const webhook = await client.fetchWebhook(input.webhook_id);

    return toolResultJson({
      id: webhook.id,
      name: webhook.name,
      channel_id: webhook.channelId,
      guild_id: webhook.guildId,
      type: webhook.type,
      avatar: webhook.avatar,
      created_at: webhook.createdAt?.toISOString(),
      owner: webhook.owner
        ? {
            id: webhook.owner.id,
            tag: "tag" in webhook.owner ? (webhook.owner as { tag: string }).tag : webhook.owner.id,
          }
        : null,
    });
  },
});
