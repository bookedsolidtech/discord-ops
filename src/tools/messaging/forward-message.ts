import { z } from "zod";
import type { TextChannel } from "discord.js";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { fetchMessageOrError } from "./message-shape.js";

const inputSchema = z.object({
  message_id: snowflakeId.describe("ID of the message to forward"),
  channel_id: snowflakeId.optional().describe("Direct source channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Source channel alias within project"),
  to_channel: z
    .string()
    .optional()
    .describe("Destination channel alias, resolved via the same project routing"),
  to_channel_id: snowflakeId.optional().describe("Direct destination channel ID"),
});

export const forwardMessage = defineTool({
  name: "forward_message",
  description:
    "Forward a message to another channel as an immutable snapshot — the escalation primitive. " +
    "Use it to promote a conclusion out of a work thread into a summary or announcements channel, " +
    "escalate an error report to an alerts channel, or quote evidence across channels without " +
    "copy-paste drift: the forward preserves the original content, author, and attachments and " +
    "cannot be edited after the fact. Provide the source via channel/channel_id + message_id and " +
    "the destination via to_channel (alias) or to_channel_id.",
  category: "messaging",
  inputSchema,
  permissions: ["SendMessages"],
  handle: async (input, ctx) => {
    if (!input.to_channel && !input.to_channel_id) {
      return toolResult("Provide a destination: to_channel (alias) or to_channel_id", true);
    }

    // Resolve source (message location) and destination via the same project routing.
    const source = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in source) {
      return toolResult(`Cannot resolve source: ${source.error}`, true);
    }

    const destination = await resolveTarget(
      {
        channel_id: input.to_channel_id,
        channel: input.to_channel,
        project: input.project,
        guild_id: input.guild_id,
      },
      ctx.config,
      ctx.discord,
    );
    if ("error" in destination) {
      return toolResult(`Cannot resolve destination: ${destination.error}`, true);
    }

    if (destination.channelId === source.channelId) {
      return toolResult("Destination channel is the same as the source channel", true);
    }

    const sourceChannel = await ctx.discord.getChannel(source.channelId, source.token);
    const fetched = await fetchMessageOrError(sourceChannel, input.message_id, source.channelId);
    if ("error" in fetched) {
      return toolResult(fetched.error, true);
    }

    // Fetch the destination through the same client to fail fast on bad IDs
    // or non-text channels before calling forward().
    const destChannel = await ctx.discord.getChannel(destination.channelId, destination.token);
    const forwarded = await fetched.message.forward(destChannel as TextChannel);

    return toolResultJson({
      id: forwarded.id,
      message_id: forwarded.id,
      forwarded_from: {
        channel_id: source.channelId,
        message_id: input.message_id,
      },
      channel_id: destination.channelId,
    });
  },
});
