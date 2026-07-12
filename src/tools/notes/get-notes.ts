import { z } from "zod";
import type { MessageReaction } from "discord.js";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";
import { isTimestamp, timestampToSnowflake } from "../../utils/snowflake.js";
import {
  NOTES_CATEGORY,
  RESOLVED_EMOJI,
  boardRoutingFields,
  boardTargetParams,
  parseNoteContent,
  recipientToken,
  resolveBoardChannel,
  sessionToken,
  tagToken,
  type ParsedNote,
} from "./board.js";

const snowflakeOrTimestamp = z.string().transform((val) => {
  if (isTimestamp(val)) return timestampToSnowflake(val);
  if (!/^\d{17,20}$/.test(val)) {
    throw new Error(`Invalid value "${val}": must be a snowflake ID or ISO 8601 timestamp`);
  }
  return val;
});

const inputSchema = z.object({
  to: recipientToken
    .optional()
    .describe(
      "Only notes addressed to this recipient — matches this value OR broadcast (`all`). " +
        "Pass your own session id to read notes meant for you plus everyone.",
    ),
  from: sessionToken.optional().describe("Only notes from this sender/session"),
  tag: tagToken.optional().describe("Only notes carrying this tag"),
  unresolved: z
    .boolean()
    .default(false)
    .describe(`Only notes not yet marked resolved (no ${RESOLVED_EMOJI} reaction)`),
  after: snowflakeOrTimestamp
    .optional()
    .describe("Only notes after this message ID or ISO 8601 timestamp (a resume cursor)"),
  limit: z.number().min(1).max(100).default(50).describe("Board messages to scan (default 50)"),
  ...boardRoutingFields,
});

export const getNotes = defineTool({
  name: "get_notes",
  description:
    "Read the project's note board — the durable log of directed notes. Filter by recipient " +
    "(`to` matches notes for you plus broadcasts), sender, tag, or unresolved-only, and page with " +
    "`after`. This is the FIRST thing an agent should call when starting work on a project: it " +
    "surfaces hand-offs, open requests, and what other sessions have already done. Non-note " +
    "messages in the channel are skipped.",
  category: NOTES_CATEGORY,
  inputSchema,
  handle: async (input, ctx) => {
    const board = resolveBoardChannel(input.project, ctx.config);
    if ("error" in board) return toolResult(board.error, true);

    const target = await resolveTarget(
      boardTargetParams(board.project, board.board, input),
      ctx.config,
      ctx.discord,
    );
    if ("error" in target) return toolResult(target.error, true);

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const fetched = await channel.messages.fetch({
      limit: input.limit,
      ...(input.after ? { after: input.after } : {}),
    });

    const notes: ParsedNote[] = [];
    for (const msg of fetched.values()) {
      const parsed = parseNoteContent(msg.content);
      if (!parsed) continue;

      const reactions = [...(msg.reactions?.cache?.values?.() ?? [])].map((r: MessageReaction) => ({
        emoji: r.emoji.toString(),
        count: r.count,
      }));
      const resolved = reactions.some((r) => r.emoji === RESOLVED_EMOJI);

      // Filters
      if (input.to && parsed.to !== input.to && parsed.to !== "all") continue;
      if (input.from && parsed.from !== input.from) continue;
      if (input.tag && !parsed.tags.includes(input.tag)) continue;
      if (input.unresolved && resolved) continue;

      notes.push({
        id: msg.id,
        to: parsed.to,
        from: parsed.from,
        tags: parsed.tags,
        body: parsed.body,
        resolved,
        reactions,
        reply_to: msg.reference?.messageId ?? null,
        timestamp: msg.createdAt.toISOString(),
      });
    }

    // Oldest-first so the log reads top-to-bottom.
    notes.sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));

    return toolResultJson({
      project: board.project,
      board_channel: input.board_channel ?? board.board,
      channel_id: target.channelId,
      scanned: fetched.size,
      count: notes.length,
      notes,
    });
  },
});
