import { z } from "zod";
import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import type { LoadedConfig } from "../../config/index.js";
import { resolveProject, getDefaultProjectName } from "../../config/profiles.js";
import { snowflakeId } from "../schema.js";

/**
 * The project note board — a durable, directed-note log that lives in ONE
 * channel per project. Agents post notes addressed to a recipient (a session,
 * a role/name, or `all`), read the board on startup to catch up, and mark
 * notes resolved. Multiple concurrent sessions on the same project share the
 * board (same project → same channel) and identify themselves with a session
 * id so they can see who else is active and what is still open.
 */

export const NOTES_CATEGORY = "notes" as const;

/** Marker prefix on the first line of a board message that is a note. */
export const NOTE_MARKER = "📋 note";

/** Reaction that marks a note resolved/handled. */
export const RESOLVED_EMOJI = "✅";

/**
 * A recipient, sender, or tag token. Constrained to no-whitespace so the note
 * header stays unambiguously parseable while remaining human-readable.
 */
const noteToken = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Must be a single token: letters, digits, . _ : -");

export const recipientToken = noteToken.describe(
  'Recipient: "all" (broadcast), a session id, or a role/name — single token, no spaces',
);
export const sessionToken = noteToken.describe(
  "Session id of the sender — single token, no spaces. STRONGLY RECOMMENDED to pass this " +
    "explicitly (or set DISCORD_OPS_SESSION per session). If omitted, an id is auto-derived from " +
    "the process; in a shared `serve` deployment that collapses concurrent sessions into one, so " +
    "pass a distinct id per agent/session there. Keep it stable within a session.",
);
export const tagToken = noteToken;

/**
 * Resolve the board channel ALIAS (or id) for a project. Chain:
 *   1. project.board_channel (explicit)
 *   2. a "board" / "agent-board" channel alias
 *   3. an "agent-logs" alias
 *   4. a "backchannel" alias
 *   5. default_channel
 * Returns the alias/id to hand to resolveTarget, or an error string.
 */
export function resolveBoardChannel(
  projectName: string | undefined,
  config: LoadedConfig,
  hasOverride = false,
): { project: string; board: string } | { error: string } {
  const name = projectName ?? getDefaultProjectName(config.global, config.perProject);
  if (!name) {
    // A direct channel_id/board_channel override routes on its own, so it does
    // not need a project or default project at all.
    if (hasOverride) return { project: "", board: "" };
    return { error: "No project specified and no default project configured." };
  }
  const project = resolveProject(name, config.global, config.perProject);
  if (!project) {
    if (hasOverride) return { project: projectName ? name : "", board: "" };
    return { error: `Project "${name}" not found in config.` };
  }
  const has = (alias: string) => alias in project.channels;
  const board =
    project.boardChannel ??
    (has("board")
      ? "board"
      : has("agent-board")
        ? "agent-board"
        : has("agent-logs")
          ? "agent-logs"
          : has("backchannel")
            ? "backchannel"
            : project.defaultChannel);
  // A caller-supplied channel_id/board_channel override wins in
  // boardTargetParams, so a project without a configured board is fine then.
  if (!board && !hasOverride) {
    return {
      error:
        `Project "${name}" has no board channel. Set board_channel in its config, ` +
        "or add a board / agent-logs / backchannel channel alias, or a default_channel.",
    };
  }
  return { project: name, board: board ?? "" };
}

/**
 * Session id to use when the caller does not supply `from`.
 *
 * Precedence:
 *  1. DISCORD_OPS_SESSION env var — the reliable per-session mechanism. Set it
 *     per session (each agent process / each shell) so notes are attributable.
 *  2. An auto id derived from the working directory + pid + a random suffix.
 *
 * IMPORTANT: the auto id identifies THIS PROCESS, not the caller. It is correct
 * for the common one-process-per-session case (a stdio MCP server, a CLI run),
 * where every note legitimately comes from the same session. In a SHARED
 * deployment — `discord-ops serve` fronting multiple agents from one process —
 * all callers that omit `from` would share this one id and collapse into a
 * single apparent session. Those deployments MUST pass `from` explicitly (or
 * set DISCORD_OPS_SESSION per session). The pid is included so the id is
 * honestly a process instance, and distinct processes never collide.
 */
const SESSION_TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
let cachedSessionId: string | undefined;
export function defaultSessionId(): string {
  // Honor DISCORD_OPS_SESSION only when it satisfies the same single-token
  // rules as `from`; a malformed value (spaces, slashes) would corrupt the
  // note header, so fall through to the auto id instead of trusting it.
  const fromEnv = process.env.DISCORD_OPS_SESSION?.trim();
  if (fromEnv && SESSION_TOKEN_RE.test(fromEnv)) return fromEnv.slice(0, 64);
  if (cachedSessionId) return cachedSessionId;
  const dir = basename(process.cwd()).replace(/[^A-Za-z0-9._-]/g, "") || "session";
  const suffix = randomBytes(3).toString("hex");
  cachedSessionId = `${dir}-${process.pid}-${suffix}`.slice(0, 64);
  return cachedSessionId;
}

export interface ParsedNote {
  id: string;
  to: string;
  from: string;
  tags: string[];
  body: string;
  resolved: boolean;
  reactions: { emoji: string; count: number }[];
  reply_to: string | null;
  timestamp: string;
}

/** Encode a note into the board message content (raw text, machine-parseable). */
export function encodeNote(opts: {
  to: string;
  from: string;
  tags: string[];
  body: string;
}): string {
  const tagPart = opts.tags.length ? ` tags:${opts.tags.join(",")}` : "";
  return `${NOTE_MARKER} to:${opts.to} from:${opts.from}${tagPart}\n${opts.body}`;
}

const HEADER_RE = new RegExp(
  `^${NOTE_MARKER} to:(\\S+) from:(\\S+)(?: tags:(\\S+))?\\s*\\n?([\\s\\S]*)$`,
);

/**
 * Parse a board message's content back into a note. Returns undefined when the
 * message is not a note (no marker), so get_notes can skip human chatter that
 * shares the board channel.
 */
export function parseNoteContent(
  content: string,
): { to: string; from: string; tags: string[]; body: string } | undefined {
  const m = HEADER_RE.exec(content);
  if (!m) return undefined;
  return {
    to: m[1],
    from: m[2],
    tags: m[3] ? m[3].split(",").filter(Boolean) : [],
    body: (m[4] ?? "").trim(),
  };
}

/** Routing fields shared by the note tools (project-first, but id overrides allowed). */
export const boardRoutingFields = {
  project: z
    .string()
    .optional()
    .describe("Project whose board to use (defaults to default project)"),
  board_channel: z
    .string()
    .optional()
    .describe("Override the resolved board channel (alias or id) for this call"),
  channel_id: snowflakeId.optional().describe("Direct board channel ID override"),
};

/**
 * Build resolveTarget params for a board, routing a raw snowflake as a direct
 * channel_id and an alias as `channel`. Precedence: an explicit channel_id
 * override wins, then an explicit board_channel override, then the resolved
 * board value (which itself may be a snowflake from `board_channel` config or
 * an alias from the fallback chain). Without this, a snowflake board is
 * mistakenly looked up as a channel alias and never resolves.
 */
export function boardTargetParams(
  project: string,
  board: string,
  input: { board_channel?: string; channel_id?: string },
): { project: string; channel?: string; channel_id?: string } {
  const raw = input.channel_id ?? input.board_channel ?? board;
  return /^\d{17,20}$/.test(raw) ? { project, channel_id: raw } : { project, channel: raw };
}
