import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";
import { getTokenForProject } from "../../config/index.js";
import { getDefaultProjectName, resolveProject } from "../../config/profiles.js";
import {
  type ChannelWebhook,
  NO_WEBHOOK_CHANNEL_ERROR,
  isPersonaCapable,
  routingFields,
  supportsWebhooks,
} from "./persona-webhook.js";

const inputSchema = z.object(routingFields);

const PERSONA_NOTE =
  "Persona identity is per-message: any persona name/avatar can be posted through these webhooks via " +
  "send_as — they are identity carriers, not fixed identities.";

function serializeWebhooks(webhooks: ChannelWebhook[], botUserId: string | undefined) {
  return webhooks
    .filter((wh) => isPersonaCapable(wh, botUserId))
    .map((wh) => ({
      webhook_id: wh.id,
      name: wh.name,
      channel_id: wh.channelId,
      created_at: wh.createdAt?.toISOString() ?? null,
    }));
}

export const listPersonas = defineTool({
  name: "list_personas",
  description:
    "List persona-capable webhooks — the carriers of agent persona identities. Scope to one channel via " +
    "channel/channel_id, or list guild-wide via guild_id or project. Any persona name can be used per-message " +
    "through these webhooks via send_as; no per-persona registration exists on Discord's side. " +
    "Requires ManageWebhooks permission.",
  category: "personas",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    // Channel-scoped listing
    if (input.channel_id || input.channel) {
      const target = await resolveTarget(input, ctx.config, ctx.discord);
      if ("error" in target) {
        return toolResult(target.error, true);
      }

      const channel = await ctx.discord.getChannel(target.channelId, target.token);
      if (!supportsWebhooks(channel)) {
        return toolResult(NO_WEBHOOK_CHANNEL_ERROR, true);
      }

      const client = await ctx.discord.getClient(target.token);
      const webhooks = await channel.fetchWebhooks();
      const personaWebhooks = serializeWebhooks([...webhooks.values()], client.user?.id);

      return toolResultJson({
        scope: "channel",
        channel_id: target.channelId,
        ...(target.project ? { project: target.project } : {}),
        count: personaWebhooks.length,
        persona_webhooks: personaWebhooks,
        note: PERSONA_NOTE,
      });
    }

    // Guild-wide listing — resolve guild from direct guild_id or project config
    let guildId = input.guild_id;
    let projectName = input.project;
    if (!guildId) {
      projectName = projectName ?? getDefaultProjectName(ctx.config.global, ctx.config.perProject);
      if (!projectName) {
        return toolResult(
          "Provide guild_id, project, or channel/channel_id to scope the persona listing",
          true,
        );
      }
      const project = resolveProject(projectName, ctx.config.global, ctx.config.perProject);
      if (!project) {
        return toolResult(`Project "${projectName}" not found in config`, true);
      }
      guildId = project.guildId;
    }

    const token = projectName ? getTokenForProject(projectName, ctx.config) : undefined;
    const guild = await ctx.discord.getGuild(guildId, token);
    const client = await ctx.discord.getClient(token);
    const webhooks = await guild.fetchWebhooks();
    const personaWebhooks = serializeWebhooks(
      [...webhooks.values()] as ChannelWebhook[],
      client.user?.id,
    );

    return toolResultJson({
      scope: "guild",
      guild_id: guildId,
      ...(projectName ? { project: projectName } : {}),
      count: personaWebhooks.length,
      persona_webhooks: personaWebhooks,
      note: PERSONA_NOTE,
    });
  },
});
