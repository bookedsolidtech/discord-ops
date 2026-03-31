import { z } from "zod";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageCreateOptions,
} from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";
import { renderTemplate } from "../../templates/registry.js";
import { templateVarsSchema } from "../../templates/types.js";
import type { TemplateActionRow, TemplatePoll } from "../../templates/types.js";

const inputSchema = z.object({
  template: z
    .string()
    .describe(
      "Template name: release, deploy, ci_build, incident, incident_resolved, maintenance, status_update, review, celebration, welcome, shoutout, quote, announcement, changelog, milestone, tip, poll, dashboard, progress, oncall, standup, retro, alert",
    ),
  vars: templateVarsSchema,
  channel_id: z.string().optional().describe("Direct channel ID"),
  guild_id: z.string().optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  notification_type: z.string().optional().describe("Notification type for auto-routing"),
});

const BUTTON_STYLE_MAP: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
  link: ButtonStyle.Link,
};

function buildComponents(
  rows?: TemplateActionRow[],
): ActionRowBuilder<ButtonBuilder>[] | undefined {
  if (!rows || rows.length === 0) return undefined;

  return rows.map((row) => {
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    for (const btn of row.buttons) {
      const builder = new ButtonBuilder()
        .setLabel(btn.label)
        .setStyle(BUTTON_STYLE_MAP[btn.style] ?? ButtonStyle.Secondary);

      if (btn.style === "link" && btn.url) {
        builder.setURL(btn.url);
      } else if (btn.custom_id) {
        builder.setCustomId(btn.custom_id);
      }

      if (btn.emoji) {
        builder.setEmoji(btn.emoji);
      }

      if (btn.disabled) {
        builder.setDisabled(true);
      }

      actionRow.addComponents(builder);
    }
    return actionRow;
  });
}

function buildPoll(poll?: TemplatePoll): object | undefined {
  if (!poll) return undefined;

  return {
    question: { text: poll.question },
    answers: poll.answers.map((a) => ({
      poll_media: {
        text: a.text,
        ...(a.emoji ? { emoji: { name: a.emoji } } : {}),
      },
    })),
    duration: poll.duration ?? 24,
    allow_multiselect: poll.allow_multiselect ?? false,
    layout_type: 1,
  };
}

export const sendTemplate: ToolDefinition = {
  name: "send_template",
  description:
    "Send a beautifully formatted Discord message using a built-in template. Supports embeds, link buttons, native polls, multi-embed dashboards, Discord timestamps, and author branding. Use list_templates for full details on all 23 templates.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = resolveTarget(input, ctx.config);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const rendered = renderTemplate(input.template, input.vars);
    const channel = await ctx.discord.getChannel(target.channelId, target.token);

    const messageOptions: MessageCreateOptions = {
      ...(rendered.content ? { content: rendered.content } : {}),
      ...(rendered.embeds.length > 0 ? { embeds: rendered.embeds } : {}),
    };

    // Add button components
    const components = buildComponents(rendered.components);
    if (components) {
      messageOptions.components = components;
    }

    // Add native poll
    const poll = buildPoll(rendered.poll);
    if (poll) {
      (messageOptions as Record<string, unknown>).poll = poll;
    }

    const message = await channel.send(messageOptions);

    return toolResultJson({
      id: message.id,
      channel_id: message.channelId,
      template: input.template,
      timestamp: message.createdAt.toISOString(),
      ...(target.project ? { project: target.project } : {}),
      ...(rendered.components ? { has_components: true } : {}),
      ...(rendered.poll ? { has_poll: true } : {}),
      ...(rendered.embeds.length > 1 ? { embed_count: rendered.embeds.length } : {}),
    });
  },
};
