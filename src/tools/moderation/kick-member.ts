import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult, toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  user_id: snowflakeId.describe("User ID to kick"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const kickMember: ToolDefinition = {
  name: "kick_member",
  description: "Kick a member from a guild. Requires KickMembers permission.",
  category: "moderation",
  inputSchema,
  permissions: ["KickMembers"],
  destructive: true,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const client = await ctx.discord.getClient(token);

    if (input.user_id === client.user?.id) {
      return toolResult("Cannot kick the bot itself", true);
    }

    const guild = await ctx.discord.getGuild(input.guild_id, token);

    if (input.user_id === guild.ownerId) {
      return toolResult("Cannot kick the guild owner", true);
    }

    const member = await guild.members.fetch(input.user_id);
    await member.kick(input.reason);

    return toolResultJson({
      action: "kicked",
      guild_id: input.guild_id,
      user_id: input.user_id,
      user_tag: member.user?.tag ?? input.user_id,
      reason: input.reason ?? null,
    });
  },
};
