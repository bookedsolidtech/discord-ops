import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson, toolResult } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { buildOwnerMentions } from "../../config/owners.js";
import { NotificationType } from "../../config/schema.js";

const inputSchema = z.object({
  project: z
    .string()
    .describe("Project name — owners and notify_owners_on are read from this project's config"),
  notification_type: NotificationType.describe(
    "Notification type — must be in the project's notify_owners_on list or no ping is sent",
  ),
  channel_id: snowflakeId.optional().describe("Direct channel ID (overrides project default)"),
  channel: z.string().optional().describe("Channel alias within the project"),
  message: z
    .string()
    .max(1800)
    .optional()
    .describe("Optional message text to append after the mentions"),
});

export const notifyOwners: ToolDefinition = {
  name: "notify_owners",
  description:
    "Ping project owners in a channel based on notification_type. Sends owner <@mention>s only — no embed, no template. Use when you need a raw ping without a full message. No-ops silently if notification_type is not in the project's notify_owners_on list.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const mentions = buildOwnerMentions(input.project, input.notification_type, ctx.config);

    if (mentions === null) {
      return toolResult(`Project "${input.project}" not found in config.`, true);
    }

    if (!mentions) {
      return toolResult(
        `No ping sent — "${input.notification_type}" is not in notify_owners_on for project "${input.project}", or no owners configured.`,
      );
    }

    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const content = input.message ? `${mentions}\n${input.message}` : mentions;
    const message = await channel.send({ content });

    return toolResultJson({
      id: message.id,
      channel_id: message.channelId,
      mentions,
      notification_type: input.notification_type,
      project: input.project,
      timestamp: message.createdAt.toISOString(),
    });
  },
};
