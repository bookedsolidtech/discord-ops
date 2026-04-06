import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GlobalConfigSchema } from "../config/schema.js";
import type { GlobalConfig } from "../config/schema.js";

export interface InitOptions {
  project: string;
  guildId: string;
  tokenEnv: string;
  channels: Record<string, string>;
  force: boolean;
  markDefault: boolean;
  /** Override CWD for testability */
  cwd?: string;
}

export interface InitResult {
  config: GlobalConfig;
  filePath: string;
}

/**
 * Parses --channel alias=id pairs from CLI args.
 * Returns a record of alias → channel snowflake, or an error string.
 */
export function parseChannelArgs(channelArgs: string[]): Record<string, string> | string {
  const channels: Record<string, string> = {};
  for (const entry of channelArgs) {
    const eqIdx = entry.indexOf("=");
    if (eqIdx === -1) {
      return `Invalid --channel value "${entry}": expected format alias=snowflake_id`;
    }
    const alias = entry.slice(0, eqIdx).trim();
    const id = entry.slice(eqIdx + 1).trim();
    if (!alias) {
      return `Invalid --channel value "${entry}": alias cannot be empty`;
    }
    if (!/^\d{17,20}$/.test(id)) {
      return `Invalid --channel value "${entry}": "${id}" is not a valid Discord snowflake ID (17-20 digits)`;
    }
    channels[alias] = id;
  }
  return channels;
}

/**
 * Builds the GlobalConfig object for the init command.
 * Throws if the resulting config fails schema validation.
 */
export function buildInitConfig(opts: InitOptions): InitResult {
  const cwd = opts.cwd ?? process.cwd();
  const filePath = join(cwd, ".discord-ops.json");

  if (existsSync(filePath) && !opts.force) {
    throw new Error(`.discord-ops.json already exists in ${cwd}. Use --force to overwrite.`);
  }

  const raw: GlobalConfig = {
    projects: {
      [opts.project]: {
        guild_id: opts.guildId,
        token_env: opts.tokenEnv,
        channels: opts.channels,
      },
    },
    default_project: opts.markDefault ? opts.project : undefined,
  };

  // Validate against schema — throws ZodError if invalid
  const parsed = GlobalConfigSchema.parse(raw);

  return { config: parsed, filePath };
}

/**
 * Writes the init config to disk and prints the success message.
 * Separated from buildInitConfig so tests can mock fs writes.
 */
export function writeInitConfig(result: InitResult): void {
  writeFileSync(result.filePath, JSON.stringify(result.config, null, 2) + "\n", "utf-8");
}

/**
 * Parses CLI args for the `discord-ops init` subcommand and returns InitOptions,
 * or throws an error string if required flags are missing or malformed.
 */
export function parseInitArgs(args: string[]): InitOptions {
  let project: string | undefined;
  let guildId: string | undefined;
  let tokenEnv = "DISCORD_TOKEN";
  const channelArgs: string[] = [];
  let force = false;
  let markDefault = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case "--project":
        project = args[++i];
        break;
      case "--guild-id":
        guildId = args[++i];
        break;
      case "--token-env":
        tokenEnv = args[++i] ?? tokenEnv;
        break;
      case "--channel":
        if (args[i + 1] !== undefined) {
          channelArgs.push(args[++i]!);
        }
        break;
      case "--force":
        force = true;
        break;
      case "--default":
        markDefault = true;
        break;
      default:
        break;
    }
  }

  const errors: string[] = [];
  if (!project) errors.push("--project <name> is required");
  if (!guildId) errors.push("--guild-id <snowflake> is required");

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const channelsResult = parseChannelArgs(channelArgs);
  if (typeof channelsResult === "string") {
    throw new Error(channelsResult);
  }

  return {
    project: project!,
    guildId: guildId!,
    tokenEnv,
    channels: channelsResult,
    force,
    markDefault,
  };
}

/**
 * Entry point for the `discord-ops init` subcommand.
 * Parses args, builds config, validates, writes to disk, prints result.
 */
export async function runInit(args: string[]): Promise<void> {
  let opts: InitOptions;
  try {
    opts = parseInitArgs(args);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    console.error("\nUsage: discord-ops init --project <name> --guild-id <snowflake> [options]");
    console.error("  --token-env <VAR>       Env var for bot token (default: DISCORD_TOKEN)");
    console.error("  --channel <alias>=<id>  Channel alias (repeatable)");
    console.error("  --force                 Overwrite existing .discord-ops.json");
    console.error("  --default               Mark as default_project");
    process.exit(1);
  }

  let result: InitResult;
  try {
    result = buildInitConfig(opts);
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  try {
    writeInitConfig(result);
  } catch (err) {
    console.error("Error writing config:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(
    `\u2713 Created .discord-ops.json for project "${opts.project}" (guild: ${opts.guildId})`,
  );
}
