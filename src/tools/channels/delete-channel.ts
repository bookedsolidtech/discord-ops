import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult } from "../types.js";

const inputSchema = z.object({
  channel_id: z.string().describe("Channel ID to delete"),
});

export const deleteChannel: ToolDefinition = {
  name: "delete_channel",
  description: "Delete a channel. This is irreversible.",
  category: "channels",
  inputSchema,
  destructive: true,
  permissions: ["ManageChannels"],
  handle: async (input, ctx) => {
    const channel = await ctx.discord.getChannel(input.channel_id);
    const name = channel.name;
    await channel.delete();

    return toolResult(`Deleted channel #${name} (${input.channel_id})`);
  },
};
