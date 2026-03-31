import { type LoadedConfig, getTokenForProject } from "../config/index.js";
import { resolveProject, getDefaultProjectName, type ResolvedProject } from "../config/profiles.js";
import type { NotificationType } from "../config/schema.js";

export interface ResolvedTarget {
  guildId: string;
  channelId: string;
  project?: string;
  token?: string;
}

export interface ResolveParams {
  /** Direct channel ID — highest priority */
  channel_id?: string;
  /** Direct guild ID */
  guild_id?: string;
  /** Project name for routing */
  project?: string;
  /** Channel alias within a project */
  channel?: string;
  /** Notification type for automatic routing */
  notification_type?: string;
}

/**
 * Resolves a target guild + channel from flexible input params.
 *
 * Priority:
 *  1. Direct channel_id + guild_id (always works)
 *  2. Project + channel alias
 *  3. Project + notification_type → channel alias
 *  4. Project + default_channel
 */
export function resolveTarget(
  params: ResolveParams,
  config: LoadedConfig,
): ResolvedTarget | { error: string } {
  // Direct IDs always win
  if (params.channel_id) {
    return {
      guildId: params.guild_id ?? "",
      channelId: params.channel_id,
      project: params.project,
    };
  }

  // Need a project for alias-based resolution
  const projectName =
    params.project ?? getDefaultProjectName(config.global, config.perProject);

  if (!projectName) {
    return { error: "No project specified and no default_project configured" };
  }

  const project = resolveProject(projectName, config.global, config.perProject);
  if (!project) {
    return { error: `Project "${projectName}" not found in config` };
  }

  // Resolve channel
  const channelId = resolveChannel(params, project);
  if (!channelId) {
    return {
      error: `Cannot resolve channel for project "${projectName}". Provide channel, notification_type, or set default_channel`,
    };
  }

  return {
    guildId: project.guildId,
    channelId,
    project: projectName,
    token: getTokenForProject(projectName, config),
  };
}

function resolveChannel(
  params: ResolveParams,
  project: ResolvedProject,
): string | undefined {
  // Explicit channel alias
  if (params.channel) {
    return project.channels[params.channel];
  }

  // Notification type → channel alias → channel ID
  if (params.notification_type && project.notificationRouting) {
    const channelAlias = project.notificationRouting[params.notification_type as NotificationType];
    if (channelAlias) {
      return project.channels[channelAlias];
    }
  }

  // Default channel
  if (project.defaultChannel) {
    return project.channels[project.defaultChannel];
  }

  return undefined;
}
