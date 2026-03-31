#!/usr/bin/env node

import { loadConfig } from "../config/index.js";
import { DiscordClient } from "../client.js";
import { createServer } from "../server.js";
import { startStdioTransport } from "../transport/stdio.js";
import { logger, setLogLevel } from "../utils/logger.js";
import type { LogLevel } from "../utils/logger.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle --help
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Handle --version
  if (args.includes("--version") || args.includes("-v")) {
    console.log("discord-ops 0.1.0");
    process.exit(0);
  }

  // Handle health subcommand
  if (args[0] === "health") {
    await runHealthCheck();
    return;
  }

  // Configure log level
  const logLevel = process.env.DISCORD_OPS_LOG_LEVEL as LogLevel | undefined;
  if (logLevel) setLogLevel(logLevel);

  // Load config (does NOT require Discord connection)
  const config = loadConfig();

  // Create lazy Discord client
  const discord = new DiscordClient(config.token);

  // Create MCP server with tool context
  const server = createServer({ discord, config });

  // Start stdio transport
  await startStdioTransport(server);

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    await discord.destroy();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function runHealthCheck(): Promise<void> {
  try {
    const config = loadConfig();
    const discord = new DiscordClient(config.token);

    console.log("Connecting to Discord...");
    const client = await discord.getClient();

    console.log(`\nBot: ${client.user?.tag}`);
    console.log(`Guilds: ${client.guilds.cache.size}`);

    for (const [id, guild] of client.guilds.cache) {
      const me = await guild.members.fetchMe();
      console.log(`\n  ${guild.name} (${id})`);
      console.log(`    Members: ${guild.memberCount}`);
      console.log(`    Permissions: ${me.permissions.toArray().join(", ")}`);
    }

    console.log(`\nProjects configured: ${Object.keys(config.global.projects).length}`);
    for (const [name, project] of Object.entries(config.global.projects)) {
      console.log(`  ${name}: guild=${project.guild_id}, channels=${Object.keys(project.channels).join(", ")}`);
    }

    console.log("\nHealth check passed.");
    await discord.destroy();
  } catch (err) {
    console.error("Health check failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

function printUsage(): void {
  console.log(`
discord-ops - Agency-grade Discord MCP server

USAGE:
  discord-ops              Start MCP server (stdio transport)
  discord-ops health       Run health check + permission audit
  discord-ops --help       Show this help
  discord-ops --version    Show version

ENVIRONMENT:
  DISCORD_TOKEN            Discord bot token (required)
  DISCORD_OPS_CONFIG       Path to global config file (default: ~/.discord-ops.json)
  DISCORD_OPS_LOG_LEVEL    Log level: debug, info, warn, error (default: info)

CONFIG FILES:
  ~/.discord-ops.json      Global project routing config
  .discord-ops.json        Per-project overrides (in repo root)

DOCUMENTATION:
  https://github.com/bookedsolidtech/discord-ops
`);
}

main().catch((err) => {
  logger.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
