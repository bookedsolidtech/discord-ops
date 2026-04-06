import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";
import { isPublicHttpUrl } from "../../utils/og-fetch.js";

const inputSchema = z.object({
  webhook_id: snowflakeId.describe("Webhook ID to execute"),
  guild_id: snowflakeId
    .optional()
    .describe("Guild ID (optional, unused — kept for backward compatibility)"),
  content: z.string().max(2000).optional().describe("Message content"),
  username: z.string().max(80).optional().describe("Override the webhook's display name"),
  avatar_url: z.string().url().optional().describe("Override the webhook's avatar URL"),
  embeds: z
    .array(
      z.object({
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
          .object({
            url: z.string().url().describe("Thumbnail URL — must be a public HTTP/HTTPS URL"),
          })
          .optional(),
        author: z
          .object({
            name: z.string(),
            url: z
              .string()
              .url()
              .optional()
              .describe("Author URL — must be a public HTTP/HTTPS URL"),
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
      }),
    )
    .max(10)
    .optional()
    .describe(
      "Array of embed objects (max 10, supports thumbnail, image, author, footer with icon)",
    ),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const executeWebhook = defineTool({
  name: "execute_webhook",
  description:
    "Send a message through a webhook. Supports content, embeds, and username/avatar overrides. Great for CI/CD notifications.",
  category: "webhooks",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  destructive: true,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const client = await ctx.discord.getClient(token);
    const webhook = await client.fetchWebhook(input.webhook_id);

    if (!webhook.token) {
      return toolResult(
        "Webhook has no token — cannot execute (bot-created webhooks without tokens need the webhook token)",
        true,
      );
    }

    if (!input.content && (!input.embeds || input.embeds.length === 0)) {
      return toolResult("At least content or embeds must be provided", true);
    }

    // Validate all URL fields in embeds to prevent SSRF via Discord's CDN proxy.
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

    // Validate avatar_url if provided
    if (input.avatar_url !== undefined && !isPublicHttpUrl(input.avatar_url)) {
      return toolResult(
        `avatar_url references a private or reserved address and cannot be used: ${input.avatar_url}`,
        true,
      );
    }

    const message = await webhook.send({
      content: input.content,
      username: input.username,
      avatarURL: input.avatar_url,
      embeds: input.embeds,
    });

    return toolResultJson({
      id: message.id,
      channel_id: message.channelId,
      webhook_id: input.webhook_id,
      content: message.content,
      timestamp: message.createdAt?.toISOString(),
    });
  },
});
