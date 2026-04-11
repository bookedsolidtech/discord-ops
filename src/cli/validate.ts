import { loadConfig } from "../config/index.js";

/**
 * Validates the discord-ops configuration files.
 * Loads global and per-project configs and reports any issues.
 */
export async function runValidate(): Promise<void> {
  try {
    const config = loadConfig();

    const projectCount = Object.keys(config.global.projects).length;

    console.log("Configuration valid.");
    console.log(`  Projects: ${projectCount}`);

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
  } catch (err) {
    console.error(
      "Configuration invalid:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }
}
