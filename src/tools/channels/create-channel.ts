import { z } from "zod";
import { ChannelType, type GuildChannelTypes } from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";

const inputSchema = z.object({
  guild_id: z.string().describe("Guild ID to create channel in"),
  name: z.string().min(1).max(100).describe("Channel name"),
  type: z
    .enum(["text", "voice", "category", "announcement", "forum", "stage"])
    .default("text")
    .describe("Channel type"),
  topic: z.string().max(1024).optional().describe("Channel topic"),
  parent_id: z.string().optional().describe("Category ID to place channel under"),
});

const CHANNEL_TYPE_MAP: Record<string, GuildChannelTypes> = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
};

export const createChannel: ToolDefinition = {
  name: "create_channel",
  description: "Create a new channel in a guild.",
  category: "channels",
  inputSchema,
  requiresGuild: true,
  permissions: ["ManageChannels"],
  handle: async (input, ctx) => {
    const guild = await ctx.discord.getGuild(input.guild_id);

    const channel = await guild.channels.create({
      name: input.name,
      type: CHANNEL_TYPE_MAP[input.type]!,
      topic: input.topic,
      parent: input.parent_id,
    });

    return toolResultJson({
      id: channel.id,
      name: channel.name,
      type: ChannelType[channel.type],
      guild_id: guild.id,
      parent_id: channel.parentId,
    });
  },
};
