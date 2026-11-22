import type { ToolContext } from "../tools/types.js";
import { callGuilds } from "./direct-post-gate.js";

/**
 * Tools `deny_tools` can refuse. Each is routed only by guild_id, channel_id,
 * or a project channel alias, so the gate resolves exactly the guild the
 * handler acts in. Other tools route through boards, webhooks, application
 * settings or channel-level bot overrides and are not supported: naming one
 * fails server startup instead of denying nothing.
 */
export const DENYABLE_TOOLS = new Set([
  "ban_member",
  "kick_member",
  "unban_member",
  "timeout_member",
  "delete_role",
  "delete_channel",
  "purge_messages",
  "delete_message",
]);

/**
 * Per-project `deny_tools`: tools the AI may never run in that project's
 * guild, whatever project, alias, channel_id or guild_id the call uses.
 * Enforced centrally by the server before the tool runs. Independent of tool
 * profiles (the "full" profile short-circuits and would never see it).
 * Fails closed: a denied tool whose guild cannot be determined is refused.
 */
export async function denyToolsGateError(
  toolName: string,
  parsed: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string | undefined> {
  const denying = Object.entries(ctx.config.global.projects).filter(([, p]) =>
    p.deny_tools?.includes(toolName),
  );
  if (denying.length === 0) return undefined;

  const guilds = await callGuilds(toolName, parsed, ctx);
  const names = denying.map(([name]) => `"${name}"`).join(", ");
  if (guilds === "unknown" || guilds.size === 0) {
    return (
      `${toolName} is blocked: project(s) ${names} deny it (deny_tools) and this call's guild could ` +
      "not be determined. A person has to do this in Discord."
    );
  }
  const hit = denying.find(([, p]) => guilds.has(p.guild_id));
  if (!hit) return undefined;
  return (
    `${toolName} is not allowed for project "${hit[0]}" (deny_tools). ` +
    "A person has to do this in Discord."
  );
}

/** deny_tools entries that are unknown or unsupported (each would deny nothing). */
export function invalidDeniedTools(projects: Record<string, { deny_tools?: string[] }>): string[] {
  const invalid: string[] = [];
  for (const [project, p] of Object.entries(projects)) {
    for (const name of p.deny_tools ?? []) {
      if (!DENYABLE_TOOLS.has(name)) invalid.push(`${project}: ${name}`);
    }
  }
  return invalid;
}
