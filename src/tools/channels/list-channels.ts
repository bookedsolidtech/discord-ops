import { z } from "zod";
import { ChannelType } from "discord.js";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";
import { CHANNEL_TYPE_MAP } from "./channel-types.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID to list channels from"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
  type: z
    .enum(["text", "voice", "category", "announcement", "forum", "stage"])
    .optional()
    .describe("Filter by channel type"),
});

export const listChannels = defineTool({
  name: "list_channels",
  description: "List all channels in a guild, optionally filtered by type.",
  category: "channels",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);
    const channels = await guild.channels.fetch();

    let filtered = [...channels.values()].filter(Boolean);

    if (input.type) {
      const targetType = CHANNEL_TYPE_MAP[input.type];
      filtered = filtered.filter((ch) => ch!.type === targetType);
    }

    const result = filtered.map((ch) => ({
      id: ch!.id,
      name: ch!.name,
      type: ChannelType[ch!.type],
      position: ch!.position,
      parent_id: ch!.parentId,
    }));

    return toolResultJson({
      guild_id: input.guild_id,
      count: result.length,
      channels: result.sort((a, b) => a.position - b.position),
    });
  },
});
