import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";
import { snowflakeId } from "../schema.js";
import { fetchMessageOrError } from "../messaging/message-shape.js";
import {
  NOTES_CATEGORY,
  RESOLVED_EMOJI,
  boardRoutingFields,
  defaultSessionId,
  encodeNote,
  parseNoteContent,
  resolveBoardChannel,
  sessionToken,
} from "./board.js";

const inputSchema = z.object({
  note_id: snowflakeId.describe("Message id of the note to resolve (from leave_note/get_notes)"),
  reply: z
    .string()
    .max(1800)
    .optional()
    .describe("Optional reply posted as a follow-up note, linked to the resolved note"),
  from: sessionToken
    .optional()
    .describe("Your session id for the reply (defaults as in leave_note)"),
  ...boardRoutingFields,
});

export const resolveNote = defineTool({
  name: "resolve_note",
  description:
    `Mark a board note handled by adding a ${RESOLVED_EMOJI} reaction — get_notes({ unresolved: true }) ` +
    "then hides it from the open list. Optionally attach a reply note so the log records the " +
    "outcome and who closed it. Use this to close hand-offs and requests instead of leaving them " +
    "to pile up.",
  category: NOTES_CATEGORY,
  destructive: false,
  inputSchema,
  handle: async (input, ctx) => {
    const board = resolveBoardChannel(input.project, ctx.config);
    if ("error" in board) return toolResult(board.error, true);

    const target = await resolveTarget(
      {
        project: board.project,
        channel: input.board_channel ?? board.board,
        channel_id: input.channel_id,
      },
      ctx.config,
      ctx.discord,
    );
    if ("error" in target) return toolResult(target.error, true);

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const fetched = await fetchMessageOrError(channel, input.note_id, target.channelId);
    if ("error" in fetched) return toolResult(fetched.error, true);

    await fetched.message.react(RESOLVED_EMOJI);

    let replyId: string | undefined;
    if (input.reply) {
      const original = parseNoteContent(fetched.message.content);
      const from = input.from ?? defaultSessionId();
      // Reply is addressed back to the original sender, tagged resolved.
      const content = encodeNote({
        to: original?.from ?? "all",
        from,
        tags: ["resolved"],
        body: input.reply,
      });
      const replyMsg = await channel.send({ content, reply: { messageReference: input.note_id } });
      replyId = replyMsg.id;
    }

    return toolResultJson({
      note_id: input.note_id,
      resolved: true,
      channel_id: target.channelId,
      project: board.project,
      ...(replyId ? { reply_id: replyId } : {}),
    });
  },
});
