import { type LoadedConfig, getTokenForProject } from "../config/index.js";
import { resolveProject, getDefaultProjectName, type ResolvedProject } from "../config/profiles.js";
import type { NotificationType } from "../config/schema.js";
import type { DiscordClient } from "../client.js";
import { fuzzyFind } from "./fuzzy.js";

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
 *  2. Project + channel alias (exact)
 *  3. Project + channel alias (fuzzy match on alias keys)
 *  4. Project + notification_type → channel alias
 *  5. Project + default_channel
 *  6. Project + live Discord channel name lookup (fuzzy)
 */
export async function resolveTarget(
  params: ResolveParams,
  config: LoadedConfig,
  discord?: DiscordClient,
): Promise<ResolvedTarget | { error: string }> {
  // Direct IDs always win
  if (params.channel_id) {
    const token = params.project ? getTokenForProject(params.project, config) : undefined;
    return {
      guildId: params.guild_id ?? "",
      channelId: params.channel_id,
      project: params.project,
      token,
    };
  }

  // Need a project for alias-based resolution
  const projectName = params.project ?? getDefaultProjectName(config.global, config.perProject);

  if (!projectName) {
    return { error: "No project specified and no default_project configured" };
  }

  const project = resolveProject(projectName, config.global, config.perProject);
  if (!project) {
    return { error: `Project "${projectName}" not found in config` };
  }

  const token = getTokenForProject(projectName, config);

  // Resolve channel via config aliases or notification routing
  const channelId = resolveChannel(params, project);
  if (channelId) {
    return { guildId: project.guildId, channelId, project: projectName, token };
  }

  // Fallback: live Discord channel name lookup (fuzzy)
  if (params.channel && discord && project.guildId) {
    const liveChannelId = await discord.findChannelByName(project.guildId, params.channel, token);
    if (liveChannelId) {
      return { guildId: project.guildId, channelId: liveChannelId, project: projectName, token };
    }
  }

  return {
    error: `Cannot resolve channel "${params.channel ?? params.notification_type ?? "(none)"}" for project "${projectName}". Provide channel, notification_type, or set default_channel`,
  };
}

function resolveChannel(params: ResolveParams, project: ResolvedProject): string | undefined {
  // Explicit channel alias — exact then fuzzy on configured alias keys
  if (params.channel) {
    const exact = project.channels[params.channel];
    if (exact) return exact;

    // Fuzzy match against configured alias keys
    const aliases = Object.keys(project.channels).map((k) => ({
      id: project.channels[k],
      name: k,
    }));
    const fuzzyMatch = fuzzyFind(aliases, params.channel);
    if (fuzzyMatch) return fuzzyMatch.item.id;

    return undefined;
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
