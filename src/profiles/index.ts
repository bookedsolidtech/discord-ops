/**
 * Tool profiles for loading subsets of tools.
 * Reduces schema overhead when agents only need a few tools.
 */

import type { ToolDefinition } from "../tools/types.js";

export const PROFILE_NAMES = [
  "full",
  "monitoring",
  "readonly",
  "moderation",
  "messaging",
  "channels",
  "webhooks",
] as const;
export type ProfileName = (typeof PROFILE_NAMES)[number];

export const PROFILES: Record<ProfileName, string[] | "all"> = {
  full: "all",
  monitoring: [
    "get_messages",
    "send_message",
    "add_reaction",
    "create_thread",
    "health_check",
    "list_projects",
  ],
  readonly: [
    "get_messages",
    "list_channels",
    "list_members",
    "get_guild",
    "health_check",
    "list_projects",
  ],
  moderation: [
    "get_messages",
    "kick_member",
    "ban_member",
    "timeout_member",
    "delete_message",
    "purge_messages",
    "query_audit_log",
  ],
  messaging: ["add_reaction", "delete_message", "edit_message", "get_messages", "send_message"],
  channels: [
    "create_channel",
    "delete_channel",
    "edit_channel",
    "get_channel",
    "list_channels",
    "purge_messages",
    "set_slowmode",
  ],
  webhooks: [
    "create_webhook",
    "delete_webhook",
    "edit_webhook",
    "execute_webhook",
    "get_webhook",
    "list_webhooks",
  ],
};

/**
 * Validates that all tool names referenced in profiles exist in the full tool list.
 * Called at server startup to catch stale profile entries.
 */
export function validateProfileToolNames(allToolNames: Set<string>): void {
  for (const [profileName, tools] of Object.entries(PROFILES)) {
    if (tools === "all") continue;
    const unknown = tools.filter((name) => !allToolNames.has(name));
    if (unknown.length > 0) {
      throw new Error(`Profile "${profileName}" references unknown tools: ${unknown.join(", ")}`);
    }
  }
}

export function isProfileName(s: string): s is ProfileName {
  return PROFILE_NAMES.includes(s as ProfileName);
}

export interface FilterOptions {
  profile?: string;
  tools?: string[];
  add?: string[];
  remove?: string[];
}

/**
 * Filter the full tool list by profile or explicit tool names.
 * `tools` takes precedence over `profile`.
 * `add`/`remove` modify the resolved profile set (ignored when `tools` is used).
 * Throws on unknown profile or tool names.
 */
export function filterTools(allTools: ToolDefinition[], options?: FilterOptions): ToolDefinition[] {
  if (!options) return allTools;

  const allNames = new Set(allTools.map((t) => t.name));

  // Validate add/remove names against the full tool list
  const addTools = options.add?.filter(Boolean) ?? [];
  const removeTools = options.remove?.filter(Boolean) ?? [];

  if (addTools.length > 0) {
    const unknown = addTools.filter((n) => !allNames.has(n));
    if (unknown.length > 0) {
      throw new Error(`tool_profile_add references unknown tools: ${unknown.join(", ")}`);
    }
  }
  if (removeTools.length > 0) {
    const unknown = removeTools.filter((n) => !allNames.has(n));
    if (unknown.length > 0) {
      throw new Error(`tool_profile_remove references unknown tools: ${unknown.join(", ")}`);
    }
  }

  // Explicit tool list takes precedence (add/remove ignored)
  if (options.tools && options.tools.length > 0) {
    const unknown = options.tools.filter((n) => !allNames.has(n));
    if (unknown.length > 0) {
      throw new Error(`Unknown tool names: ${unknown.join(", ")}`);
    }
    const selected = new Set(options.tools);
    return allTools.filter((t) => selected.has(t.name));
  }

  // Profile-based filtering
  if (options.profile) {
    if (!isProfileName(options.profile)) {
      throw new Error(
        `Unknown profile "${options.profile}". Valid profiles: ${PROFILE_NAMES.join(", ")}`,
      );
    }
    const profileTools = PROFILES[options.profile];

    // Start with the base set
    let selected: Set<string>;
    if (profileTools === "all") {
      selected = new Set(allNames);
    } else {
      const unknown = profileTools.filter((n) => !allNames.has(n));
      if (unknown.length > 0) {
        throw new Error(
          `Profile "${options.profile}" references unknown tools: ${unknown.join(", ")}`,
        );
      }
      selected = new Set(profileTools);
    }

    // Apply add/remove overrides
    for (const name of addTools) {
      selected.add(name);
    }
    for (const name of removeTools) {
      selected.delete(name);
    }

    return allTools.filter((t) => selected.has(t.name));
  }

  return allTools;
}
