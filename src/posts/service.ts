import { ChannelType, type APIEmbed } from "discord.js";
import type { ToolContext } from "../tools/types.js";
import type { ProjectConfig } from "../config/schema.js";
import { getTokenForBot, getTokenForProject } from "../config/index.js";
import { asForumChannel, resolveTagNames } from "../tools/forums/forum-shared.js";
import { findPreset, resolvePostsConfig, type ResolvedPostsConfig } from "../config/personas.js";
import { profileGateError } from "../config/tool-gate.js";
import { resolveTarget } from "../routing/resolver.js";
import { isPublicHttpUrl } from "../utils/og-fetch.js";
import {
  NO_WEBHOOK_CHANNEL_ERROR,
  ensurePersonaWebhook,
  supportsWebhooks,
} from "../tools/personas/persona-webhook.js";
import { PostValidationError, parsePost, youtubeVideoId, type Post } from "./schema.js";
import {
  isCountingCubes,
  isUnavailableTitle,
  payloadSha256,
  renderPost,
  type OgSnapshot,
  type PresetRef,
} from "./render.js";
import { fetchYoutubeVideoInfo } from "./youtube.js";
import type { PostPayload } from "./ledger.js";

/**
 * Shared plumbing for the posting-kit tools: project/preset/channel
 * resolution, video metadata for video_upload, payload hashing, and posting
 * as a persona through the channel's persona webhook.
 */

export interface ProjectRef {
  name: string;
  config: ProjectConfig;
  posts: ResolvedPostsConfig;
}

export function getProject(ctx: ToolContext, projectName: string): ProjectRef {
  const config = ctx.config.global.projects[projectName];
  if (!config) throw new PostValidationError(`Project "${projectName}" not found in config`);
  return { name: projectName, config, posts: resolvePostsConfig(config) };
}

export function resolvePresetOrThrow(project: ProjectRef, persona: string): PresetRef {
  const matched = findPreset(project.config, persona);
  if (!matched) {
    const keys = Object.keys(project.config.personas ?? {});
    throw new PostValidationError(
      `Persona "${persona}" is not a persona preset in project "${project.name}". ` +
        (keys.length
          ? `Configured presets: ${keys.join(", ")}.`
          : "Add presets under the project's `personas` config."),
    );
  }
  return matched;
}

/**
 * Resolves an exact configured alias (no fuzzy or live-name matching) and
 * enforces the tool profile of the bot that serves that channel. The server's
 * runtime gate only sees a top-level `channel`; posting-kit destinations come
 * from nested posts, presets, preview config, or the ledger, so they are
 * gated here.
 */
export async function resolveAliasOrThrow(
  ctx: ToolContext,
  project: ProjectRef,
  alias: string,
  role: string,
  toolName: string,
): Promise<{ channelId: string; token?: string }> {
  if (!Object.prototype.hasOwnProperty.call(project.config.channels, alias)) {
    throw new PostValidationError(
      `${role} "${alias}" is not a configured channel alias in project "${project.name}" ` +
        `(aliases: ${Object.keys(project.config.channels).join(", ") || "none"})`,
    );
  }
  const gate = profileGateError(toolName, project.name, alias, ctx.config);
  if (gate) throw new PostValidationError(`${gate} (${role.toLowerCase()} "${alias}")`);
  const target = await resolveTarget(
    { project: project.name, channel: alias },
    ctx.config,
    ctx.discord,
  );
  if ("error" in target) throw new PostValidationError(target.error);
  return { channelId: target.channelId, token: target.token };
}

/** Looks up a video_upload's metadata (title, thumbnail, uploader) via YouTube oEmbed. */
export async function fetchVideoInfo(post: Post): Promise<OgSnapshot | undefined> {
  if (post.type !== "video_upload") return undefined;
  return fetchYoutubeVideoInfo(youtubeVideoId(post.url) ?? "");
}

export interface PostTarget {
  /** Shown in the preview header: "#alias" or "<#id>". */
  label: string;
  channelId: string;
  token?: string;
}

/**
 * Resolves where a post goes: `channel` (exact alias), `channel_id` (must be
 * in the project's guild), or the persona preset's default_channel. Applies
 * the profile gate of the bot serving the destination.
 */
export async function resolvePostTarget(
  ctx: ToolContext,
  project: ProjectRef,
  post: Post,
  preset: PresetRef,
  toolName: string,
): Promise<PostTarget> {
  if (post.channel !== undefined && post.channel_id !== undefined) {
    throw new PostValidationError("Give the post a channel alias or a channel_id, not both");
  }
  // A channel_id that is a configured alias routes exactly like that alias
  // (same bot override, token, and profile gate).
  const configuredAlias =
    post.channel_id === undefined
      ? undefined
      : Object.entries(project.config.channels).find(
          ([, value]) => (typeof value === "string" ? value : value.id) === post.channel_id,
        )?.[0];
  if (configuredAlias !== undefined) {
    const resolved = await resolveAliasOrThrow(
      ctx,
      project,
      configuredAlias,
      "Target channel",
      toolName,
    );
    return { label: `#${configuredAlias}`, ...resolved };
  }
  if (post.channel_id !== undefined) {
    const token = getTokenForProject(project.name, ctx.config);
    // Discover the channel with the project bot, then with any channel
    // override bot — a thread may be visible only to its parent's bot.
    const tokens = [token];
    for (const value of Object.values(project.config.channels)) {
      if (typeof value === "object" && value.bot) {
        try {
          tokens.push(getTokenForBot(value.bot, ctx.config));
        } catch {
          // that bot's token is unset — skip it
        }
      }
    }
    let channel:
      | { guildId?: string; guild?: { id: string } | null; parentId?: string | null }
      | undefined;
    for (const candidate of [...new Set(tokens)]) {
      try {
        channel = await ctx.discord.getAnyChannel(post.channel_id, candidate);
        break;
      } catch {
        // try the next bot
      }
    }
    if (!channel) {
      throw new PostValidationError(`Channel ${post.channel_id} could not be fetched`);
    }
    const guildId = channel.guildId ?? channel.guild?.id;
    if (guildId !== project.config.guild_id) {
      throw new PostValidationError(
        `Channel ${post.channel_id} is not in project "${project.name}"'s guild`,
      );
    }
    // A thread under a configured channel routes like that channel (its bot
    // override's token and profile); anything else uses the project bot.
    // Only threads inherit: for an ordinary channel, parentId is its category.
    const isThread =
      typeof (channel as { isThread?: () => boolean }).isThread === "function" &&
      (channel as { isThread: () => boolean }).isThread();
    const parentAlias =
      isThread && channel.parentId
        ? Object.entries(project.config.channels).find(
            ([, value]) => (typeof value === "string" ? value : value.id) === channel.parentId,
          )?.[0]
        : undefined;
    if (parentAlias !== undefined) {
      const parent = await resolveAliasOrThrow(
        ctx,
        project,
        parentAlias,
        "Target channel",
        toolName,
      );
      return { label: `<#${post.channel_id}>`, channelId: post.channel_id, token: parent.token };
    }
    const gate = profileGateError(toolName, project.name, undefined, ctx.config);
    if (gate) throw new PostValidationError(gate);
    return { label: `<#${post.channel_id}>`, channelId: post.channel_id, token };
  }
  const alias = post.channel ?? preset.preset.default_channel;
  if (!alias) {
    throw new PostValidationError(
      `Post has no channel or channel_id and persona preset "${preset.key}" has no default_channel`,
    );
  }
  const resolved = await resolveAliasOrThrow(ctx, project, alias, "Target channel", toolName);
  return { label: `#${alias}`, ...resolved };
}

export interface PreparedPost {
  post: Post;
  preset: PresetRef;
  target: PostTarget;
  og: OgSnapshot | undefined;
  payload: PostPayload;
  sha256: string;
  /** Counting Cubes content: always needs a ✅, never send_post. */
  countingCubes: boolean;
}

export function buildPayload(
  post: Post,
  preset: PresetRef,
  targetChannelId: string,
  og: OgSnapshot | undefined,
): { payload: PostPayload; sha256: string } {
  const rendered = renderPost(post, preset, { og });
  const payload: PostPayload = {
    type: post.type,
    target_channel_id: targetChannelId,
    username: preset.preset.name,
    avatar_url: preset.preset.avatar_url ?? null,
    content: rendered.content ?? null,
    embeds: rendered.embeds as Array<Record<string, unknown>>,
    pin: post.pin === true,
    thread_name: rendered.thread?.name ?? null,
    tags: rendered.thread?.tags ?? [],
  };
  return { payload, sha256: payloadSha256(payload) };
}

/** Fetches a forum target and resolves tag names; refuses a non-forum target. */
async function resolveForum(
  ctx: ToolContext,
  channelId: string,
  token: string | undefined,
  tags: string[],
) {
  const channel = await ctx.discord.getAnyChannel(channelId, token);
  const checked = asForumChannel(channel as { id: string; type: number }, channelId);
  if ("error" in checked) throw new PostValidationError(checked.error);
  const resolved = resolveTagNames(checked.forum, tags);
  if ("error" in resolved) throw new PostValidationError(resolved.error);
  return { forum: checked.forum, tagIds: resolved.ids };
}

/**
 * Validates, resolves, and renders a post for a project. Throws
 * PostValidationError with an agent-facing message on any refusal.
 */
export async function preparePost(
  ctx: ToolContext,
  project: ProjectRef,
  rawPost: unknown,
  toolName: string,
): Promise<PreparedPost> {
  const post = parsePost(rawPost);
  if (post.project !== undefined && post.project !== project.name) {
    throw new PostValidationError(
      `Post project "${post.project}" does not match the tool's project "${project.name}"`,
    );
  }
  const preset = resolvePresetOrThrow(project, post.persona);
  const og = await fetchVideoInfo(post);
  const target = await resolvePostTarget(ctx, project, post, preset, toolName);
  const { payload, sha256 } = buildPayload(post, preset, target.channelId, og);
  // A forum_post must target a forum and name tags it has — check now, not at publish.
  if (post.type === "forum_post") {
    await resolveForum(ctx, target.channelId, target.token, payload.tags);
  }
  return {
    post,
    preset,
    target,
    og,
    payload,
    sha256,
    countingCubes: isCountingCubes(post, preset, og),
  };
}

/**
 * Re-checks a video is still watchable right before it is published, and
 * returns the fresh oEmbed snapshot (uploader identity included) so approval
 * decisions never rely on ledger-stored metadata alone.
 */
export async function assertVideoStillAvailable(post: Post): Promise<OgSnapshot | undefined> {
  if (post.type !== "video_upload") return undefined;
  const fresh = await fetchVideoInfo(post);
  if (fresh?.error || isUnavailableTitle(fresh?.title)) {
    throw new PostValidationError(
      `Refusing to publish video_upload: the video no longer looks available (${
        fresh?.error ?? "title missing or unavailable"
      }). Re-check the video and preview again.`,
    );
  }
  return fresh;
}

/**
 * The "PREVIEW → …" header, posted as its own message just before the
 * preview. Keeping it separate means the preview message is exactly the
 * payload that will be published (no length squeeze from the header).
 */
export function previewHeader(
  label: string,
  payload: PostPayload,
  bind: { channelId: string; project: string },
): string {
  // The exact destination id and project are part of what the approver \u2705s, so a
  // record copied to another project (same alias, different channel) fails the check.
  const where = label === `<#${bind.channelId}>` ? label : `${label} (<#${bind.channelId}>)`;
  const parts = [`PREVIEW \u2192 ${where}`, `project ${bind.project}`, payload.type];
  if (payload.thread_name) parts.push(`new thread "${payload.thread_name}"`);
  if (payload.tags.length) parts.push(`tags: ${payload.tags.join(", ")}`);
  if (payload.pin) parts.push("will be pinned");
  return parts.join(" \u00B7 ");
}

/** Announcement, public, and private threads. */
function isThreadType(channel: unknown): boolean {
  const type = (channel as { type?: number }).type;
  return (
    type === ChannelType.AnnouncementThread ||
    type === ChannelType.PublicThread ||
    type === ChannelType.PrivateThread
  );
}

/**
 * A webhook send that failed. `delivered: "no"` means Discord rejected the
 * request (4xx) or it never left this process, so nothing was posted;
 * `"unknown"` means the message may be live (timeout, 5xx, lost response).
 */
export class SendError extends Error {
  constructor(
    message: string,
    readonly delivered: "no" | "unknown",
  ) {
    super(message);
    this.name = "SendError";
  }
}

export interface SentMessage {
  id: string;
  channelId: string;
  webhookId: string;
}

/**
 * Posts as a persona via the channel's persona webhook. Mentions are never
 * parsed: a feed post must not ping @everyone, roles, or users.
 * SECURITY: never return webhook.token or webhook.url.
 */
interface PersonaMessage {
  username: string;
  avatar_url: string | null;
  content: string | null;
  embeds: Array<Record<string, unknown>>;
}

/** A resolved persona webhook plus the thread to post into, if any. */
export interface PersonaRoute {
  webhook: Awaited<ReturnType<typeof ensurePersonaWebhook>>["webhook"];
  threadId?: string;
}

/**
 * Resolves the persona webhook for a destination. An existing thread has no
 * webhooks of its own, so it posts through its parent channel's webhook
 * with threadId. Forum channels are not text-based (DiscordClient.getChannel
 * rejects them), so a forum thread post fetches with getAnyChannel.
 */
export async function resolvePersonaRoute(
  ctx: ToolContext,
  channelId: string,
  token: string | undefined,
  forumThread = false,
): Promise<PersonaRoute> {
  try {
    let channel: unknown = forumThread
      ? await ctx.discord.getAnyChannel(channelId, token)
      : await ctx.discord.getChannel(channelId, token);
    let threadId: string | undefined;
    const parentId = (channel as { parentId?: string | null }).parentId;
    if (!forumThread && !supportsWebhooks(channel) && isThreadType(channel) && parentId) {
      threadId = channelId;
      channel = await ctx.discord.getAnyChannel(parentId, token);
    }
    if (!supportsWebhooks(channel)) throw new PostValidationError(NO_WEBHOOK_CHANNEL_ERROR);
    const client = await ctx.discord.getClient(token);
    const { webhook } = await ensurePersonaWebhook(channel, client.user?.id);
    return { webhook, ...(threadId ? { threadId } : {}) };
  } catch (err) {
    throw new SendError(errorText(err), "no");
  }
}

/**
 * Sends one persona message through a resolved route. Mentions are never
 * parsed: a feed post must not ping @everyone, roles, or users.
 * SECURITY: never return webhook.token or webhook.url.
 */
export async function sendViaRoute(
  route: PersonaRoute,
  message: PersonaMessage,
  forumThread?: { name: string; appliedTags: string[] },
): Promise<SentMessage> {
  if (message.avatar_url !== null && !isPublicHttpUrl(message.avatar_url)) {
    throw new SendError(
      `Persona avatar_url references a private or reserved address and cannot be used: ${message.avatar_url}`,
      "no",
    );
  }
  let sent;
  try {
    sent = await route.webhook.send({
      ...(message.content ? { content: message.content } : {}),
      username: message.username,
      ...(message.avatar_url ? { avatarURL: message.avatar_url } : {}),
      embeds: message.embeds as APIEmbed[],
      allowedMentions: { parse: [] },
      ...(forumThread
        ? { threadName: forumThread.name, appliedTags: forumThread.appliedTags }
        : {}),
      ...(route.threadId ? { threadId: route.threadId } : {}),
    });
  } catch (err) {
    const status = (err as { status?: unknown }).status;
    const rejected = typeof status === "number" && status >= 400 && status < 500;
    throw new SendError(errorText(err), rejected ? "no" : "unknown");
  }
  return { id: sent.id, channelId: sent.channelId, webhookId: route.webhook.id };
}

/** Posts as a persona to a destination (resolve the route, then send). */
export async function sendAsPersona(
  ctx: ToolContext,
  channelId: string,
  token: string | undefined,
  message: PersonaMessage,
  thread?: { name: string; appliedTags: string[] },
): Promise<SentMessage> {
  const route = await resolvePersonaRoute(ctx, channelId, token, thread !== undefined);
  return sendViaRoute(route, message, thread);
}

/**
 * Publishes a payload to its target. forum_post creates a forum thread —
 * through the persona webhook (thread_name) so the persona identity holds,
 * falling back to the bot only when the webhook attempt definitely did not
 * post (a 4xx or a failure before sending). Everything else is a webhook
 * message.
 */
export async function publishPayload(
  ctx: ToolContext,
  target: { channelId: string; token?: string },
  payload: PostPayload,
): Promise<SentMessage & { thread_id?: string; via: "webhook" | "bot" }> {
  if (payload.type !== "forum_post") {
    return {
      ...(await sendAsPersona(ctx, target.channelId, target.token, payload)),
      via: "webhook",
    };
  }
  let forum;
  let tagIds: string[];
  try {
    ({ forum, tagIds } = await resolveForum(ctx, target.channelId, target.token, payload.tags));
  } catch (err) {
    throw new SendError(errorText(err), "no");
  }
  const threadName = payload.thread_name ?? "Post";
  try {
    const sent = await sendAsPersona(ctx, target.channelId, target.token, payload, {
      name: threadName,
      appliedTags: tagIds,
    });
    // A webhook forum post's message lives in the new thread, which shares its id.
    return { ...sent, thread_id: sent.channelId, via: "webhook" };
  } catch (err) {
    if (!(err instanceof SendError) || err.delivered === "unknown") throw err;
  }
  try {
    const thread = await forum.threads.create({
      name: threadName,
      message: {
        ...(payload.content ? { content: payload.content } : {}),
        embeds: payload.embeds as APIEmbed[],
        allowedMentions: { parse: [] },
      },
      ...(tagIds.length ? { appliedTags: tagIds } : {}),
    });
    // Discord invariant: a forum post's starter message shares the thread's id.
    return { id: thread.id, channelId: thread.id, webhookId: "", thread_id: thread.id, via: "bot" };
  } catch (err) {
    const status = (err as { status?: unknown }).status;
    const rejected = typeof status === "number" && status >= 400 && status < 500;
    throw new SendError(errorText(err), rejected ? "no" : "unknown");
  }
}

/**
 * Pins a published post with the bot: the message, or for a forum post the
 * thread itself. Returns an error string instead of throwing.
 */
export async function pinPublished(
  ctx: ToolContext,
  sent: { id: string; channelId: string; thread_id?: string },
  token: string | undefined,
): Promise<string | undefined> {
  try {
    if (sent.thread_id) {
      const thread = (await ctx.discord.getAnyChannel(sent.thread_id, token)) as unknown as {
        type: number;
        pin?: () => Promise<unknown>;
      };
      if (typeof thread.pin !== "function" || thread.type === ChannelType.GuildForum) {
        return "the new forum thread cannot be pinned";
      }
      await thread.pin();
      return undefined;
    }
    const channel = await ctx.discord.getChannel(sent.channelId, token);
    const message = await channel.messages.fetch(sent.id);
    await message.pin();
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Approval is per type: types in posts.auto_types post directly (send_post)
 * with no ✅; every other type needs an approver's ✅ on its own preview,
 * every time. There is no "first approval unlocks" path. Counting Cubes
 * content always needs a ✅, even when its type is in auto_types — the tool
 * cannot see whether a video is unlisted or scheduled.
 */
export function needsApproval(
  project: ProjectRef,
  type: Post["type"],
  countingCubes = false,
): boolean {
  return countingCubes || !project.posts.autoTypes.includes(type);
}

/** Minimal view of a fetched preview message, for the integrity check. */
export interface PreviewMessageView {
  webhookId?: string | null;
  /** For webhook messages, the per-message username override. */
  author?: { username?: string | null } | null;
  editedTimestamp?: number | null;
  content?: string | null;
  /** discord.js Embeds expose fields as getters; `data.type` is the raw embed type. */
  embeds?: ReadonlyArray<{ data?: { type?: string | null } | null }>;
}

/** Discord trims surrounding whitespace, so compare trimmed text. */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Discord may normalize a URL (e.g. add a trailing "/"), so compare parsed hrefs. */
function href(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

function sub(value: unknown, key: string): Record<string, unknown> | undefined {
  const v = (value as Record<string, unknown> | undefined)?.[key];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

/**
 * Canonical projection of every embed field a post can set, read from either
 * our payload (snake_case) or a discord.js Embed (camelCase getters), so an
 * approved preview and the payload compare field by field.
 */
function embedView(embed: Record<string, unknown>): string {
  const author = sub(embed, "author");
  const footer = sub(embed, "footer");
  const timestamp = embed.timestamp;
  const ts =
    typeof timestamp === "string" || typeof timestamp === "number"
      ? Date.parse(String(timestamp))
      : NaN;
  const fields = Array.isArray(embed.fields)
    ? (embed.fields as Array<Record<string, unknown>>)
    : [];
  return JSON.stringify([
    text(embed.title),
    text(embed.description),
    href(embed.url),
    typeof embed.color === "number" ? embed.color : null,
    text(footer?.text),
    href(footer?.icon_url ?? footer?.iconURL),
    href(sub(embed, "image")?.url),
    href(sub(embed, "thumbnail")?.url),
    text(author?.name),
    href(author?.url),
    href(author?.icon_url ?? author?.iconURL),
    Number.isNaN(ts) ? null : ts,
    fields.map((f) => [text(f.name), text(f.value), f.inline === true]),
  ]);
}

/**
 * Confirms a preview message is the one the ledger describes: posted by the
 * recorded persona webhook under the recorded name, never edited, and
 * carrying the same content and embeds (every field) as the payload. Closes
 * the gap where a ledger rewritten consistently (post, payload, and hash
 * together) would pass the hash check alone.
 */
export function previewMismatch(
  message: PreviewMessageView,
  expected: {
    webhookId: string | null;
    username: string;
    content: string;
    embeds: Array<Record<string, unknown>>;
  },
): string | undefined {
  if (!expected.webhookId || message.webhookId !== expected.webhookId) {
    return "the preview message was not posted by the recorded persona webhook";
  }
  if (message.editedTimestamp) return "the preview message was edited after it was posted";
  if (text(message.author?.username) !== text(expected.username)) {
    return "the preview was posted under a different persona name";
  }
  if (text(message.content) !== text(expected.content)) return "the preview content differs";
  // Compare only the embeds we sent: Discord may add link-preview embeds
  // (type "link", "video", "article", ...) for URLs in the content.
  const got = (message.embeds ?? []).filter((e) => (e.data?.type ?? "rich") === "rich");
  if (got.length !== expected.embeds.length) return "the preview embeds differ";
  for (const [i, want] of expected.embeds.entries()) {
    if (embedView(got[i] as unknown as Record<string, unknown>) !== embedView(want)) {
      return "the preview embeds differ";
    }
  }
  return undefined;
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
