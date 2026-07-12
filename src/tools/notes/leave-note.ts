import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";
import {
  NOTES_CATEGORY,
  boardRoutingFields,
  defaultSessionId,
  encodeNote,
  recipientToken,
  resolveBoardChannel,
  sessionToken,
  tagToken,
} from "./board.js";

const inputSchema = z.object({
  body: z.string().min(1).max(1800).describe("The note text — what you want the recipient to know"),
  to: recipientToken.default("all"),
  from: sessionToken
    .optional()
    .describe("Your session id (defaults to DISCORD_OPS_SESSION env or an auto-derived id)"),
  tags: z
    .array(tagToken)
    .max(10)
    .optional()
    .describe("Labels for filtering — e.g. topic, status, or work-stream"),
  ...boardRoutingFields,
});

export const leaveNote = defineTool({
  name: "leave_note",
  description:
    "Leave a directed note on the project's shared board — a durable log other agents and future " +
    "sessions read. Address it with `to` (a session id, a role/name, or `all` to broadcast) and " +
    "tag it for filtering. Notes persist as channel history: this is where an agent records what " +
    "it did, what it needs, and hand-offs for whoever picks the work up next. Pair with get_notes " +
    "(read) and resolve_note (mark handled).",
  category: NOTES_CATEGORY,
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

    const from = input.from ?? defaultSessionId();
    const tags = input.tags ?? [];
    const content = encodeNote({ to: input.to, from, tags, body: input.body });

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const message = await channel.send({ content });

    return toolResultJson({
      id: message.id,
      message_id: message.id,
      channel_id: target.channelId,
      project: board.project,
      board_channel: input.board_channel ?? board.board,
      to: input.to,
      from,
      tags,
    });
  },
});
