import { z } from "zod";
import type { TextChannel } from "discord.js";
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
    .describe(
      "Invite duration in seconds (0 = never expires, max 604800 = 7 days, default 86400 = 24h)",
    ),
  max_uses: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(1)
    .describe("Max uses before invite expires (0 = unlimited, must be explicit; default 1)"),
  temporary: z
    .boolean()
    .default(false)
    .describe("Whether membership is temporary (kicked when offline)"),
  unique: z
    .boolean()
    .default(false)
    .describe("Whether to create a new unique invite even if one already exists"),
  project: z.string().optional().describe("Project name for token resolution"),
});

export const createInvite: ToolDefinition = {
  name: "create_invite",
  description:
    "Create an invite link for a Discord channel. Destructive: creates a persistent access link. Defaults to max_uses=1 (single-use). Set max_uses=0 explicitly for unlimited-use invites.",
  category: "guilds",
  inputSchema,
  permissions: ["CreateInstantInvite"],
  requiresGuild: true,
  destructive: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getAnyChannel(input.channel_id, token);

    // Channel supports createInvite if it's text-based or voice
    if (!channel.isTextBased() && !channel.isVoiceBased()) {
      return toolResultJson(
        { error: `Channel ${input.channel_id} does not support invite creation` },
        true,
      );
    }
    const invite = await (channel as TextChannel).createInvite({
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
