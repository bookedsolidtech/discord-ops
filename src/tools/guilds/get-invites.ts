import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID to fetch invites for"),
  project: z.string().optional().describe("Project name for token resolution"),
});

export const getInvites: ToolDefinition = {
  name: "get_invites",
  description: "Get all active invites for a guild.",
  category: "guilds",
  inputSchema,
  permissions: ["ManageGuild"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);
    const invites = await guild.invites.fetch();

    return toolResultJson({
      guild: guild.name,
      guild_id: guild.id,
      count: invites.size,
      invites: invites.map((inv) => ({
        code: inv.code,
        url: `https://discord.gg/${inv.code}`,
        channel: inv.channel?.name ?? "unknown",
        channel_id: inv.channelId,
        inviter: inv.inviter?.tag ?? "unknown",
        uses: inv.uses,
        max_uses: inv.maxUses,
        max_age: inv.maxAge,
        temporary: inv.temporary,
        created_at: inv.createdAt?.toISOString(),
        expires_at: inv.expiresAt?.toISOString(),
      })),
    });
  },
};
