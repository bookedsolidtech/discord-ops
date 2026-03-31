import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";

const inputSchema = z.object({
  guild_id: z.string().describe("Guild ID to get details for"),
});

export const getGuild: ToolDefinition = {
  name: "get_guild",
  description: "Get detailed information about a guild (server).",
  category: "guilds",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const guild = await ctx.discord.getGuild(input.guild_id);

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
