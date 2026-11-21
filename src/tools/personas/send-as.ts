import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { isPublicHttpUrl } from "../../utils/og-fetch.js";
import { getDefaultProjectName } from "../../config/profiles.js";
import { applyPresetEmbedDefaults, findPreset } from "../../config/personas.js";
import { profileGateError } from "../../config/tool-gate.js";
import {
  NO_WEBHOOK_CHANNEL_ERROR,
  ensurePersonaWebhook,
  personaEmbedSchema as embedSchema,
  personaName,
  routingFields,
  supportsWebhooks,
} from "./persona-webhook.js";

const inputSchema = z.object({
  persona_name: personaName.describe(
    "Persona to post as — applied as the per-message webhook username override. If it matches a " +
      "persona preset key or name in the project config (case-insensitive), the preset's name, avatar, " +
      "default channel, and embed color/footer are applied as defaults",
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
    "Persona presets (project config `personas`) are applied when persona_name matches a preset key or name: " +
    "preset name as username, preset avatar unless avatar_url is given, preset default_channel when no " +
    "channel/channel_id is given, and preset color/footer on embeds that leave them unset. " +
    "Limitation: the Discord webhook-execution API does not support message references, so reply-to is " +
    "unavailable — post a regular message with send_message if you need a reply. Returns the created message id.",
  category: "personas",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  destructive: true,
  gatesOwnChannels: true,
  handle: async (input, ctx) => {
    if (!input.content && (!input.embeds || input.embeds.length === 0)) {
      return toolResult("At least content or embeds must be provided", true);
    }

    // Persona preset lookup needs the project before routing (default_channel
    // feeds resolveTarget). Mirror resolveTarget's project choice: a direct
    // channel_id only carries the explicitly passed project.
    const projectName = input.channel_id
      ? input.project
      : (input.project ?? getDefaultProjectName(ctx.config.global, ctx.config.perProject));
    const matched = projectName
      ? findPreset(ctx.config.global.projects[projectName], input.persona_name)
      : undefined;
    const preset = matched?.preset;
    const username = preset?.name ?? input.persona_name;
    const avatarUrl = input.avatar_url ?? preset?.avatar_url;
    const embeds = input.embeds?.map((embed) => applyPresetEmbedDefaults(embed, preset));
    const defaultAlias = !input.channel && !input.channel_id ? preset?.default_channel : undefined;
    if (defaultAlias !== undefined) {
      // A preset default channel must be an exact alias — never fuzzy- or
      // live-name-matched onto some other channel.
      const channels = projectName ? ctx.config.global.projects[projectName]?.channels : undefined;
      if (
        !projectName ||
        !channels ||
        !Object.prototype.hasOwnProperty.call(channels, defaultAlias)
      ) {
        return toolResult(
          `Persona preset "${matched?.key}" default_channel "${defaultAlias}" is not a configured channel alias in project "${projectName}"`,
          true,
        );
      }
    }
    const routing = defaultAlias !== undefined ? { ...input, channel: defaultAlias } : input;

    // gatesOwnChannels: the server enforced only the project-level profile, so
    // gate the bot that serves the actual destination here — the same check
    // the server would make for an explicit channel, now also covering a
    // preset's default channel.
    if (projectName && (input.project || defaultAlias !== undefined)) {
      const gate = profileGateError("send_as", projectName, routing.channel, ctx.config);
      if (gate) return toolResult(gate, true);
    }

    // Validate all URL fields to prevent SSRF via Discord's CDN proxy —
    // same policy as execute_webhook. A preset avatar is checked too.
    if (avatarUrl !== undefined && !isPublicHttpUrl(avatarUrl)) {
      return toolResult(
        `avatar_url references a private or reserved address and cannot be used: ${avatarUrl}`,
        true,
      );
    }
    if (embeds) {
      for (const embed of embeds) {
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

    const target = await resolveTarget(routing, ctx.config, ctx.discord);
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
      username,
      avatarURL: avatarUrl,
      embeds,
      ...(input.thread_id ? { threadId: input.thread_id } : {}),
    });

    // SECURITY: never include webhook.token or webhook.url in the result.
    return toolResultJson({
      id: message.id,
      message_id: message.id,
      channel_id: message.channelId,
      persona: username,
      ...(matched ? { preset: matched.key } : {}),
      webhook_id: webhook.id,
      thread_id: input.thread_id ?? null,
      timestamp: message.createdAt?.toISOString(),
      ...(target.project ? { project: target.project } : {}),
    });
  },
});
