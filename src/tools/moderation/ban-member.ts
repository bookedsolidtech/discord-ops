import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult, toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  user_id: snowflakeId.describe("User ID to ban"),
  reason,
  delete_message_seconds: z
    .number()
    .min(0)
    .max(604800)
    .optional()
    .describe("Number of seconds of messages to delete (0-604800, i.e. up to 7 days)"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const banMember: ToolDefinition = {
  name: "ban_member",
  description:
    "Ban a user from a guild. Can optionally delete recent messages. Requires BanMembers permission.",
  category: "moderation",
  inputSchema,
  permissions: ["BanMembers"],
  destructive: true,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const client = await ctx.discord.getClient(token);

    if (input.user_id === client.user?.id) {
      return toolResult("Cannot ban the bot itself", true);
    }

    const guild = await ctx.discord.getGuild(input.guild_id, token);

    if (input.user_id === guild.ownerId) {
      return toolResult("Cannot ban the guild owner", true);
    }

    await guild.members.ban(input.user_id, {
      reason: input.reason,
      deleteMessageSeconds: input.delete_message_seconds,
    });

    return toolResultJson({
      action: "banned",
      guild_id: input.guild_id,
      user_id: input.user_id,
      reason: input.reason ?? null,
      delete_message_seconds: input.delete_message_seconds ?? 0,
    });
  },
};
