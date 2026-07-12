import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { reason } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { isPublicHttpUrl } from "../../utils/og-fetch.js";
import {
  NO_WEBHOOK_CHANNEL_ERROR,
  ensurePersonaWebhook,
  personaName,
  routingFields,
  supportsWebhooks,
} from "./persona-webhook.js";

const inputSchema = z.object({
  name: personaName.describe(
    "Persona display name — used as the per-message username override when posting via send_as",
  ),
  avatar_url: z
    .string()
    .url()
    .optional()
    .describe("Avatar URL for the persona — must be a public HTTP/HTTPS URL"),
  ...routingFields,
  reason,
});

export const createPersona = defineTool({
  name: "create_persona",
  description:
    "Register an agent persona on a channel — a named posting identity that replaces creating new Discord bots. " +
    "Ensures the channel has a persona-capable webhook (reuses a bot-owned one or creates one), then returns the " +
    "persona descriptor. Persona identity is applied per-message via username/avatar overrides, so one webhook " +
    "carries unlimited personas with zero Discord-portal setup. Post as the persona with send_as. " +
    "Requires ManageWebhooks permission.",
  category: "personas",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    if (input.avatar_url !== undefined && !isPublicHttpUrl(input.avatar_url)) {
      return toolResult(
        `avatar_url references a private or reserved address and cannot be used: ${input.avatar_url}`,
        true,
      );
    }

    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return toolResult(target.error, true);
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    if (!supportsWebhooks(channel)) {
      return toolResult(NO_WEBHOOK_CHANNEL_ERROR, true);
    }

    const client = await ctx.discord.getClient(target.token);
    const { webhook, reused } = await ensurePersonaWebhook(channel, client.user?.id, input.reason);

    // SECURITY: never include webhook.token or webhook.url — the server holds
    // the token internally; leaking it grants anyone posting rights.
    return toolResultJson({
      persona: {
        name: input.name,
        avatar_url: input.avatar_url ?? null,
      },
      webhook_id: webhook.id,
      channel_id: webhook.channelId,
      webhook_name: webhook.name,
      reused_existing_webhook: reused,
      ...(target.project ? { project: target.project } : {}),
      note:
        `Persona identity is per-message. Post with send_as { persona_name: "${input.name}" } — ` +
        "the same webhook carries unlimited personas; no new Discord bot is needed.",
    });
  },
});
