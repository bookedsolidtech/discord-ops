import { z } from "zod";
import { PermissionFlagsBits } from "discord.js";
import { defineTool, toolResult } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

// Derive valid flag names directly from discord.js — auto-updates with library upgrades
const VALID_PERMISSION_FLAGS = new Set(Object.keys(PermissionFlagsBits));

const permissionFlag = z.string().refine(
  (f) => VALID_PERMISSION_FLAGS.has(f),
  (f) => ({ message: `Invalid permission flag: "${f}"` }),
);

const inputSchema = z.object({
  channel_id: snowflakeId.describe("Channel ID to set permissions on"),
  target_id: snowflakeId.describe("Role or user snowflake ID"),
  target_type: z.enum(["role", "member"]).describe("Whether target_id is a role or member"),
  allow: z
    .array(permissionFlag)
    .optional()
    .describe("Permission flags to allow (e.g., 'ViewChannel', 'SendMessages')"),
  deny: z.array(permissionFlag).optional().describe("Permission flags to deny"),
  project: z.string().optional().describe("Project name for token resolution"),
});

export const setPermissions = defineTool({
  name: "set_permissions",
  description:
    "Set channel permission overrides for a role or member. Specify permission flags to allow or deny. Common flags: ViewChannel, SendMessages, ManageMessages, EmbedLinks, AttachFiles, ReadMessageHistory, AddReactions, ManageChannels.",
  category: "channels",
  inputSchema,
  permissions: ["ManageRoles"],
  destructive: true,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getChannel(input.channel_id, token);

    await channel.permissionOverwrites.edit(input.target_id, {
      ...(input.allow ? Object.fromEntries(input.allow.map((p: string) => [p, true])) : {}),
      ...(input.deny ? Object.fromEntries(input.deny.map((p: string) => [p, false])) : {}),
    });

    return toolResult(
      `Updated permissions for ${input.target_type} ${input.target_id} on #${channel.name}: ` +
        `allow=[${input.allow?.join(", ") ?? "none"}], deny=[${input.deny?.join(", ") ?? "none"}]`,
    );
  },
});
