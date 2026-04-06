import { z } from "zod";
import { defineTool, toolResult } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  channel_id: snowflakeId.describe("Channel containing the message to pin"),
  message_id: snowflakeId.describe("Message ID to pin"),
  project: z.string().optional().describe("Project name for token resolution"),
});

export const pinMessage = defineTool({
  name: "pin_message",
  description: "Pin a message in a Discord channel. Channels can have up to 50 pinned messages.",
  category: "messaging",
  inputSchema,
  permissions: ["ManageMessages"],
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getChannel(input.channel_id, token);
    const message = await channel.messages.fetch(input.message_id);
    await message.pin();
    return toolResult(`Pinned message ${input.message_id} in #${channel.name}`);
  },
});
