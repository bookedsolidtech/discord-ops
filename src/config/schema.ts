import { z } from "zod";

export const NotificationType = z.enum([
  "ci_build",
  "deploy",
  "release",
  "error",
  "announcement",
  "dev",
]);
export type NotificationType = z.infer<typeof NotificationType>;

export const ProjectConfigSchema = z.object({
  guild_id: z.string().regex(/^\d{17,20}$/, "Must be a valid Discord snowflake ID"),
  channels: z.record(z.string(), z.string().regex(/^\d{17,20}$/)),
  default_channel: z.string().optional(),
  token_env: z.string().optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const GlobalConfigSchema = z.object({
  projects: z.record(z.string(), ProjectConfigSchema),
  default_project: z.string().optional(),
  notification_routing: z.record(NotificationType, z.string()).optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

export const PerProjectConfigSchema = z.object({
  project: z.string(),
  notification_routing: z.record(NotificationType, z.string()).optional(),
});

export type PerProjectConfig = z.infer<typeof PerProjectConfigSchema>;

export const EnvConfigSchema = z.object({
  DISCORD_TOKEN: z.string().min(50).optional(),
  DISCORD_OPS_TOKEN_ENV: z.string().optional(),
  DISCORD_OPS_CONFIG: z.string().optional(),
  DISCORD_OPS_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  DISCORD_OPS_DRY_RUN: z.string().optional(),
});
