import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
  user_id: snowflakeId.describe("User ID to look up"),
});

export const getMember = defineTool({
  name: "get_member",
  description: "Get detailed information about a guild member.",
  category: "members",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);
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
});
