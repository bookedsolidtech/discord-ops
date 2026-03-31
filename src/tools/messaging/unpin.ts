import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  channel_id: snowflakeId.describe("Channel containing the message to unpin"),
  message_id: snowflakeId.describe("Message ID to unpin"),
  project: z.string().optional().describe("Project name for token resolution"),
});

export const unpinMessage: ToolDefinition = {
  name: "unpin_message",
  description: "Unpin a message from a Discord channel.",
  category: "messaging",
  inputSchema,
  permissions: ["ManageMessages"],
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getChannel(input.channel_id, token);
    const message = await channel.messages.fetch(input.message_id);
    await message.unpin();
    return toolResult(`Unpinned message ${input.message_id} from #${channel.name}`);
  },
};
