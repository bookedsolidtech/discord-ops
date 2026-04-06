import { z } from "zod";
import { defineTool, toolResult } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  role_id: snowflakeId.describe("Role ID to delete"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const deleteRole = defineTool({
  name: "delete_role",
  description: "Delete a role from a guild. This is irreversible. Requires ManageRoles permission.",
  category: "roles",
  inputSchema,
  permissions: ["ManageRoles"],
  destructive: true,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);
    const roles = await guild.roles.fetch();
    const role = roles.get(input.role_id);

    if (!role) {
      return toolResult(`Role ${input.role_id} not found`, true);
    }

    const roleName = role.name;
    await role.delete(input.reason);

    return toolResult(`Deleted role "${roleName}" (${input.role_id}) from guild ${input.guild_id}`);
  },
});
