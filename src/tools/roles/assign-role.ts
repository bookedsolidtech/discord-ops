import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  user_id: snowflakeId.describe("User ID to assign/remove role"),
  role_id: snowflakeId.describe("Role ID to assign or remove"),
  action: z.enum(["add", "remove"]).default("add").describe("Whether to add or remove the role"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const assignRole = defineTool({
  name: "assign_role",
  description: "Add or remove a role from a guild member. Requires ManageRoles permission.",
  category: "roles",
  inputSchema,
  permissions: ["ManageRoles"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);
    const member = await guild.members.fetch(input.user_id);

    if (input.action === "add") {
      await member.roles.add(input.role_id, input.reason);
    } else {
      await member.roles.remove(input.role_id, input.reason);
    }

    return toolResultJson({
      action: input.action === "add" ? "role_added" : "role_removed",
      guild_id: input.guild_id,
      user_id: input.user_id,
      user_tag: member.user?.tag ?? input.user_id,
      role_id: input.role_id,
      reason: input.reason ?? null,
    });
  },
});
