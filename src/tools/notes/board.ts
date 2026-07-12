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
  "Session id of the sender — single token, no spaces. Omit to use the DISCORD_OPS_SESSION " +
    "env var, or an id auto-derived from the working directory. Keep it stable within a session.",
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
): { project: string; board: string } | { error: string } {
  const name = projectName ?? getDefaultProjectName(config.global, config.perProject);
  if (!name) {
    return { error: "No project specified and no default project configured." };
  }
  const project = resolveProject(name, config.global, config.perProject);
  if (!project) {
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
  if (!board) {
    return {
      error:
        `Project "${name}" has no board channel. Set board_channel in its config, ` +
        "or add a board / agent-logs / backchannel channel alias, or a default_channel.",
    };
  }
  return { project: name, board };
}

/**
 * Derive a stable-per-process session id when the caller doesn't supply one.
 * Prefers the DISCORD_OPS_SESSION env var (the reliable mechanism across CLI
 * invocations and concurrent sessions); otherwise generates one from the
 * working-directory basename plus a short random suffix, cached for the
 * lifetime of this process so every note from one MCP server shares it.
 */
let cachedSessionId: string | undefined;
export function defaultSessionId(): string {
  const fromEnv = process.env.DISCORD_OPS_SESSION;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim().slice(0, 64);
  if (cachedSessionId) return cachedSessionId;
  const dir = basename(process.cwd()).replace(/[^A-Za-z0-9._-]/g, "") || "session";
  const suffix = randomBytes(3).toString("hex");
  cachedSessionId = `${dir}-${suffix}`.slice(0, 64);
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
