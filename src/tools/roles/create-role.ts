import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID"),
  name: z.string().min(1).max(100).describe("Role name"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000")
    .optional()
    .describe("Hex color (e.g. '#ff0000')"),
  mentionable: z.boolean().optional().describe("Whether the role can be mentioned by everyone"),
  hoist: z
    .boolean()
    .optional()
    .describe("Whether the role should be displayed separately in the sidebar"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const createRole: ToolDefinition = {
  name: "create_role",
  description: "Create a new role in a guild. Requires ManageRoles permission.",
  category: "roles",
  inputSchema,
  permissions: ["ManageRoles"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);

    const role = await guild.roles.create({
      name: input.name,
      color: input.color,
      mentionable: input.mentionable,
      hoist: input.hoist,
      reason: input.reason,
    });

    return toolResultJson({
      id: role.id,
      name: role.name,
      color: role.hexColor,
      position: role.position,
      mentionable: role.mentionable,
      hoist: role.hoist,
      managed: role.managed,
      guild_id: input.guild_id,
    });
  },
};
