import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID to list webhooks from"),
  channel_id: snowflakeId.optional().describe("Filter webhooks to a specific channel"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const listWebhooks: ToolDefinition = {
  name: "list_webhooks",
  description: "List webhooks in a guild or channel. Requires ManageWebhooks permission.",
  category: "webhooks",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;

    let webhooks;
    if (input.channel_id) {
      const channel = await ctx.discord.getChannel(input.channel_id, token);
      if (!("fetchWebhooks" in channel)) {
        return toolResult("Channel does not support webhooks", true);
      }
      webhooks = await (channel as any).fetchWebhooks();
    } else {
      const guild = await ctx.discord.getGuild(input.guild_id, token);
      webhooks = await guild.fetchWebhooks();
    }

    const result = [...webhooks.values()].map((wh: any) => ({
      id: wh.id,
      name: wh.name,
      channel_id: wh.channelId,
      type: wh.type,
      owner: wh.owner ? { id: wh.owner.id, tag: wh.owner.tag ?? wh.owner.id } : null,
      created_at: wh.createdAt?.toISOString(),
    }));

    return toolResultJson({
      guild_id: input.guild_id,
      channel_id: input.channel_id ?? null,
      count: result.length,
      webhooks: result,
    });
  },
};
