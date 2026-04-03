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
  defaultToken?: string;
}

/**
 * Resolves the token for a given project.
 * If the project has `token_env`, reads that env var.
 * Otherwise falls back to the default DISCORD_TOKEN.
 */
export function getTokenForProject(projectName: string, config: LoadedConfig): string {
  const project = config.global.projects[projectName];
  if (project?.token_env) {
    const token = process.env[project.token_env];
    if (token) return token;
    logger.warn(
      `token_env "${project.token_env}" for project "${projectName}" is not set, falling back to default token`,
    );
  }
  if (!config.defaultToken) {
    const hint = project?.token_env
      ? `Set the ${project.token_env} environment variable, or set a default token via DISCORD_TOKEN / DISCORD_OPS_TOKEN_ENV.`
      : `Add token_env to this project's config, or set a default token via DISCORD_TOKEN / DISCORD_OPS_TOKEN_ENV.`;
    throw new Error(`No token available for project "${projectName}". ${hint}`);
  }
  return config.defaultToken;
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
  // Option A: DISCORD_OPS_TOKEN_ENV lets callers specify which env var holds the default token.
  // Validate the name to prevent arbitrary env var exfiltration (C-2).
  const tokenEnvName = process.env.DISCORD_OPS_TOKEN_ENV ?? "DISCORD_TOKEN";
  if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(tokenEnvName)) {
    throw new Error(
      `DISCORD_OPS_TOKEN_ENV must be a valid env var name (uppercase letters, digits, underscores, max 64 chars). Got: "${tokenEnvName}"`,
    );
  }
  const defaultToken = process.env[tokenEnvName] || undefined;

  const global = loadGlobalConfig();
  const perProject = loadPerProjectConfig();

  // Option B: if no default token, validate that all projects have their own token_env
  if (!defaultToken) {
    const projectEntries = Object.entries(global.projects);

    if (projectEntries.length === 0) {
      throw new Error(
        `${tokenEnvName} environment variable is required (no projects with token_env configured)`,
      );
    }

    const missing = projectEntries
      .filter(([, p]) => !p.token_env || !process.env[p.token_env])
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `${tokenEnvName} is not set, and these projects lack a valid token_env: ${missing.join(", ")}`,
      );
    }

    logger.info(
      `No default token set — all ${projectEntries.length} project(s) use per-project token_env`,
    );
  }

  return { global, perProject, defaultToken };
}

function loadGlobalConfig(): GlobalConfig {
  const configEnv = process.env.DISCORD_OPS_CONFIG;

  // Support inline JSON — useful for CI where writing files is inconvenient.
  // If DISCORD_OPS_CONFIG starts with '{', treat it as a JSON string directly.
  if (configEnv?.trimStart().startsWith("{")) {
    let raw: unknown;
    try {
      raw = JSON.parse(configEnv);
    } catch (err) {
      throw new Error(
        `DISCORD_OPS_CONFIG contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return GlobalConfigSchema.parse(raw);
  }

  // H-4: Resolve to absolute path and require .json extension to guard against path traversal
  // or accidental reads of sensitive non-JSON files.
  const configPath = resolve(configEnv ?? join(homedir(), ".discord-ops.json"));
  if (!configPath.endsWith(".json")) {
    throw new Error(`DISCORD_OPS_CONFIG path must end in ".json". Got: "${configPath}"`);
  }

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
