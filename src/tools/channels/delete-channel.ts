import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  channel_id: snowflakeId.describe("Channel ID to delete"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const deleteChannel: ToolDefinition = {
  name: "delete_channel",
  description: "Delete a channel. This is irreversible.",
  category: "channels",
  inputSchema,
  destructive: true,
  permissions: ["ManageChannels"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getAnyChannel(input.channel_id, token);
    const name = channel.name;
    await channel.delete();

    return toolResult(`Deleted channel #${name} (${input.channel_id})`);
  },
};
