import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";

const inputSchema = z.object({
  guild_id: z.string().describe("Guild ID"),
  user_id: z.string().describe("User ID to look up"),
});

export const getMember: ToolDefinition = {
  name: "get_member",
  description: "Get detailed information about a guild member.",
  category: "members",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const guild = await ctx.discord.getGuild(input.guild_id);
    const member = await guild.members.fetch(input.user_id);

    return toolResultJson({
      id: member.id,
      username: member.user.username,
      display_name: member.displayName,
      discriminator: member.user.discriminator,
      bot: member.user.bot,
      avatar: member.user.avatarURL(),
      roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
      joined_at: member.joinedAt?.toISOString(),
      premium_since: member.premiumSince?.toISOString(),
      permissions: member.permissions.toArray(),
    });
  },
};
