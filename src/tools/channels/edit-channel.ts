import { z } from "zod";
import { ChannelType } from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";

const inputSchema = z.object({
  channel_id: z.string().describe("Channel ID to edit"),
  name: z.string().min(1).max(100).optional().describe("New channel name"),
  topic: z.string().max(1024).optional().describe("New channel topic"),
  parent_id: z.string().optional().describe("New category ID"),
});

export const editChannel: ToolDefinition = {
  name: "edit_channel",
  description: "Edit a channel's name, topic, or category.",
  category: "channels",
  inputSchema,
  permissions: ["ManageChannels"],
  handle: async (input, ctx) => {
    const channel = await ctx.discord.getChannel(input.channel_id);

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
