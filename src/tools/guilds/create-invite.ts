import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
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
  inputSchema,
  permissions: ["CreateInstantInvite"],
  requiresGuild: true,
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
