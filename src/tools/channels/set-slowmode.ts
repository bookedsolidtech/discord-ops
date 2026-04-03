import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId, reason } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  channel_id: snowflakeId.describe("Channel ID"),
  seconds: z
    .number()
    .min(0)
    .max(21600)
    .describe("Slowmode interval in seconds (0 to disable, max 21600 = 6 hours)"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const setSlowmode = defineTool({
  name: "set_slowmode",
  description:
    "Set or disable slowmode on a channel. Set seconds to 0 to disable. Requires ManageChannels permission.",
  category: "channels",
  inputSchema,
  permissions: ["ManageChannels"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getChannel(input.channel_id, token);

    const updated = await channel.edit({
      rateLimitPerUser: input.seconds,
      reason: input.reason,
    });

    return toolResultJson({
      channel_id: updated.id,
      name: "name" in updated ? (updated as { name: string }).name : null,
      slowmode_seconds: input.seconds,
      action: input.seconds > 0 ? "slowmode_set" : "slowmode_disabled",
    });
  },
});
