import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  user_id: snowflakeId.describe("User ID to unban"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const unbanMember = defineTool({
  name: "unban_member",
  description: "Unban a user from a guild. Requires BanMembers permission.",
  category: "moderation",
  inputSchema,
  permissions: ["BanMembers"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);

    await guild.members.unban(input.user_id, input.reason);

    return toolResultJson({
      action: "unbanned",
      guild_id: input.guild_id,
      user_id: input.user_id,
      reason: input.reason ?? null,
    });
  },
});
