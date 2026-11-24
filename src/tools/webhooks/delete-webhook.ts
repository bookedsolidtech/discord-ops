import { z } from "zod";
import { defineTool, toolResult, type ToolContext } from "../types.js";
import { snowflakeId, reason, sendersRetired } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";
import {
  checkWebhookSenders,
  hasSenderInventory,
  retiredNote,
} from "../../config/webhook-senders.js";

const inputSchema = z.object({
  webhook_id: snowflakeId.describe("Webhook ID to delete"),
  guild_id: snowflakeId.describe("Guild ID (needed for bot token resolution)"),
  reason,
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
  senders_retired: sendersRetired,
});

async function inspect(input: z.infer<typeof inputSchema>, ctx: ToolContext) {
  const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
  const client = await ctx.discord.getClient(token);
  const webhook = await client.fetchWebhook(input.webhook_id);
  const { refusal, senders } = checkWebhookSenders(
    [{ id: input.webhook_id, name: webhook.name }],
    webhook.guildId ?? input.guild_id,
    ctx.config,
  );
  const error =
    refusal && !input.senders_retired
      ? toolResult(`Refusing to delete webhook "${webhook.name}": ${refusal}`, true)
      : undefined;
  return { webhook, senders, error };
}

export const deleteWebhook = defineTool({
  name: "delete_webhook",
  description:
    "Delete a webhook. This is irreversible. Requires ManageWebhooks permission. When the " +
    "guild has a webhook_senders inventory, refuses webhooks with listed or unknown senders " +
    "unless senders_retired is true.",
  category: "webhooks",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  destructive: true,
  preflight: async (input, ctx) =>
    hasSenderInventory(ctx.config) ? (await inspect(input, ctx)).error : undefined,
  handle: async (input, ctx) => {
    const { webhook, senders, error } = await inspect(input, ctx);
    if (error) return error;

    const webhookName = webhook.name;
    await webhook.delete(input.reason);

    return toolResult(
      `Deleted webhook "${webhookName}" (${input.webhook_id})${retiredNote(senders)}`,
    );
  },
});
