import type { LoadedConfig } from "./index.js";

export interface ProjectValidation {
  name: string;
  guildId: string;
  channels: Record<string, string>;
  defaultChannel?: string;
  tokenEnv?: string;
  tokenSet: boolean;
}

export interface ConfigValidationResult {
  projects: ProjectValidation[];
  warnings: string[];
  errors: string[];
}

/**
 * Validates config for multi-org correctness without connecting to Discord.
 * Detects duplicate guild/channel IDs, missing token_env values,
 * invalid channel references, and other misconfigurations.
 */
export function validateConfig(config: LoadedConfig): ConfigValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const projects: ProjectValidation[] = [];

  const projectEntries = Object.entries(config.global.projects);

  if (projectEntries.length === 0 && !config.defaultToken) {
    errors.push("No projects configured and no default token set");
  }

  // Track guild/channel usage for duplicate detection
  const guildToProjects = new Map<string, string[]>();
  const channelToProjects = new Map<string, string[]>();

  for (const [name, project] of projectEntries) {
    // Track token state — check bot-level token first, then project-level, then default
    const tokenEnv = project.token_env;
    let tokenSet: boolean;
    if (project.bot && config.global.bots?.[project.bot]) {
      tokenSet = !!process.env[config.global.bots[project.bot].token_env];
    } else if (tokenEnv) {
      tokenSet = !!process.env[tokenEnv];
    } else {
      tokenSet = !!config.defaultToken;
    }

    // Normalize channels to plain ID strings for validation output
    const normalizedChannels: Record<string, string> = {};
    for (const [alias, value] of Object.entries(project.channels)) {
      normalizedChannels[alias] = typeof value === "string" ? value : value.id;
    }

    projects.push({
      name,
      guildId: project.guild_id,
      channels: normalizedChannels,
      defaultChannel: project.default_channel,
      tokenEnv,
      tokenSet,
    });

    // Check token availability
    if (!tokenSet) {
      if (project.bot && config.global.bots?.[project.bot]) {
        const bot = config.global.bots[project.bot];
        warnings.push(
          `Project "${name}": bot "${project.bot}" token_env "${bot.token_env}" is not set in environment — project will be unavailable`,
        );
      } else if (tokenEnv) {
        warnings.push(
          `Project "${name}": token_env "${tokenEnv}" is not set in environment — project will be unavailable`,
        );
      } else {
        errors.push(`Project "${name}": no token_env configured and no default token available`);
      }
    }

    // Track guild ID usage
    const guildProjects = guildToProjects.get(project.guild_id) ?? [];
    guildProjects.push(name);
    guildToProjects.set(project.guild_id, guildProjects);

    // Track channel ID usage (channels can be plain strings or objects with id/bot)
    for (const [alias, channelValue] of Object.entries(project.channels)) {
      const channelId = typeof channelValue === "string" ? channelValue : channelValue.id;
      const channelProjects = channelToProjects.get(channelId) ?? [];
      channelProjects.push(`${name}/${alias}`);
      channelToProjects.set(channelId, channelProjects);
    }

    // Validate default_channel references a real alias
    if (project.default_channel && !project.channels[project.default_channel]) {
      errors.push(
        `Project "${name}": default_channel "${project.default_channel}" is not a configured channel alias`,
      );
    }

    // Check for empty channels
    if (Object.keys(project.channels).length === 0) {
      warnings.push(`Project "${name}" has no channels configured`);
    }
  }

  // Warn about shared guilds with different tokens
  for (const [guildId, names] of guildToProjects) {
    if (names.length > 1) {
      // Check if they use different tokens
      const tokens = new Set(
        names.map((name) => {
          const p = config.global.projects[name];
          return p.token_env ?? "(default)";
        }),
      );
      if (tokens.size > 1) {
        warnings.push(
          `Guild ${guildId} is referenced by projects with different tokens: ${names.join(", ")}. ` +
            `Ensure all bots have access to this guild.`,
        );
      } else if (tokens.size === 1) {
        // Same token, same guild — just informational
        warnings.push(
          `Guild ${guildId} is shared by projects: ${names.join(", ")} (same token — consider merging)`,
        );
      }
    }
  }

  // Check for duplicate channel IDs across projects with different tokens
  for (const [channelId, refs] of channelToProjects) {
    if (refs.length > 1) {
      const projectNames = new Set(refs.map((r) => r.split("/")[0]));
      if (projectNames.size > 1) {
        // Different projects share a channel
        const tokens = new Set(
          [...projectNames].map((name) => {
            const p = config.global.projects[name];
            return p.token_env ?? "(default)";
          }),
        );
        if (tokens.size > 1) {
          warnings.push(
            `Channel ${channelId} is referenced by projects with different tokens: ${refs.join(", ")}`,
          );
        }
      }
    }
  }

  // Validate notification_routing references valid channel aliases
  if (config.global.notification_routing) {
    const defaultProjectName = config.perProject?.project ?? config.global.default_project;
    if (defaultProjectName) {
      const defaultProject = config.global.projects[defaultProjectName];
      if (defaultProject) {
        for (const [type, alias] of Object.entries(config.global.notification_routing)) {
          if (!defaultProject.channels[alias]) {
            warnings.push(
              `Notification routing: "${type}" maps to alias "${alias}" which doesn't exist in default project "${defaultProjectName}"`,
            );
          }
        }
      }
    }
  }

  // Validate default_project exists
  if (config.global.default_project) {
    if (!config.global.projects[config.global.default_project]) {
      errors.push(`default_project "${config.global.default_project}" does not exist in projects`);
    }
  }

  return { projects, warnings, errors };
}
