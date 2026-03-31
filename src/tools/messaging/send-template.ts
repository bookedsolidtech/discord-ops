import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { resolveTarget } from "../../routing/resolver.js";
import { renderTemplate } from "../../templates/registry.js";
import { templateVarsSchema } from "../../templates/types.js";

const inputSchema = z.object({
  template: z
    .string()
    .describe(
      "Template name: release, deploy, ci_build, incident, incident_resolved, maintenance, status_update, review, celebration, welcome, shoutout, quote, announcement, changelog, milestone, tip, poll",
    ),
  vars: templateVarsSchema,
  channel_id: z.string().optional().describe("Direct channel ID"),
  guild_id: z.string().optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
  notification_type: z.string().optional().describe("Notification type for auto-routing"),
});

export const sendTemplate: ToolDefinition = {
  name: "send_template",
  description:
    "Send a beautifully formatted Discord embed using a built-in template. Templates include: release, deploy, ci_build, incident, celebration, welcome, shoutout, quote, announcement, changelog, milestone, status_update, maintenance, tip, poll, review. Use list_templates for full details.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = resolveTarget(input, ctx.config);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const rendered = renderTemplate(input.template, input.vars);
    const channel = await ctx.discord.getChannel(target.channelId, target.token);

    const message = await channel.send({
      content: rendered.content,
      embeds: rendered.embeds,
    });

    return toolResultJson({
      id: message.id,
      channel_id: message.channelId,
      template: input.template,
      timestamp: message.createdAt.toISOString(),
      ...(target.project ? { project: target.project } : {}),
    });
  },
};
