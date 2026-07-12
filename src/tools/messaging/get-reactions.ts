import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";

const inputSchema = z.object({
  message_id: snowflakeId.describe("ID of the message to read reactions from"),
  emoji: z
    .string()
    .optional()
    .describe("Only return this emoji (unicode like ✅ or custom format <:name:id>)"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(100)
    .describe("Max users to list per emoji (default 100, max 100)"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const getReactions = defineTool({
  name: "get_reactions",
  description:
    "Read WHO reacted to a message and with what emoji. Use after send_message to detect " +
    "acknowledgments from humans or other agents — e.g. ✅ (ack/done), \u{1F440} (claimed/looking), " +
    "\u{1F6D1} (blocked/stop). Returns each emoji with its count and the users behind it, " +
    "including their bot flag so you can tell agent reactions from human ones.",
  category: "messaging",
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const message = await channel.messages.fetch(input.message_id).catch(() => undefined);
    if (!message) {
      return toolResult(
        `Message ${input.message_id} not found in channel ${target.channelId}`,
        true,
      );
    }

    const limit = input.limit ?? 100;
    const allReactions = [...(message.reactions?.cache?.values?.() ?? [])];
    const filtered = input.emoji
      ? allReactions.filter(
          (r) => r.emoji.name === input.emoji || r.emoji.toString() === input.emoji,
        )
      : allReactions;

    const reactions = [];
    for (const reaction of filtered) {
      const users = await reaction.users.fetch({ limit });
      reactions.push({
        emoji: reaction.emoji.name,
        count: reaction.count,
        users: [...users.values()].map((u) => ({
          id: u.id,
          username: u.username,
          bot: u.bot ?? false,
        })),
      });
    }

    return toolResultJson({
      message_id: input.message_id,
      reactions,
    });
  },
});
