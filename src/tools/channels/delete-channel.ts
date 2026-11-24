import { z } from "zod";
import { defineTool, toolResult, type ToolContext } from "../types.js";
import { snowflakeId, sendersRetired } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";
import {
  checkWebhookSenders,
  hasSenderInventory,
  inventoryProjects,
  retiredNote,
} from "../../config/webhook-senders.js";

const inputSchema = z.object({
  channel_id: snowflakeId.describe("Channel ID to delete"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
  senders_retired: sendersRetired,
});

type ChannelWithWebhooks = {
  fetchWebhooks: () => Promise<{ values(): Iterable<{ id: string; name: string | null }> }>;
};

/** Deleting a channel deletes its webhooks, so it answers to the same inventory. */
async function inspect(input: z.infer<typeof inputSchema>, ctx: ToolContext) {
  const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
  const channel = await ctx.discord.getAnyChannel(input.channel_id, token);
  const refuse = (why: string) =>
    toolResult(`Refusing to delete #${channel.name} (${input.channel_id}): ${why}`, true);

  // Categories and threads own no webhooks.
  if (
    inventoryProjects(channel.guildId, ctx.config).length === 0 ||
    !("fetchWebhooks" in channel)
  ) {
    return { channel, senders: [] as string[] };
  }

  let webhooks: Array<{ id: string; name: string | null }>;
  try {
    const fetched = await (channel as unknown as ChannelWithWebhooks).fetchWebhooks();
    webhooks = [...fetched.values()];
  } catch (err) {
    if (input.senders_retired) return { channel, senders: [] as string[] };
    const detail = err instanceof Error ? err.message : String(err);
    return {
      channel,
      senders: [] as string[],
      error: refuse(
        `its webhooks could not be listed (${detail}), so their senders are unknown. Grant the bot ` +
          "Manage Webhooks, or pass senders_retired: true once nothing sends to this channel.",
      ),
    };
  }

  const { refusal, senders } = checkWebhookSenders(webhooks, channel.guildId, ctx.config);
  return {
    channel,
    senders,
    error: refusal && !input.senders_retired ? refuse(refusal) : undefined,
  };
}

export const deleteChannel = defineTool({
  name: "delete_channel",
  description:
    "Delete a channel and its webhooks. This is irreversible. When the guild has a " +
    "webhook_senders inventory, refuses a channel holding webhooks with listed or unknown " +
    "senders unless senders_retired is true.",
  category: "channels",
  inputSchema,
  destructive: true,
  permissions: ["ManageChannels"],
  requiresGuild: true,
  preflight: async (input, ctx) =>
    hasSenderInventory(ctx.config) ? (await inspect(input, ctx)).error : undefined,
  handle: async (input, ctx) => {
    const { channel, senders, error } = await inspect(input, ctx);
    if (error) return error;

    const name = channel.name;
    await channel.delete();

    return toolResult(`Deleted channel #${name} (${input.channel_id})${retiredNote(senders)}`);
  },
});
