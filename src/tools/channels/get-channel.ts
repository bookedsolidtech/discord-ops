import { z } from "zod";
import { ChannelType, type TextChannel } from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";

const inputSchema = z.object({
  channel_id: z.string().describe("Channel ID to get details for"),
});

export const getChannel: ToolDefinition = {
  name: "get_channel",
  description: "Get detailed information about a specific channel.",
  category: "channels",
  inputSchema,
  handle: async (input, ctx) => {
    const channel = await ctx.discord.getChannel(input.channel_id);

    const result: Record<string, unknown> = {
      id: channel.id,
      name: channel.name,
      type: ChannelType[channel.type],
      position: channel.position,
      parent_id: channel.parentId,
      guild_id: channel.guildId,
    };

    if ("topic" in channel) {
      result.topic = (channel as TextChannel).topic;
    }
    if ("nsfw" in channel) {
      result.nsfw = (channel as TextChannel).nsfw;
    }
    if ("rateLimitPerUser" in channel) {
      result.slowmode_seconds = (channel as TextChannel).rateLimitPerUser;
    }

    return toolResultJson(result);
  },
};
