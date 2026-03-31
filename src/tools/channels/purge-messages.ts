import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  channel_id: snowflakeId.describe("Channel ID to purge messages from"),
  count: z
    .number()
    .min(1)
    .max(100)
    .describe("Number of messages to delete (max 100, must be < 14 days old)"),
  reason: z
    .string()
    .max(512)
    .optional()
    .describe("Reason for purge (not sent to Discord API, logged locally)"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const purgeMessages: ToolDefinition = {
  name: "purge_messages",
  description:
    "Bulk-delete messages from a channel. Messages must be less than 14 days old. Requires ManageMessages permission. This is irreversible.",
  category: "channels",
  inputSchema,
  permissions: ["ManageMessages"],
  destructive: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getChannel(input.channel_id, token);

    if (!("bulkDelete" in channel)) {
      return toolResult("Channel does not support bulk delete", true);
    }

    const deleted = await (channel as any).bulkDelete(input.count, true);

    return toolResultJson({
      channel_id: input.channel_id,
      requested: input.count,
      deleted: deleted.size,
      reason: input.reason ?? null,
    });
  },
};
