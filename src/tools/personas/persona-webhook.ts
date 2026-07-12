import { z } from "zod";
import type { Collection, Snowflake, TextChannel, Webhook, WebhookType } from "discord.js";
import { snowflakeId } from "../schema.js";

/**
 * Shared plumbing for the agent-persona identity layer.
 *
 * Personas are NOT separate Discord bots — they are per-message identity
 * overrides (username + avatar) on a single bot-owned "incoming" webhook.
 * One webhook per channel carries unlimited personas with zero Discord
 * developer-portal involvement.
 */

/**
 * Default name for the webhook that carries persona messages on a channel.
 * Discord rejects webhook names containing "discord" (USERNAME_INVALID_CONTAINS,
 * verified live), so the package name cannot appear here.
 */
export const PERSONA_WEBHOOK_NAME = "agent personas";

export type ChannelWebhook = Webhook<WebhookType.ChannelFollower | WebhookType.Incoming>;
export type ChannelWebhookCollection = Collection<Snowflake, ChannelWebhook>;

/**
 * Persona display name — used as the per-message webhook username override.
 * Discord rejects webhook usernames containing "clyde" or "discord"
 * (case-insensitive) and caps them at 80 characters.
 */
export const personaName = z
  .string()
  .min(1)
  .max(80)
  .refine((name) => !/clyde|discord/i.test(name), {
    message: 'Discord rejects webhook usernames containing "clyde" or "discord"',
  });

/** Routing inputs shared by all persona tools — mirrors resolver.ResolveParams. */
export const routingFields = {
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
};

/**
 * Narrow check that a resolved channel can host webhooks. Threads cannot —
 * webhooks live on the thread's parent channel (use send_as thread_id
 * targeting instead).
 */
export function supportsWebhooks(channel: unknown): channel is TextChannel {
  return (
    typeof channel === "object" &&
    channel !== null &&
    "fetchWebhooks" in channel &&
    "createWebhook" in channel
  );
}

export const NO_WEBHOOK_CHANNEL_ERROR =
  "Channel does not support webhooks. For threads, target the parent channel and pass thread_id to send_as.";

/**
 * A webhook is persona-capable when it is an incoming webhook the server can
 * execute (token present) and it belongs to this bot (or ownership is
 * unknowable). Foreign webhooks are never reused — executing another
 * application's webhook would post outside our audit surface.
 */
export function isPersonaCapable(webhook: ChannelWebhook, botUserId: string | undefined): boolean {
  if (!webhook.token) return false;
  if (!botUserId || !webhook.owner) return true;
  return webhook.owner.id === botUserId;
}

export interface EnsuredPersonaWebhook {
  webhook: ChannelWebhook;
  reused: boolean;
}

/**
 * Finds an existing persona-capable webhook on the channel (preferring one
 * named PERSONA_WEBHOOK_NAME) or creates one. Idempotent — repeated calls
 * reuse the same webhook.
 *
 * SECURITY: callers must never serialize webhook.token or webhook.url into
 * tool results — the server holds the token internally via discord.js.
 */
export async function ensurePersonaWebhook(
  channel: TextChannel,
  botUserId: string | undefined,
  reason?: string,
): Promise<EnsuredPersonaWebhook> {
  const webhooks = await channel.fetchWebhooks();
  const candidates = [...webhooks.values()].filter((wh) => isPersonaCapable(wh, botUserId));
  const existing = candidates.find((wh) => wh.name === PERSONA_WEBHOOK_NAME) ?? candidates[0];
  if (existing) {
    return { webhook: existing, reused: true };
  }

  const created = await channel.createWebhook({
    name: PERSONA_WEBHOOK_NAME,
    reason: reason ?? "discord-ops agent persona webhook",
  });
  return { webhook: created as ChannelWebhook, reused: false };
}
