import type { ToolDefinition } from "./types.js";

/**
 * Named tool profiles that limit which tools are exposed by the MCP server.
 * A profile value of "all" exposes every registered tool.
 * An array value lists the exact tool names to expose.
 */
export const PROFILES: Record<string, readonly string[] | "all"> = {
  all: "all",
  readonly: [
    "get_channel",
    "get_guild",
    "get_member",
    "get_messages",
    "get_webhook",
    "health_check",
    "list_channels",
    "list_guilds",
    "list_members",
    "list_roles",
    "list_threads",
    "list_webhooks",
    "query_audit_log",
  ],
  messaging: [
    "add_reaction",
    "delete_message",
    "edit_message",
    "get_messages",
    "send_message",
  ],
  moderation: [
    "ban_member",
    "kick_member",
    "purge_messages",
    "query_audit_log",
    "timeout_member",
    "unban_member",
  ],
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
} satisfies Record<string, readonly string[] | "all">;

/**
 * Filters `tools` to only those whose names appear in the named profile.
 * Returns all tools when the profile value is "all" or when the profile name
 * is not found in `PROFILES`.
 */
export function filterTools(
  tools: readonly ToolDefinition[],
  profileName: string,
): ToolDefinition[] {
  const profile = PROFILES[profileName];
  if (profile === undefined || profile === "all") {
    return [...tools];
  }
  const allowed = new Set(profile);
  return tools.filter((t) => allowed.has(t.name));
}
