import {
  type LoadedConfig,
  getTokenForProject,
  getTokenForBot,
  getBotPersona,
} from "../config/index.js";
import { resolveProject, getDefaultProjectName, type ResolvedProject } from "../config/profiles.js";
import type { NotificationType } from "../config/schema.js";
import type { DiscordClient } from "../client.js";
import { fuzzyFind } from "./fuzzy.js";
import { logger } from "../utils/logger.js";

export interface ResolvedTarget {
  guildId: string | undefined;
  channelId: string;
  project?: string;
  /**
   * Bot token for multi-bot routing. SECURITY: This is the raw token, required
   * for Discord API calls. Never serialize, log, or include in tool results.
   * The audit logger and error sanitizer strip tokens automatically.
   */
  token?: string;
  /** Bot persona metadata (name, role) for agent context. Never includes token. */
  bot?: { name: string; role?: string };
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
      guildId: params.guild_id ?? undefined,
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

  // Resolve channel via config aliases or notification routing
  const resolved = resolveChannelWithBot(params, project);
  if (resolved) {
    const token = resolveTokenForChannel(resolved.botName, projectName, config);
    const botPersona = resolveBotPersona(resolved.botName, projectName, resolved.alias, config);
    return {
      guildId: project.guildId,
      channelId: resolved.channelId,
      project: projectName,
      token,
      ...(botPersona ? { bot: botPersona } : {}),
    };
  }

  // Fallback: live Discord channel name lookup (fuzzy)
  if (params.channel && discord && project.guildId) {
    const defaultToken = resolveTokenForChannel(undefined, projectName, config);
    const liveChannelId = await discord.findChannelByName(
      project.guildId,
      params.channel,
      defaultToken,
    );
    if (liveChannelId) {
      const botPersona = resolveBotPersona(project.bot, projectName, undefined, config);
      return {
        guildId: project.guildId,
        channelId: liveChannelId,
        project: projectName,
        token: defaultToken,
        ...(botPersona ? { bot: botPersona } : {}),
      };
    }
  }

  return {
    error: `Cannot resolve channel "${params.channel ?? params.notification_type ?? "(none)"}" for project "${projectName}". Provide channel, notification_type, or set default_channel`,
  };
}

interface ResolvedChannel {
  channelId: string;
  alias?: string;
  botName?: string;
}

function resolveChannelWithBot(
  params: ResolveParams,
  project: ResolvedProject,
): ResolvedChannel | undefined {
  // Explicit channel alias — exact then fuzzy on configured alias keys
  if (params.channel) {
    const exact = project.channels[params.channel];
    if (exact) {
      return {
        channelId: exact,
        alias: params.channel,
        botName: project.channelBots[params.channel] ?? project.bot,
      };
    }

    // Fuzzy match against configured alias keys
    const aliases = Object.keys(project.channels).map((k) => ({
      id: project.channels[k],
      name: k,
    }));
    const fuzzyMatch = fuzzyFind(aliases, params.channel);
    if (fuzzyMatch) {
      return {
        channelId: fuzzyMatch.item.id,
        alias: fuzzyMatch.item.name,
        botName: project.channelBots[fuzzyMatch.item.name] ?? project.bot,
      };
    }

    return undefined;
  }

  // Notification type → channel alias → channel ID
  if (params.notification_type && project.notificationRouting) {
    const channelAlias = project.notificationRouting[params.notification_type as NotificationType];
    if (channelAlias && project.channels[channelAlias]) {
      return {
        channelId: project.channels[channelAlias],
        alias: channelAlias,
        botName: project.channelBots[channelAlias] ?? project.bot,
      };
    }
  }

  // Default channel
  if (project.defaultChannel && project.channels[project.defaultChannel]) {
    return {
      channelId: project.channels[project.defaultChannel],
      alias: project.defaultChannel,
      botName: project.channelBots[project.defaultChannel] ?? project.bot,
    };
  }

  return undefined;
}

/**
 * Resolves the token for a channel, preferring bot-specific tokens.
 */
function resolveTokenForChannel(
  botName: string | undefined,
  projectName: string,
  config: LoadedConfig,
): string {
  if (botName && config.global.bots?.[botName]) {
    try {
      return getTokenForBot(botName, config);
    } catch (err) {
      logger.warn(
        `Bot "${botName}" token unavailable, falling back to project token for "${projectName}"`,
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }
  return getTokenForProject(projectName, config);
}

/**
 * Builds a safe bot persona object (no token) for the resolved target.
 */
function resolveBotPersona(
  botName: string | undefined,
  projectName: string,
  channelAlias: string | undefined,
  config: LoadedConfig,
): { name: string; role?: string } | undefined {
  if (botName && config.global.bots?.[botName]) {
    const bot = config.global.bots[botName];
    return { name: bot.name, role: bot.role };
  }
  // Try getBotPersona for channel-level override resolution
  const persona = getBotPersona(projectName, channelAlias, config);
  if (persona) {
    return { name: persona.name, role: persona.role };
  }
  return undefined;
}
