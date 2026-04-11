import { z } from "zod";

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

export const ProjectConfigSchema = z.object({
  guild_id: z.string().regex(/^\d{17,20}$/, "Must be a valid Discord snowflake ID"),
  channels: z.record(z.string(), ChannelConfigSchema),
  default_channel: z.string().optional(),
  token_env: z.string().optional(),
  bot: z.string().optional(),
  tool_profile: ToolProfileEnum.optional(),
  profile_add: z.array(z.string()).optional(),
  profile_remove: z.array(z.string()).optional(),
  owners: z.array(z.string().regex(/^\d{17,20}$/)).optional(),
  notify_owners_on: z.array(notificationType).optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const GlobalConfigSchema = z.object({
  bots: z.record(z.string(), BotPersonaSchema).optional(),
  projects: z.record(z.string(), ProjectConfigSchema),
  default_project: z.string().optional(),
  notification_routing: z.record(notificationType, z.string()).optional(),
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
