import { loadConfig } from "../config/index.js";
import { isProfileName } from "../profiles/index.js";

/**
 * Validates the discord-ops configuration files.
 * Loads global and per-project configs and reports any issues.
 */
export async function runValidate(): Promise<void> {
  try {
    const config = loadConfig();

    const projectCount = Object.keys(config.global.projects).length;
    const botCount = Object.keys(config.global.bots ?? {}).length;

    console.log("Configuration valid.");
    console.log(`  Projects: ${projectCount}`);

    if (botCount > 0) {
      console.log(`  Bots: ${botCount}`);
    }

    if (config.global.default_project) {
      console.log(`  Default project: ${config.global.default_project}`);
    }

    if (config.perProject) {
      console.log(`  Per-project config: project=${config.perProject.project}`);
    }

    if (config.defaultToken) {
      console.log("  Default token: set");
    } else {
      console.warn("  Warning: No default token configured (DISCORD_TOKEN not set)");
    }

    // Validate bot references and profiles
    const warnings: string[] = [];
    const errors: string[] = [];
    const bots = config.global.bots ?? {};

    // Validate bot personas
    for (const [botKey, bot] of Object.entries(bots)) {
      if (!process.env[bot.token_env]) {
        warnings.push(`Bot "${botKey}": token_env "${bot.token_env}" is not set in environment`);
      }
      if (bot.default_profile && !isProfileName(bot.default_profile)) {
        errors.push(
          `Bot "${botKey}": default_profile "${bot.default_profile}" is not a valid profile name`,
        );
      }
    }

    // Validate project-level bot and profile references
    for (const [projectName, project] of Object.entries(config.global.projects)) {
      // Check project.bot reference
      if (project.bot && !bots[project.bot]) {
        errors.push(
          `Project "${projectName}": bot "${project.bot}" is not defined in the bots section`,
        );
      }

      // Check project tool_profile
      if (project.tool_profile && !isProfileName(project.tool_profile)) {
        errors.push(
          `Project "${projectName}": tool_profile "${project.tool_profile}" is not a valid profile name`,
        );
      }

      // Check channel-level bot overrides
      for (const [alias, channelConfig] of Object.entries(project.channels)) {
        if (typeof channelConfig === "object" && channelConfig.bot) {
          if (!bots[channelConfig.bot]) {
            errors.push(
              `Project "${projectName}", channel "${alias}": bot "${channelConfig.bot}" is not defined in the bots section`,
            );
          }
        }
      }
    }

    // Report warnings
    for (const warning of warnings) {
      console.warn(`  Warning: ${warning}`);
    }

    // Report errors
    if (errors.length > 0) {
      for (const error of errors) {
        console.error(`  Error: ${error}`);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error("Configuration invalid:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
