import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { logger } from "../utils/logger.js";
import {
  GlobalConfigSchema,
  PerProjectConfigSchema,
  type GlobalConfig,
  type PerProjectConfig,
} from "./schema.js";

export interface LoadedConfig {
  global: GlobalConfig;
  perProject?: PerProjectConfig;
  token: string;
}

/**
 * Loads config from environment + files.
 *
 * Resolution priority:
 *  1. Per-project `.discord-ops.json` (cwd)
 *  2. Global `~/.discord-ops.json` or DISCORD_OPS_CONFIG env var
 *  3. Direct params always work regardless
 */
export function loadConfig(): LoadedConfig {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN environment variable is required");
  }

  const global = loadGlobalConfig();
  const perProject = loadPerProjectConfig();

  return { global, perProject, token };
}

function loadGlobalConfig(): GlobalConfig {
  const configPath =
    process.env.DISCORD_OPS_CONFIG ?? resolve(homedir(), ".discord-ops.json");

  if (!existsSync(configPath)) {
    logger.debug("No global config found", { path: configPath });
    return { projects: {} };
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return GlobalConfigSchema.parse(raw);
  } catch (err) {
    logger.warn("Failed to parse global config, using empty config", {
      path: configPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return { projects: {} };
  }
}

function loadPerProjectConfig(): PerProjectConfig | undefined {
  const configPath = join(process.cwd(), ".discord-ops.json");

  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return PerProjectConfigSchema.parse(raw);
  } catch (err) {
    logger.warn("Failed to parse per-project config", {
      path: configPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

export { type GlobalConfig, type PerProjectConfig } from "./schema.js";
