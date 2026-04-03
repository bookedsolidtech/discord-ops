import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID to list roles from"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const listRoles = defineTool({
  name: "list_roles",
  description: "List all roles in a guild.",
  category: "roles",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);
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
});
