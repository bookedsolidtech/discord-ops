import { getBotPersona, type LoadedConfig } from "./index.js";
import { resolveProject } from "./profiles.js";
import { PROFILES, isProfileName } from "../profiles/index.js";

/**
 * Per-project / per-bot tool profile gate. The effective profile is the
 * project's tool_profile, else the default_profile of the bot that serves
 * the channel (a channel-level bot override, then the project bot).
 *
 * Returns the refusal text when the tool is not allowed, undefined otherwise.
 * Used by the server's runtime gate and by tools that resolve their own
 * destination channels (the posting kit), so a channel served by a
 * restricted bot cannot be reached through a nested channel field.
 */
export function profileGateError(
  toolName: string,
  projectName: string,
  channelAlias: string | undefined,
  config: LoadedConfig,
  options: { projectLevelOnly?: boolean } = {},
): string | undefined {
  const resolvedProj = resolveProject(projectName, config.global, config.perProject);
  if (!resolvedProj) return undefined;

  let effectiveProfile = resolvedProj.toolProfile;
  let effectiveAdd = resolvedProj.toolProfileAdd;
  let effectiveRemove = resolvedProj.toolProfileRemove;

  // projectLevelOnly: the caller gates each resolved destination's bot itself.
  if (!effectiveProfile && !options.projectLevelOnly) {
    const persona = getBotPersona(projectName, channelAlias, config);
    if (persona) {
      effectiveProfile = persona.default_profile;
      if (!effectiveAdd) effectiveAdd = persona.profile_add;
      if (!effectiveRemove) effectiveRemove = persona.profile_remove;
    }
  }

  if (!effectiveProfile || !isProfileName(effectiveProfile)) return undefined;
  const profileTools = PROFILES[effectiveProfile];
  if (profileTools === "all") return undefined;

  const allowed = new Set(profileTools);
  for (const name of effectiveAdd ?? []) allowed.add(name);
  for (const name of effectiveRemove ?? []) allowed.delete(name);
  if (allowed.has(toolName)) return undefined;
  return `Tool "${toolName}" is not allowed by the "${effectiveProfile}" profile for project "${projectName}"`;
}
