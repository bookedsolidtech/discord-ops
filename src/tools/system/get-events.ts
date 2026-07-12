import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { ListenEventTypeSchema } from "../../config/schema.js";
import {
  assertSafeSinkPath,
  isSinkActive,
  readSinkFile,
  resolveListenConfig,
  rotatedPath,
  type SinkEvent,
} from "../../utils/event-sink.js";

const inputSchema = z.object({
  project: z.string().optional().describe("Filter to events from this project"),
  channel: z.string().optional().describe("Filter to events from this channel alias"),
  channel_id: snowflakeId.optional().describe("Filter to events from this channel ID"),
  types: z
    .array(ListenEventTypeSchema)
    .optional()
    .describe("Filter to these event types (e.g. message_create, reaction_add)"),
  after: z
    .union([z.string(), z.number()])
    .optional()
    .describe(
      "Resume cursor: last seq consumed. Only events with a greater seq are returned, " +
        "oldest-first. Pass last_seq from a previous call to consume incrementally. " +
        "Omit to get the newest events plus a starting cursor.",
    ),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(50)
    .describe("Max events to return (default 50, max 100)"),
});

export const getEvents = defineTool({
  name: "get_events",
  description:
    "Real-time local event feed written by `discord-ops listen` — reads normalized gateway " +
    "events (messages, reactions) from the local sink file with zero Discord API calls per " +
    "poll. Pass after=last_seq from the previous call to consume new events incrementally. " +
    "The sink is a fast cache, not the source of truth — Discord channel history stays " +
    "authoritative. When sink_active is false the listener sidecar isn't running, so fall " +
    "back to get_messages.",
  category: "system",
  inputSchema,
  handle: async (input, ctx) => {
    const listenCfg = resolveListenConfig(ctx.config);
    const sink = listenCfg.sink;

    // The sink path comes from operator config (never caller input), but guard
    // it anyway: a symlinked or traversal sink would let this tool surface an
    // arbitrary file's contents as "events".
    try {
      assertSafeSinkPath(sink);
    } catch (err) {
      return toolResult(err instanceof Error ? err.message : String(err), true);
    }

    const after = input.after === undefined ? undefined : Number(input.after);
    if (after !== undefined && !Number.isFinite(after)) {
      return toolResult(`Invalid after cursor: "${input.after}" is not a number`, true);
    }

    const active = readSinkFile(sink);

    // Pull in the rotated file only when it is actually needed: the active sink
    // is empty (so any history lives in the rotated file), OR a cursor predates
    // the active sink's oldest event. A no-cursor tail read over a non-empty
    // active sink must NOT prepend the rotated file — tail mode returns the
    // NEWEST events, and the rotated file is older; including it would replay
    // stale events right after a rotation.
    let all = active;
    const minActiveSeq = active.length > 0 ? active[0].seq : undefined;
    if (minActiveSeq === undefined || (after !== undefined && after < minActiveSeq - 1)) {
      const rotated = readSinkFile(rotatedPath(sink));
      if (rotated.length > 0) all = [...rotated, ...active];
    }

    const matches = (e: SinkEvent): boolean =>
      (!input.project || e.project === input.project) &&
      (!input.channel || e.channel === input.channel) &&
      (!input.channel_id || e.channel_id === input.channel_id) &&
      (!input.types || input.types.includes(e.type));

    const limit = input.limit ?? 50;
    let events: SinkEvent[];
    let scanned: number;
    let lastSeq: number | null;

    if (after !== undefined) {
      // Forward walk from the cursor, oldest-first, stopping once `limit`
      // matches are collected — resuming with after=last_seq never skips events.
      events = [];
      scanned = 0;
      lastSeq = after;
      for (const e of all) {
        if (e.seq <= after) continue;
        scanned++;
        lastSeq = e.seq;
        if (matches(e)) {
          events.push(e);
          if (events.length >= limit) break;
        }
      }
    } else {
      // No cursor: return the newest matching events (tail) plus the max seq
      // so the caller can start polling forward from "now".
      scanned = all.length;
      events = all.filter(matches).slice(-limit);
      lastSeq = all.length > 0 ? all[all.length - 1].seq : null;
    }

    return toolResultJson({
      events,
      scanned,
      last_seq: lastSeq,
      sink_active: isSinkActive(sink),
    });
  },
});
