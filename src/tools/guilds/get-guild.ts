import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID to get details for"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const getGuild: ToolDefinition = {
  name: "get_guild",
  description: "Get detailed information about a guild (server).",
  category: "guilds",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);

    return toolResultJson({
      id: guild.id,
      name: guild.name,
      description: guild.description,
      member_count: guild.memberCount,
      icon: guild.iconURL(),
      banner: guild.bannerURL(),
      owner_id: guild.ownerId,
      created_at: guild.createdAt.toISOString(),
      features: guild.features,
      premium_tier: guild.premiumTier,
      premium_subscription_count: guild.premiumSubscriptionCount,
      verification_level: guild.verificationLevel,
    });
  },
};
