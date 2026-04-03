import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { fetchOgMetadata } from "../../utils/og-fetch.js";

const inputSchema = z.object({
  url: z.string().url().describe("URL to unfurl as a rich embed"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  notification_type: z.string().optional().describe("Notification type for auto-routing"),
  title: z.string().max(256).optional().describe("Override OG title"),
  description: z.string().max(4096).optional().describe("Override OG description"),
  image_url: z.string().url().optional().describe("Override OG image URL"),
  color: z.number().int().min(0).max(0xffffff).optional().describe("Embed color as integer"),
  footer: z.string().max(2048).optional().describe("Footer text"),
});

export const sendEmbed: ToolDefinition = {
  name: "send_embed",
  description:
    "Send a rich Discord embed by fetching Open Graph metadata from a URL. Automatically extracts title, description, and image from the page. Supports overrides for all OG fields plus color and footer.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const og = await fetchOgMetadata(input.url);

    const embed: Record<string, unknown> = {
      url: input.url,
    };

    const title = input.title ?? og.title;
    if (title) embed.title = title;

    const description = input.description ?? og.description;
    if (description) embed.description = description;

    if (input.color !== undefined) embed.color = input.color;

    const imageUrl = input.image_url ?? og.image;
    if (imageUrl) embed.image = { url: imageUrl };

    if (input.footer) embed.footer = { text: input.footer };

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const message = await channel.send({ embeds: [embed] });

    return toolResultJson({
      id: message.id,
      channel_id: message.channelId,
      url: input.url,
      og_fetched: Object.keys(og).length > 0,
      ...(target.project ? { project: target.project } : {}),
    });
  },
};
