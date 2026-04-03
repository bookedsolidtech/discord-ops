import { ChannelType, type GuildChannelTypes } from "discord.js";

/**
 * Maps friendly string names to discord.js ChannelType enum values.
 * Shared by create_channel, list_channels, and any other tools that accept a channel type.
 */
export const CHANNEL_TYPE_MAP: Record<string, GuildChannelTypes> = {
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement,
  forum: ChannelType.GuildForum,
  stage: ChannelType.GuildStageVoice,
};
