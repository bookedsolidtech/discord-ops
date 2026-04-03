import { z } from "zod";
import { ChannelType } from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";
import { CHANNEL_TYPE_MAP } from "./channel-types.js";

const inputSchema = z.object({
  guild_id: snowflakeId.describe("Guild ID to create channel in"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
  name: z.string().min(1).max(100).describe("Channel name"),
  type: z
    .enum(["text", "voice", "category", "announcement", "forum", "stage"])
    .default("text")
    .describe("Channel type"),
  topic: z.string().max(1024).optional().describe("Channel topic"),
  parent_id: snowflakeId.optional().describe("Category ID to place channel under"),
});

export const createChannel: ToolDefinition = {
  name: "create_channel",
  description: "Create a new channel in a guild.",
  category: "channels",
  inputSchema,
  requiresGuild: true,
  permissions: ["ManageChannels"],
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(input.guild_id, token);

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
