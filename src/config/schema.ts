import { z } from "zod";
import { homedir } from "node:os";
import { join } from "node:path";
import { personaName } from "./persona-name.js";
import { isPublicHttpUrl } from "../utils/og-fetch.js";

const BUILTIN_NOTIFICATION_TYPES = [
  "ci_build",
  "deploy",
  "release",
  "error",
  "alert",
  "announcement",
  "dev",
] as const;

// Open union: built-in values are documented suggestions, but any string is valid.
export const notificationType = z.union([z.enum(BUILTIN_NOTIFICATION_TYPES), z.string()]);
export type NotificationType = z.infer<typeof notificationType>;

export const ToolProfileEnum = z.enum([
  "full",
  "monitoring",
  "readonly",
  "moderation",
  "messaging",
  "channels",
  "webhooks",
]);
export type ToolProfileName = z.infer<typeof ToolProfileEnum>;

/** Named bot with identity metadata */
export const BotPersonaSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  token_env: z.string(),
  default_profile: ToolProfileEnum.optional(),
  profile_add: z.array(z.string()).optional(),
  profile_remove: z.array(z.string()).optional(),
});

export type BotPersona = z.infer<typeof BotPersonaSchema>;

/** Channel value: plain snowflake string OR object with bot override */
export const ChannelConfigSchema = z.union([
  z.string().regex(/^\d{17,20}$/),
  z.object({
    id: z.string().regex(/^\d{17,20}$/),
    bot: z.string().optional(),
  }),
]);

export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

const snowflake = z.string().regex(/^\d{17,20}$/, "Must be a valid Discord snowflake ID");

/**
 * A named persona preset: a posting identity configured once per project and
 * referenced by key (or name) from send_as and the posting-kit tools. The name
 * goes through the same rules as send_as persona names (length, Discord's
 * "clyde"/"discord" ban, reserved authority names).
 */
export const PersonaPresetSchema = z.object({
  name: personaName,
  avatar_url: z
    .string()
    .url()
    .refine(isPublicHttpUrl, {
      message:
        "avatar_url must be a public http(s) URL (private and reserved addresses are refused)",
    })
    .optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
  footer: z.string().max(2048).optional(),
  default_channel: z.string().optional(),
});

export type PersonaPreset = z.infer<typeof PersonaPresetSchema>;

/** Post types the posting kit renders (see src/posts). */
export const POST_TYPES = [
  "welcome",
  "rules",
  "announcement",
  "video_upload",
  "server_status",
  "event",
  "build_spotlight",
  "character_line",
  "schedule_update",
  "custom",
  "forum_post",
] as const;
export const PostTypeEnum = z.enum(POST_TYPES);
export type PostType = z.infer<typeof PostTypeEnum>;

export const DEFAULT_PREVIEW_CHANNEL = "feed-preview";

/**
 * Posting-kit approval config. Every field is optional; defaults are applied
 * by resolvePostsConfig so config literals stay assignable to the inferred type.
 */
export const PostsConfigSchema = z.object({
  /** Channel alias where previews are posted (default "feed-preview") */
  preview_channel: z.string().optional(),
  approver_user_ids: z.array(snowflake).optional(),
  approver_role_ids: z.array(snowflake).optional(),
  /**
   * Types that may post directly with send_post and need no ✅ (default []).
   * Every other type goes preview_post → approver ✅ → publish_post, every time.
   */
  auto_types: z.array(PostTypeEnum).optional(),
  /**
   * When true, the direct-posting tools (send_message, send_as, send_embed,
   * send_template, execute_webhook, send_poll, forward_message,
   * create_forum_post, create_thread with a starter message, edit_message)
   * refuse for this project's guild. Posts go through the posting kit only.
   */
  require_approval: z.boolean().optional(),
});

export type PostsConfig = z.infer<typeof PostsConfigSchema>;

export const ProjectConfigSchema = z.object({
  guild_id: z.string().regex(/^\d{17,20}$/, "Must be a valid Discord snowflake ID"),
  channels: z.record(z.string(), ChannelConfigSchema),
  default_channel: z.string().optional(),
  /**
   * Channel alias (or snowflake) used as this project's note board — the
   * durable, directed-note log that agents read on startup and post to. When
   * unset, the board resolves through a fallback chain (see resolveBoard):
   * a "board"/"agent-board" alias, then "agent-logs", then "backchannel",
   * then default_channel.
   */
  board_channel: z.string().optional(),
  token_env: z.string().optional(),
  bot: z.string().optional(),
  tool_profile: ToolProfileEnum.optional(),
  profile_add: z.array(z.string()).optional(),
  profile_remove: z.array(z.string()).optional(),
  /**
   * Tools refused in this project's guild for every call, however it is routed
   * (project, alias, channel_id or guild_id). Unknown names fail server startup.
   */
  deny_tools: z.array(z.string()).optional(),
  owners: z.array(z.string().regex(/^\d{17,20}$/)).optional(),
  notify_owners_on: z.array(notificationType).optional(),
  /** Persona presets keyed by a short id (e.g. "meelah"), used by send_as and the posting kit */
  personas: z.record(z.string(), PersonaPresetSchema).optional(),
  /** Posting-kit preview/approval config */
  posts: PostsConfigSchema.optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/** Gateway event types the `discord-ops listen` sidecar can subscribe to */
export const ListenEventTypeSchema = z.enum([
  "message_create",
  "message_update",
  "message_delete",
  "reaction_add",
  "reaction_remove",
  "thread_create",
]);

export type ListenEventType = z.infer<typeof ListenEventTypeSchema>;

/** Expand a leading `~` to the user's home directory. Only `~` and `~/...` are expanded. */
function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

/**
 * Config for the `discord-ops listen` gateway sidecar. The sink is a fast
 * local cache of gateway events — Discord channel history stays the source
 * of truth.
 */
export const ListenConfigSchema = z.object({
  /** JSONL file the sidecar appends normalized events to (`~` expands to the home dir) */
  sink: z.string().default("~/.discord-ops/events.jsonl").transform(expandHome),
  /** Gateway events to forward to the sink */
  events: z.array(ListenEventTypeSchema).default(["message_create", "reaction_add"]),
  /** Optional allowlist of channels (aliases or snowflake IDs); defaults to every configured channel */
  channels: z.array(z.string()).optional(),
  /** Advisory retention window in hours (sink rotation is currently size-based) */
  retention_hours: z.number().positive().default(72),
});

export type ListenConfig = z.infer<typeof ListenConfigSchema>;

export const GlobalConfigSchema = z.object({
  bots: z.record(z.string(), BotPersonaSchema).optional(),
  projects: z.record(z.string(), ProjectConfigSchema),
  default_project: z.string().optional(),
  notification_routing: z.record(notificationType, z.string()).optional(),
  listen: ListenConfigSchema.optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export const PerProjectConfigSchema = z.object({
  project: z.string(),
  notification_routing: z.record(notificationType, z.string()).optional(),
});

export type PerProjectConfig = z.infer<typeof PerProjectConfigSchema>;

export const EnvConfigSchema = z.object({
  DISCORD_TOKEN: z.string().min(50).optional(),
  DISCORD_OPS_TOKEN_ENV: z.string().optional(),
  DISCORD_OPS_CONFIG: z.string().optional(),
  DISCORD_OPS_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  DISCORD_OPS_DRY_RUN: z.string().optional(),
});
