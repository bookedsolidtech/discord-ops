import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { isPublicHttpUrl } from "../../utils/og-fetch.js";
import {
  NO_WEBHOOK_CHANNEL_ERROR,
  ensurePersonaWebhook,
  personaName,
  routingFields,
  supportsWebhooks,
} from "./persona-webhook.js";

/** Embed passthrough — same shape as execute_webhook. */
const embedSchema = z.object({
  title: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  color: z.number().optional(),
  url: z.string().url().optional().describe("Embed URL — must be a public HTTP/HTTPS URL"),
  footer: z.object({ text: z.string() }).optional(),
  timestamp: z.string().optional(),
  image: z
    .object({ url: z.string().url().describe("Image URL — must be a public HTTP/HTTPS URL") })
    .optional(),
  thumbnail: z
    .object({ url: z.string().url().describe("Thumbnail URL — must be a public HTTP/HTTPS URL") })
    .optional(),
  author: z
    .object({
      name: z.string(),
      url: z.string().url().optional().describe("Author URL — must be a public HTTP/HTTPS URL"),
      icon_url: z
        .string()
        .url()
        .optional()
        .describe("Author icon URL — must be a public HTTP/HTTPS URL"),
    })
    .optional(),
  fields: z
    .array(
      z.object({
        name: z.string().max(256),
        value: z.string().max(1024),
        inline: z.boolean().optional(),
      }),
    )
    .max(25)
    .optional(),
});

const inputSchema = z.object({
  persona_name: personaName.describe(
    "Persona to post as — applied as the per-message webhook username override",
  ),
  avatar_url: z
    .string()
    .url()
    .optional()
    .describe("Per-message avatar override — must be a public HTTP/HTTPS URL"),
  content: z.string().max(2000).optional().describe("Message content (max 2000 chars)"),
  embeds: z
    .array(embedSchema)
    .max(10)
    .optional()
    .describe("Array of embed objects (max 10), same shape as execute_webhook"),
  thread_id: snowflakeId
    .optional()
    .describe("Post into this thread of the target channel (webhook thread targeting)"),
  ...routingFields,
});

export const sendAs = defineTool({
  name: "send_as",
  description:
    "Post a message AS a named agent persona — the agent-persona posting primitive. Persona identity is " +
    "per-message: the channel's persona webhook is executed with a username/avatar override, so unlimited " +
    "named identities share one webhook and no new Discord bots are ever created. Auto-provisions the persona " +
    "webhook if the channel has none (see create_persona). Supports embeds and thread_id targeting. " +
    "Limitation: the Discord webhook-execution API does not support message references, so reply-to is " +
    "unavailable — post a regular message with send_message if you need a reply. Returns the created message id.",
  category: "personas",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  destructive: true,
  handle: async (input, ctx) => {
    if (!input.content && (!input.embeds || input.embeds.length === 0)) {
      return toolResult("At least content or embeds must be provided", true);
    }

    // Validate all URL fields to prevent SSRF via Discord's CDN proxy —
    // same policy as execute_webhook.
    if (input.avatar_url !== undefined && !isPublicHttpUrl(input.avatar_url)) {
      return toolResult(
        `avatar_url references a private or reserved address and cannot be used: ${input.avatar_url}`,
        true,
      );
    }
    if (input.embeds) {
      for (const embed of input.embeds) {
        const urlsToCheck: Array<{ field: string; url: string | undefined }> = [
          { field: "embed.url", url: embed.url },
          { field: "embed.image.url", url: embed.image?.url },
          { field: "embed.thumbnail.url", url: embed.thumbnail?.url },
          { field: "embed.author.url", url: embed.author?.url },
          { field: "embed.author.icon_url", url: embed.author?.icon_url },
        ];
        for (const { field, url } of urlsToCheck) {
          if (url !== undefined && !isPublicHttpUrl(url)) {
            return toolResult(
              `${field} references a private or reserved address and cannot be used in an embed: ${url}`,
              true,
            );
          }
        }
      }
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
    const { webhook } = await ensurePersonaWebhook(channel, client.user?.id);

    // discord.js executes webhooks with wait=true, so the created message
    // (with id) is returned. Note: WebhookMessageCreateOptions omits `reply` —
    // the webhook-execution endpoint has no message_reference support.
    const message = await webhook.send({
      content: input.content,
      username: input.persona_name,
      avatarURL: input.avatar_url,
      embeds: input.embeds,
      ...(input.thread_id ? { threadId: input.thread_id } : {}),
    });

    // SECURITY: never include webhook.token or webhook.url in the result.
    return toolResultJson({
      id: message.id,
      message_id: message.id,
      channel_id: message.channelId,
      persona: input.persona_name,
      webhook_id: webhook.id,
      thread_id: input.thread_id ?? null,
      timestamp: message.createdAt?.toISOString(),
      ...(target.project ? { project: target.project } : {}),
    });
  },
});
