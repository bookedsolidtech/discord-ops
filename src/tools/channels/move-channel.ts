import { z } from "zod";
import type { NonThreadGuildBasedChannel } from "discord.js";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z
  .object({
    channel_id: snowflakeId.describe("Channel or category to move"),
    before_id: snowflakeId
      .optional()
      .describe("Place this channel directly before this channel ID"),
    after_id: snowflakeId.optional().describe("Place this channel directly after this channel ID"),
    project: z
      .string()
      .optional()
      .describe("Project name (resolves bot token for multi-bot setups)"),
  })
  .refine((d) => d.before_id ?? d.after_id, {
    message: "Provide either before_id or after_id",
  })
  .refine((d) => !(d.before_id && d.after_id), {
    message: "Provide before_id or after_id, not both",
  });

export const moveChannel: ToolDefinition = {
  name: "move_channel",
  description:
    "Move a channel or category to a position immediately before or after another channel. Uses before_id/after_id instead of raw position integers.",
  category: "channels",
  inputSchema,
  permissions: ["ManageChannels"],
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const channel = await ctx.discord.getAnyChannel(input.channel_id, token);

    const guild = channel.guild;
    const refId = (input.before_id ?? input.after_id)!;

    // Fetch the reference channel to get its current position
    const refChannel = (await guild.channels.fetch(refId)) as NonThreadGuildBasedChannel | null;
    if (!refChannel) {
      return {
        content: [{ type: "text", text: `Reference channel ${refId} not found` }],
        isError: true,
      };
    }

    // Collect siblings — channels in the same parent (or top-level if no parent)
    const siblings = [...guild.channels.cache.values()]
      .filter(
        (c): c is NonThreadGuildBasedChannel => "position" in c && c.parentId === channel.parentId,
      )
      .sort((a, b) => a.position - b.position);

    const refIndex = siblings.findIndex((c) => c.id === refId);
    if (refIndex === -1) {
      return {
        content: [{ type: "text", text: `Reference channel ${refId} is not in the same category` }],
        isError: true,
      };
    }

    // before_id → insert at ref's position; after_id → insert at ref's position + 1
    const targetPosition = input.before_id ? refChannel.position : refChannel.position + 1;

    await guild.channels.setPositions([{ channel: input.channel_id, position: targetPosition }]);

    // Re-fetch to confirm final position
    const updated = (await guild.channels.fetch(
      input.channel_id,
    )) as NonThreadGuildBasedChannel | null;

    return toolResultJson({
      id: input.channel_id,
      name: updated?.name,
      position: updated?.position ?? null,
      ...(input.before_id
        ? { moved: "before", reference_id: input.before_id }
        : { moved: "after", reference_id: input.after_id }),
    });
  },
};
