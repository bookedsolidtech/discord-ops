import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  user_id: snowflakeId.describe("User ID to timeout"),
  duration_seconds: z
    .number()
    .min(0)
    .max(2419200)
    .describe("Timeout duration in seconds (0 to remove, max 28 days = 2419200)"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const timeoutMember = defineTool({
  name: "timeout_member",
  description:
    "Timeout (mute) a member for a specified duration. Set duration_seconds to 0 to remove timeout. Requires ModerateMembers permission.",
  category: "moderation",
  inputSchema,
  permissions: ["ModerateMembers"],
  destructive: true,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const client = await ctx.discord.getClient(token);

    if (input.user_id === client.user?.id) {
      return toolResult("Cannot timeout the bot itself", true);
    }

    const guild = await ctx.discord.getGuild(input.guild_id, token);

    if (input.user_id === guild.ownerId) {
      return toolResult("Cannot timeout the guild owner", true);
    }

    const member = await guild.members.fetch(input.user_id);
    await member.timeout(
      input.duration_seconds > 0 ? input.duration_seconds * 1000 : null,
      input.reason,
    );

    const timeoutUntil =
      input.duration_seconds > 0 ? new Date(Date.now() + input.duration_seconds * 1000) : null;

    return toolResultJson({
      action: input.duration_seconds > 0 ? "timed_out" : "timeout_removed",
      guild_id: input.guild_id,
      user_id: input.user_id,
      user_tag: member.user?.tag ?? input.user_id,
      duration_seconds: input.duration_seconds,
      timeout_until: timeoutUntil?.toISOString() ?? null,
      reason: input.reason ?? null,
    });
  },
});
