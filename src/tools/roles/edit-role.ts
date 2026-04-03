import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  role_id: snowflakeId.describe("Role ID to edit"),
  name: z.string().min(1).max(100).optional().describe("New role name"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000")
    .optional()
    .describe("New hex color (e.g. '#ff0000')"),
  mentionable: z.boolean().optional().describe("Whether the role can be mentioned"),
  hoist: z.boolean().optional().describe("Whether the role displays separately in sidebar"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const editRole = defineTool({
  name: "edit_role",
  description: "Edit an existing role in a guild. Requires ManageRoles permission.",
  category: "roles",
  inputSchema,
  permissions: ["ManageRoles"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);
    const roles = await guild.roles.fetch();
    const role = roles.get(input.role_id);

    if (!role) {
      return toolResult(`Role ${input.role_id} not found`, true);
    }

    const updated = await role.edit({
      name: input.name,
      color: input.color as `#${string}` | undefined,
      mentionable: input.mentionable,
      hoist: input.hoist,
      reason: input.reason,
    });

    return toolResultJson({
      id: updated.id,
      name: updated.name,
      color: updated.hexColor,
      position: updated.position,
      mentionable: updated.mentionable,
      hoist: updated.hoist,
      guild_id: input.guild_id,
    });
  },
});
