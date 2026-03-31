import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const getInvitesSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID to fetch invites for"),
  project: z.string().optional().describe("Project name for token resolution"),
});

export const getInvites: ToolDefinition = {
  name: "get_invites",
  description: "Get all active invites for a guild.",
  category: "guilds",
  inputSchema: getInvitesSchema,
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

const createInviteSchema = z.object({
  channel_id: snowflakeId.describe("Channel ID to create invite for"),
  max_age: z
    .number()
    .int()
    .min(0)
    .max(604800)
    .default(86400)
    .describe("Invite duration in seconds (0 = never, max 604800 = 7 days, default 86400 = 24h)"),
  max_uses: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(0)
    .describe("Max uses (0 = unlimited, default 0)"),
  temporary: z
    .boolean()
    .default(false)
    .describe("Whether membership is temporary (kicked when offline)"),
  unique: z
    .boolean()
    .default(false)
    .describe("Whether to create a new unique invite even if one exists"),
  project: z.string().optional().describe("Project name for token resolution"),
});

export const createInvite: ToolDefinition = {
  name: "create_invite",
  description: "Create an invite link for a Discord channel.",
  category: "guilds",
  inputSchema: createInviteSchema,
  permissions: ["CreateInstantInvite"],
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getChannel(input.channel_id, token);

    const invite = await channel.createInvite({
      maxAge: input.max_age,
      maxUses: input.max_uses,
      temporary: input.temporary,
      unique: input.unique,
    });

    return toolResultJson({
      code: invite.code,
      url: `https://discord.gg/${invite.code}`,
      channel: channel.name,
      channel_id: channel.id,
      max_age: invite.maxAge,
      max_uses: invite.maxUses,
      temporary: invite.temporary,
      expires_at: invite.expiresAt?.toISOString(),
    });
  },
};
