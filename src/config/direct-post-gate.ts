import type { ToolContext } from "../tools/types.js";
import { getTokenForProject } from "./index.js";
import { getDefaultProjectName } from "./profiles.js";
import type { ProjectConfig } from "./schema.js";
import { resolveBoardChannel } from "../tools/notes/board.js";

/**
 * Tools that put a message in a channel directly. When a project sets
 * `posts.require_approval`, these refuse for that project's guild so every
 * post goes through the posting kit (preview_post → ✅ → publish_post, or
 * send_post for posts.auto_types). Enforced centrally by the server, before
 * the tool runs, so it holds for every routing form (project + alias,
 * channel_id, default project, webhook id).
 *
 * Not routed through tool profiles: the "full" profile short-circuits and
 * would never see this.
 */
export const DIRECT_POST_TOOLS = new Set([
  "send_message",
  "send_as",
  "send_embed",
  "send_template",
  "execute_webhook",
  "send_poll",
  "forward_message",
  "create_forum_post",
  "create_thread",
  "edit_message",
  "pin_message",
  // Board and owner-ping tools post caller text too. Notes stay allowed on a
  // project's explicitly configured board_channel (the agents' own channel).
  "leave_note",
  "resolve_note",
  "notify_owners",
]);

const NOTE_TOOLS = new Set(["leave_note", "resolve_note"]);

type Params = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function tokenFor(project: string | undefined, ctx: ToolContext): string | undefined {
  if (!project || !ctx.config.global.projects[project]) return undefined;
  try {
    return getTokenForProject(project, ctx.config);
  } catch {
    return undefined;
  }
}

/** Guild ids a channel id belongs to, from config first, else from Discord. */
async function guildsForChannel(
  channelId: string,
  project: string | undefined,
  ctx: ToolContext,
): Promise<Set<string> | "unknown"> {
  const fromConfig = new Set<string>();
  for (const p of Object.values(ctx.config.global.projects)) {
    for (const value of Object.values(p.channels)) {
      const id = typeof value === "string" ? value : value.id;
      if (id === channelId) fromConfig.add(p.guild_id);
    }
  }
  if (fromConfig.size > 0) return fromConfig;
  try {
    // Raw fetch (not getAnyChannel, which rejects guildless channels) so a
    // confirmed DM resolves to "no guild" instead of an unknown destination.
    const client = await ctx.discord.getClient(tokenFor(project, ctx));
    const channel = (await client.channels.fetch(channelId)) as {
      guildId?: string | null;
      guild?: { id: string } | null;
      isDMBased?: () => boolean;
    } | null;
    if (!channel) return "unknown";
    const guildId = channel.guildId ?? channel.guild?.id;
    if (guildId) return new Set([guildId]);
    return typeof channel.isDMBased === "function" && channel.isDMBased() ? new Set() : "unknown";
  } catch {
    return "unknown";
  }
}

interface Destination {
  guilds: Set<string> | "unknown";
  /** The destination channel id, when known (used for the board exemption). */
  channelId?: string;
}

function aliasOrId(project: ProjectConfig | undefined, value: string): string | undefined {
  if (/^\d{17,20}$/.test(value)) return value;
  const entry = project?.channels[value];
  return entry === undefined ? undefined : typeof entry === "string" ? entry : entry.id;
}

/** The guild(s) a direct-post call would post into, or "unknown". */
async function destination(
  toolName: string,
  parsed: Params,
  ctx: ToolContext,
): Promise<Destination> {
  const project = str(parsed.project);

  if (toolName === "execute_webhook") {
    const webhookId = str(parsed.webhook_id);
    if (!webhookId) return { guilds: "unknown" };
    try {
      const client = await ctx.discord.getClient(tokenFor(project, ctx));
      const webhook = (await client.fetchWebhook(webhookId)) as { guildId?: string | null };
      return { guilds: webhook.guildId ? new Set([webhook.guildId]) : "unknown" };
    } catch {
      return { guilds: "unknown" };
    }
  }

  const projectName = project ?? getDefaultProjectName(ctx.config.global, ctx.config.perProject);
  const config = projectName ? ctx.config.global.projects[projectName] : undefined;

  // forward_message posts into its destination, not its source; notes go to
  // a board override or the project's resolved board.
  let channelId =
    toolName === "forward_message" ? str(parsed.to_channel_id) : str(parsed.channel_id);
  if (!channelId && NOTE_TOOLS.has(toolName)) {
    const override = str(parsed.board_channel);
    if (override) {
      channelId = aliasOrId(config, override);
      if (!channelId) return { guilds: "unknown" };
    } else {
      const board = resolveBoardChannel(projectName, ctx.config);
      channelId = "board" in board && board.board ? aliasOrId(config, board.board) : undefined;
    }
  }
  if (channelId) {
    // Notes resolve their project (and token) like the note handler does.
    const tokenProject = NOTE_TOOLS.has(toolName) ? projectName : project;
    return { guilds: await guildsForChannel(channelId, tokenProject, ctx), channelId };
  }

  // Alias / notification / default-channel routing resolves within a project.
  return { guilds: config ? new Set([config.guild_id]) : new Set() };
}

/**
 * Returns the refusal text when a direct-post tool targets a guild whose
 * project sets posts.require_approval, or undefined to let the call run.
 * Fails closed: if a project requires approval and the destination cannot be
 * determined, the call is refused.
 */
export async function directPostGateError(
  toolName: string,
  parsed: Params,
  ctx: ToolContext,
): Promise<string | undefined> {
  if (!DIRECT_POST_TOOLS.has(toolName)) return undefined;
  // create_thread only posts with a starter message; resolve_note only with a
  // reply. Same truthiness as the handlers (a whitespace-only string still posts).
  if (toolName === "create_thread" && !str(parsed.initial_message)) return undefined;
  if (toolName === "resolve_note" && !str(parsed.reply)) return undefined;

  const gated = Object.entries(ctx.config.global.projects).filter(
    ([, p]) => p.posts?.require_approval === true,
  );
  if (gated.length === 0) return undefined;

  const pointer =
    "Post through the posting kit instead: preview_post, an approver's ✅ on the preview, then " +
    "publish_post (or send_post for types in posts.auto_types).";
  const dest = await destination(toolName, parsed, ctx);
  const guilds = dest.guilds;
  if (guilds === "unknown") {
    return (
      `${toolName} is blocked: posts.require_approval is set for project(s) ` +
      `${gated.map(([name]) => `"${name}"`).join(", ")} and this call's destination guild could not be ` +
      `determined. ${pointer}`
    );
  }
  const hit = gated.find(([, p]) => guilds.has(p.guild_id));
  if (!hit) return undefined;
  // Notes may still go to an explicitly configured board of a gated project in
  // that guild (projects sharing a guild can each have their own board).
  if (NOTE_TOOLS.has(toolName) && dest.channelId) {
    const isBoard = gated.some(
      ([, p]) =>
        guilds.has(p.guild_id) &&
        p.board_channel !== undefined &&
        aliasOrId(p, p.board_channel) === dest.channelId,
    );
    if (isBoard) return undefined;
  }
  return (
    `${toolName} is blocked: project "${hit[0]}" sets posts.require_approval, so nothing posts there ` +
    `directly. ${pointer}`
  );
}
