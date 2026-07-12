import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";
import {
  NOTES_CATEGORY,
  boardRoutingFields,
  boardTargetParams,
  parseNoteContent,
  resolveBoardChannel,
} from "./board.js";

const inputSchema = z.object({
  within_minutes: z
    .number()
    .min(1)
    .max(1440)
    .default(60)
    .describe("Consider a session active if it posted a note within this window (default 60)"),
  limit: z.number().min(1).max(100).default(100).describe("Board messages to scan (default 100)"),
  ...boardRoutingFields,
});

export const listSessions = defineTool({
  name: "list_sessions",
  description:
    "List the sessions recently active on a project's board — derived from who has posted notes " +
    "and when. Call this on startup to see whether other sessions are already working the same " +
    "project (so you don't duplicate their work) and to know who you can address notes to. " +
    "Presence comes from note activity; there is no separate heartbeat to maintain.",
  category: NOTES_CATEGORY,
  inputSchema,
  handle: async (input, ctx) => {
    const board = resolveBoardChannel(
      input.project,
      ctx.config,
      Boolean(input.channel_id ?? input.board_channel),
    );
    if ("error" in board) return toolResult(board.error, true);

    const target = await resolveTarget(
      boardTargetParams(board.project, board.board, input),
      ctx.config,
      ctx.discord,
    );
    if ("error" in target) return toolResult(target.error, true);

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const fetched = await channel.messages.fetch({ limit: input.limit });

    const cutoff = Date.now() - input.within_minutes * 60_000;
    const sessions = new Map<string, { last_seen: string; note_count: number; active: boolean }>();

    for (const msg of fetched.values()) {
      const parsed = parseNoteContent(msg.content);
      if (!parsed) continue;
      const ts = msg.createdAt.toISOString();
      const existing = sessions.get(parsed.from);
      if (!existing) {
        sessions.set(parsed.from, {
          last_seen: ts,
          note_count: 1,
          active: msg.createdAt.getTime() >= cutoff,
        });
      } else {
        existing.note_count += 1;
        if (ts > existing.last_seen) existing.last_seen = ts;
        if (msg.createdAt.getTime() >= cutoff) existing.active = true;
      }
    }

    const list = [...sessions.entries()]
      .map(([session, v]) => ({ session, ...v }))
      .sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));

    return toolResultJson({
      project: board.project,
      board_channel: input.board_channel ?? board.board,
      channel_id: target.channelId,
      window_minutes: input.within_minutes,
      active_count: list.filter((s) => s.active).length,
      sessions: list,
    });
  },
});
