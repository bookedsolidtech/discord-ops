import type { z } from "zod";
import type { ClientApplication, PermissionResolvable } from "discord.js";
import type { ToolContext, ToolDefinition, ToolResult } from "../types.js";
import { getTokenForProject, type LoadedConfig } from "../../config/index.js";
import { getDefaultProjectName, resolveProject } from "../../config/profiles.js";

/**
 * Botops tools live in the new "botops" category, which is not yet part of the
 * ToolCategory union in src/tools/types.ts (that file is frozen for this change).
 * This factory mirrors defineTool exactly — same field contract, same single-cast
 * erasure pattern — but pins category to "botops". The double cast is confined to
 * this one function; the runtime shape is fully compatible with ToolDefinition.
 */
export function defineBotopsTool<TSchema extends z.ZodType>(definition: {
  name: string;
  description: string;
  category: "botops";
  inputSchema: TSchema;
  permissions?: PermissionResolvable[];
  destructive?: boolean;
  requiresGuild?: boolean;
  handle: (input: z.infer<TSchema>, ctx: ToolContext) => Promise<ToolResult>;
}): ToolDefinition {
  return definition as unknown as ToolDefinition;
}

/**
 * Resolved bot/application routing target.
 * SECURITY: `token` is the raw bot token, required for Discord API calls.
 * Never serialize, log, or include it in tool results.
 */
export interface ResolvedBotTarget {
  token?: string;
  project?: string;
}

/**
 * Resolves which bot token — and therefore which Discord application — a
 * botops tool operates on. The project's token selects the application:
 * in multi-bot setups each project (or its bot persona) maps to its own app.
 *
 * Priority: explicit `project` → configured default project → server default token.
 * An explicitly named project that is missing from config is a hard error so we
 * never silently edit the wrong bot's application.
 */
export function resolveApplicationTarget(
  project: string | undefined,
  config: LoadedConfig,
): ResolvedBotTarget | { error: string } {
  if (project && !config.global.projects[project]) {
    return { error: `Project "${project}" not found in config` };
  }
  const projectName = project ?? getDefaultProjectName(config.global, config.perProject);
  if (projectName) {
    // projectName is either the (already-validated) explicit project or the
    // configured default. A default_project that points at a typoed/removed
    // project must be a HARD error — falling through to the server default
    // token would edit the WRONG application, far worse than a routing error.
    if (!config.global.projects[projectName]) {
      return { error: `Default project "${projectName}" is not defined in config` };
    }
    return { token: getTokenForProject(projectName, config), project: projectName };
  }
  // No project context at all. Fall back to the server default token only if one
  // exists — in per-project-token installs (no default DISCORD_TOKEN) there is
  // no bot to act as, so surface a clear routing error instead of a confusing
  // "token missing" failure deep in the Discord client.
  if (!config.defaultToken) {
    return {
      error:
        "No project specified and no default project or token configured. Pass `project` to " +
        "select which bot's application to edit.",
    };
  }
  return {};
}

/**
 * Resolves a guild target for per-guild bot operations (e.g. nickname).
 * Mirrors the routing resolver's priority: direct guild_id wins (with the
 * project's token when a project is named); otherwise the project — or the
 * configured default project — supplies both guild and token.
 */
export function resolveGuildTarget(
  input: { guild_id?: string; project?: string },
  config: LoadedConfig,
): { guildId: string; token?: string } | { error: string } {
  if (input.guild_id) {
    if (input.project) {
      if (!config.global.projects[input.project]) {
        return { error: `Project "${input.project}" not found in config` };
      }
      return { guildId: input.guild_id, token: getTokenForProject(input.project, config) };
    }
    return { guildId: input.guild_id };
  }

  const projectName = input.project ?? getDefaultProjectName(config.global, config.perProject);
  if (!projectName) {
    return { error: "No guild_id or project specified and no default_project configured" };
  }
  const project = resolveProject(projectName, config.global, config.perProject);
  if (!project) {
    return { error: `Project "${projectName}" not found in config` };
  }
  return { guildId: project.guildId, token: getTokenForProject(projectName, config) };
}

/**
 * Fetches the ClientApplication for the bot serving the given project.
 * Returns an error object (never throws for routing problems) so tools can
 * surface a clean isError result.
 */
export async function getApplicationForProject(
  project: string | undefined,
  ctx: ToolContext,
): Promise<{ app: ClientApplication } | { error: string }> {
  const target = resolveApplicationTarget(project, ctx.config);
  if ("error" in target) return target;

  const client = await ctx.discord.getClient(target.token);
  const app = client.application;
  if (!app) {
    return { error: "Bot application unavailable — the Discord client may not be fully ready" };
  }
  return { app };
}

/**
 * Builds the message-ready emoji identifier for an application emoji.
 * This is the exact string agents pass to add_reaction or embed in message
 * content: `<:name:id>` (or `<a:name:id>` for animated emojis).
 */
export function emojiIdentifier(emoji: {
  id: string;
  name: string | null;
  animated?: boolean | null;
}): string {
  return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
}
