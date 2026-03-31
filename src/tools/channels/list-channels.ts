import { z } from "zod";
import { ChannelType } from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";

const inputSchema = z.object({
  guild_id: z.string().describe("Guild ID to list channels from"),
  type: z
    .enum(["text", "voice", "category", "announcement", "forum", "stage"])
    .optional()
    .describe("Filter by channel type"),
});

const CHANNEL_TYPE_MAP: Record<string, ChannelType> = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
};

export const listChannels: ToolDefinition = {
  name: "list_channels",
  description: "List all channels in a guild, optionally filtered by type.",
  category: "channels",
  inputSchema,
  requiresGuild: true,
  handle: async (input, ctx) => {
    const guild = await ctx.discord.getGuild(input.guild_id);
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
};
