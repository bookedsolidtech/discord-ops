import { z } from "zod";
import { ChannelType } from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  channel_id: snowflakeId.describe("Channel ID to edit"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
  name: z.string().min(1).max(100).optional().describe("New channel name"),
  topic: z.string().max(1024).optional().describe("New channel topic"),
  parent_id: snowflakeId.optional().describe("New category ID"),
});

export const editChannel: ToolDefinition = {
  name: "edit_channel",
  description: "Edit a channel's name, topic, or category.",
  category: "channels",
  inputSchema,
  permissions: ["ManageChannels"],
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getChannel(input.channel_id, token);

    const edited = await channel.edit({
      ...(input.name ? { name: input.name } : {}),
      ...(input.topic !== undefined ? { topic: input.topic } : {}),
      ...(input.parent_id ? { parent: input.parent_id } : {}),
    });

    return toolResultJson({
      id: edited.id,
      name: edited.name,
      type: ChannelType[edited.type],
      topic: "topic" in edited ? edited.topic : null,
      parent_id: edited.parentId,
    });
  },
};
