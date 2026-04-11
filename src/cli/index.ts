#!/usr/bin/env node

import { loadConfig } from "../config/index.js";
import { DiscordClient } from "../client.js";
import { createServer } from "../server.js";
import { startStdioTransport } from "../transport/stdio.js";
import { startHttpTransport } from "../transport/http.js";
import { logger, setLogLevel } from "../utils/logger.js";
import type { LogLevel } from "../utils/logger.js";
import { createRequire } from "node:module";
import { runInit } from "./init.js";
import { runSetup } from "./setup.js";
import { runTool } from "./run.js";
import { runValidate } from "./validate.js";
import { validateFlags } from "./validate-flags.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

export { validateFlags } from "./validate-flags.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Reject unrecognised flags early
  validateFlags(args);

  // Handle --help
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  // Handle --version
  if (args.includes("--version") || args.includes("-v")) {
    console.log(`discord-ops ${pkg.version}`);
    process.exit(0);
  }

  // Handle init subcommand (does not require DISCORD_TOKEN)
  if (args[0] === "init") {
    await runInit(args.slice(1));
    return;
  }

  // Handle health subcommand
  if (args[0] === "health") {
    await runHealthCheck();
    return;
  }

  // Handle setup subcommand (interactive wizard)
  if (args[0] === "setup") {
    await runSetup();
    return;
  }

  // Handle run subcommand (execute a single tool)
  if (args[0] === "run") {
    const toolName = args[1];
    if (!toolName) {
      console.error("Usage: discord-ops run <tool-name> --args '<json>'");
      process.exit(1);
    }
    const argsIndex = args.indexOf("--args");
    const rawArgs = argsIndex !== -1 ? args[argsIndex + 1] : "{}";
    await runTool(toolName, rawArgs);
    return;
  }

  // Handle validate subcommand (validate config)
  if (args[0] === "validate") {
    await runValidate();
    return;
  }

  // Configure log level
  const logLevel = process.env.DISCORD_OPS_LOG_LEVEL as LogLevel | undefined;
  if (logLevel) setLogLevel(logLevel);

  // Load config (does NOT require Discord connection)
  const config = loadConfig();

  // Create lazy Discord client
  const discord = new DiscordClient(config.defaultToken);

  // Create MCP server with tool context
  const { server } = createServer({ discord, config });

  // Handle serve subcommand (HTTP/SSE transport)
  if (args[0] === "serve") {
    const portIndex = args.indexOf("--port");
    const portStr = portIndex !== -1 ? args[portIndex + 1] : undefined;
    const port = portStr !== undefined ? parseInt(portStr, 10) : undefined;

    if (port !== undefined && (isNaN(port) || port < 1 || port > 65535)) {
      console.error("Invalid --port value: must be between 1 and 65535");
      process.exit(1);
    }

    const originIndex = args.indexOf("--allowed-origin");
    const allowedOrigin = originIndex !== -1 ? args[originIndex + 1] : undefined;

    const allowUnauthenticated = args.includes("--allow-unauthenticated");

    await startHttpTransport(server, { port, allowedOrigin, allowUnauthenticated });

    // Graceful shutdown
    const shutdown = async () => {
      logger.info("Shutting down...");
      await discord.destroy();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

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
    const discord = new DiscordClient(config.defaultToken);

    // Collect unique tokens: default + any project-specific ones
    const tokens = new Map<string, string[]>(); // token → project names
    if (config.defaultToken) {
      tokens.set(config.defaultToken, ["(default)"]);
    }
    for (const [name, project] of Object.entries(config.global.projects)) {
      if (project.token_env) {
        const t = process.env[project.token_env];
        if (t && t !== config.defaultToken) {
          const names = tokens.get(t) ?? [];
          names.push(name);
          tokens.set(t, names);
        }
      }
    }

    console.log(`Bots configured: ${tokens.size}`);

    for (const [token, projects] of tokens) {
      console.log(`\nConnecting bot for: ${projects.join(", ")}...`);
      const client = await discord.getClient(token);

      console.log(`  Bot: ${client.user?.tag}`);
      console.log(`  Guilds: ${client.guilds.cache.size}`);

      for (const [id, guild] of client.guilds.cache) {
        const me = await guild.members.fetchMe();
        console.log(`\n    ${guild.name} (${id})`);
        console.log(`      Members: ${guild.memberCount}`);
        console.log(`      Permissions: ${me.permissions.toArray().join(", ")}`);
      }
    }

    console.log(`\nProjects configured: ${Object.keys(config.global.projects).length}`);
    for (const [name, project] of Object.entries(config.global.projects)) {
      const tokenInfo = project.token_env ? ` [${project.token_env}]` : "";
      console.log(
        `  ${name}: guild=${project.guild_id}, channels=${Object.keys(project.channels).join(", ")}${tokenInfo}`,
      );
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
  discord-ops serve        Start MCP server (HTTP/SSE transport)
  discord-ops health       Run health check + permission audit
  discord-ops init         Scaffold a per-project .discord-ops.json
  discord-ops setup        Interactive setup wizard for config
  discord-ops run <tool>   Run a single tool from the CLI
  discord-ops validate     Validate configuration files
  discord-ops --help       Show this help
  discord-ops --version    Show version

OPTIONS:
  --port <port>              HTTP port for serve mode (default: 3000)
  --allowed-origin <origin>  Allowed CORS origin (default: http://localhost)
  --allow-unauthenticated    Allow serve mode without DISCORD_OPS_HTTP_TOKEN (insecure)
  --args <json>              JSON arguments for the run subcommand
  --profile <name>           Tool profile: full, monitoring, readonly, moderation
  --tools <list>             Comma-separated list of tools to enable
  --dry-run                  Preview actions without executing

INIT FLAGS:
  --project <name>         Project name (required)
  --guild-id <snowflake>   Discord guild/server ID (required)
  --token-env <VAR>        Env var for bot token (default: DISCORD_TOKEN)
  --channel <alias>=<id>   Channel alias, repeatable (e.g. builds=1234567890)
  --force                  Overwrite existing .discord-ops.json
  --default                Mark this project as default_project

ENVIRONMENT:
  DISCORD_TOKEN            Default Discord bot token (required)
  DISCORD_OPS_HTTP_TOKEN   Bearer token for HTTP transport auth (required for serve mode)
  <PROJECT>_TOKEN          Per-project bot tokens (configured via token_env in config)
  DISCORD_OPS_CONFIG       Path to global config file (default: ~/.discord-ops.json)
  DISCORD_OPS_LOG_LEVEL    Log level: debug, info, warn, error (default: info)

CONFIG FILES:
  ~/.discord-ops.json      Global project routing config
  .discord-ops.json        Per-project config (created by discord-ops init)

DOCUMENTATION:
  https://github.com/bookedsolidtech/discord-ops
`);
}

main().catch((err) => {
  logger.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
