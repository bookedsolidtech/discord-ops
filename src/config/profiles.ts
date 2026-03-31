import type { GlobalConfig, PerProjectConfig } from "./schema.js";

export interface ResolvedProject {
  name: string;
  guildId: string;
  channels: Record<string, string>;
  defaultChannel?: string;
  notificationRouting?: Record<string, string>;
}

/**
 * Resolves a project from global + per-project config.
 * Per-project notification_routing overrides global.
 */
export function resolveProject(
  projectName: string,
  globalConfig: GlobalConfig,
  perProjectConfig?: PerProjectConfig,
): ResolvedProject | undefined {
  const project = globalConfig.projects[projectName];
  if (!project) return undefined;

  // Merge notification routing: per-project overrides global
  const notificationRouting = {
    ...globalConfig.notification_routing,
    ...perProjectConfig?.notification_routing,
  };

  return {
    name: projectName,
    guildId: project.guild_id,
    channels: project.channels,
    defaultChannel: project.default_channel,
    notificationRouting,
  };
}

/**
 * Returns the default project name from config.
 */
export function getDefaultProjectName(
  globalConfig: GlobalConfig,
  perProjectConfig?: PerProjectConfig,
): string | undefined {
  return perProjectConfig?.project ?? globalConfig.default_project;
}
