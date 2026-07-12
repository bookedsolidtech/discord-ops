import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { isTimestamp, timestampToSnowflake } from "../../utils/snowflake.js";
import { serializeMessage } from "./message-shape.js";

/**
 * Accept either a Discord snowflake ID or an ISO 8601 timestamp.
 * Timestamps are converted to snowflakes automatically.
 */
const snowflakeOrTimestamp = z.string().transform((val) => {
  if (isTimestamp(val)) {
    return timestampToSnowflake(val);
  }
  // Validate as snowflake
  if (!/^\d{17,20}$/.test(val)) {
    throw new Error(`Invalid value "${val}": must be a Discord snowflake ID or ISO 8601 timestamp`);
  }
  return val;
});

const inputSchema = z.object({
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  limit: z.number().min(1).max(100).default(50).describe("Number of messages to fetch (max 100)"),
  before: snowflakeOrTimestamp
    .optional()
    .describe(
      "Get messages before this message ID or ISO 8601 timestamp (e.g. 2025-01-01T00:00:00Z)",
    ),
  after: snowflakeOrTimestamp
    .optional()
    .describe(
      "Get messages after this message ID or ISO 8601 timestamp (e.g. 2025-01-01T00:00:00Z)",
    ),
});

export const getMessages = defineTool({
  name: "get_messages",
  description:
    "Fetch recent messages from a Discord channel. Supports both snowflake IDs and ISO 8601 timestamps for before/after parameters. Each message includes reply_to so reply chains between agents are visible in bulk reads.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);

    const messages = await channel.messages.fetch({
      limit: input.limit,
      ...(input.before ? { before: input.before } : {}),
      ...(input.after ? { after: input.after } : {}),
    });

    const result = [...messages.values()].map((msg) => serializeMessage(msg));

    return toolResultJson({
      channel_id: target.channelId,
      count: result.length,
      messages: result,
    });
  },
});
