import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";

const inputSchema = z.object({
  guild_id: z.string().describe("Guild ID to list members from"),
  limit: z.number().min(1).max(1000).default(100).describe("Number of members to fetch"),
});

export const listMembers: ToolDefinition = {
  name: "list_members",
  description: "List members of a guild.",
  category: "members",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const guild = await ctx.discord.getGuild(input.guild_id);
    const members = await guild.members.fetch({ limit: input.limit });

    const result = members.map((member) => ({
      id: member.id,
      username: member.user.username,
      display_name: member.displayName,
      discriminator: member.user.discriminator,
      bot: member.user.bot,
      roles: member.roles.cache.map((r) => ({ id: r.id, name: r.name })),
      joined_at: member.joinedAt?.toISOString(),
    }));

    return toolResultJson({
      guild_id: input.guild_id,
      count: result.length,
      members: [...result],
    });
  },
};
