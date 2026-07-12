import { z } from "zod";
import { MessageType } from "discord.js";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { serializeMessage } from "./message-shape.js";

const inputSchema = z.object({
  message_id: snowflakeId.describe("ID of the message whose replies to collect"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(100)
    .describe("Number of channel messages to scan for replies (default 100, max 100)"),
  after: snowflakeId
    .optional()
    .describe(
      "Resume cursor: scan messages after this ID instead of message_id. " +
        "Pass last_scanned_id from a previous call to continue scanning newer history.",
    ),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const getReplies = defineTool({
  name: "get_replies",
  description:
    "Find replies to a message you posted earlier — use after send_message to collect responses " +
    "from humans or other agents. Scans up to `limit` messages posted after the original and " +
    "returns those that directly reply to it. If `scanned` hits the limit, more history may " +
    "exist: call again with after=last_scanned_id to continue where the scan stopped.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);

    // A deleted/foreign anchor must be an error, not an empty reply list —
    // callers would otherwise read "nobody replied" from a message that no
    // longer exists.
    const anchor = await channel.messages.fetch(input.message_id).catch(() => undefined);
    if (!anchor) {
      return toolResult(
        `Message ${input.message_id} not found in channel ${target.channelId}`,
        true,
      );
    }

    // Discord's `after` pagination selects the messages immediately following
    // the anchor (oldest-first), so feeding last_scanned_id back as `after`
    // walks history forward without gaps — verified against the live API.
    const fetched = await channel.messages.fetch({
      after: input.after ?? input.message_id,
      limit: input.limit ?? 100,
    });

    const messages = [...fetched.values()];
    // Type gate: system messages (pins, thread starters) also reference the
    // target — only true user replies count.
    const replies = messages
      .filter(
        (msg) => msg.type === MessageType.Reply && msg.reference?.messageId === input.message_id,
      )
      .map((msg) => serializeMessage(msg));

    // Newest scanned ID (max snowflake) — the resume cursor for a follow-up scan.
    const lastScannedId = messages.reduce<string | null>(
      (max, msg) => (max === null || BigInt(msg.id) > BigInt(max) ? msg.id : max),
      null,
    );

    return toolResultJson({
      message_id: input.message_id,
      channel_id: target.channelId,
      scanned: messages.length,
      last_scanned_id: lastScannedId,
      replies,
    });
  },
});
