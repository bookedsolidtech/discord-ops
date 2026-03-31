import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";

const inputSchema = z.object({
  guild_id: z.string().describe("Guild ID to list roles from"),
});

export const listRoles: ToolDefinition = {
  name: "list_roles",
  description: "List all roles in a guild.",
  category: "roles",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const guild = await ctx.discord.getGuild(input.guild_id);
    const roles = await guild.roles.fetch();

    const result = roles.map((role) => ({
      id: role.id,
      name: role.name,
      color: role.hexColor,
      position: role.position,
      mentionable: role.mentionable,
      managed: role.managed,
      member_count: role.members.size,
      permissions: role.permissions.toArray(),
    }));

    return toolResultJson({
      guild_id: input.guild_id,
      count: result.length,
      roles: [...result].sort((a, b) => b.position - a.position),
    });
  },
};
