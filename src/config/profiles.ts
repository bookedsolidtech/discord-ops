import type { GlobalConfig, PerProjectConfig } from "./schema.js";

export interface ResolvedProject {
  name: string;
  guildId: string;
  channels: Record<string, string>;
  channelBots: Record<string, string>;
  defaultChannel?: string;
  notificationRouting?: Record<string, string>;
  bot?: string;
  toolProfile?: string;
  toolProfileAdd?: string[];
  toolProfileRemove?: string[];
}

/**
 * Normalizes a channel config value (string or object) to a plain channel ID.
 */
function normalizeChannelId(value: string | { id: string; bot?: string }): string {
  return typeof value === "string" ? value : value.id;
}

/**
 * Resolves a project from global + per-project config.
 * Per-project notification_routing overrides global.
 * Normalizes ChannelConfigSchema union values — extracts plain IDs into `channels`
 * and collects bot overrides into `channelBots`.
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

  // Normalize channels: extract plain IDs and collect bot overrides
  const channels: Record<string, string> = {};
  const channelBots: Record<string, string> = {};

  for (const [alias, value] of Object.entries(project.channels)) {
    channels[alias] = normalizeChannelId(value);
    if (typeof value === "object" && value.bot) {
      channelBots[alias] = value.bot;
    }
  }

  return {
    name: projectName,
    guildId: project.guild_id,
    channels,
    channelBots,
    defaultChannel: project.default_channel,
    notificationRouting,
    bot: project.bot,
    toolProfile: project.tool_profile,
    toolProfileAdd: project.profile_add,
    toolProfileRemove: project.profile_remove,
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
