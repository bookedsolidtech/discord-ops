import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { POLLS_CATEGORY } from "./poll-shape.js";

const answerSchema = z.object({
  text: z.string().min(1).max(55).describe("Answer text (max 55 chars)"),
  emoji: z
    .string()
    .optional()
    .describe("Optional emoji shown next to the answer (unicode like ✅ or custom <:name:id>)"),
});

const inputSchema = z.object({
  question: z.string().min(1).max(300).describe("Poll question text (max 300 chars)"),
  answers: z
    .array(answerSchema)
    .min(2)
    .max(10)
    .describe("2-10 answer options voters choose between"),
  duration_hours: z
    .number()
    .int()
    .min(1)
    .max(768)
    .default(24)
    .describe("How long the poll accepts votes, in hours (1-768, default 24)"),
  allow_multiselect: z
    .boolean()
    .default(false)
    .describe("Allow voters to select multiple answers (default false — single choice)"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const sendPoll = defineTool({
  name: "send_poll",
  description:
    "Create a native Discord poll — a structured voting surface for reaching consensus between " +
    "agents and humans. Unlike reaction-voting (unstructured, no tallies), polls give every " +
    "participant the same fixed answer set, Discord counts the votes, and get_poll_results " +
    "returns per-answer counts plus WHO voted (with bot flags). Note: a poll message cannot " +
    "also carry content or embeds — post context as a separate message first. Returns the " +
    "message_id and answer_ids needed to read results with get_poll_results or close early " +
    "with end_poll.",
  category: POLLS_CATEGORY,
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);

    const allowMultiselect = input.allow_multiselect ?? false;
    const message = await channel.send({
      poll: {
        question: { text: input.question },
        answers: input.answers.map((answer) => ({
          text: answer.text,
          ...(answer.emoji ? { emoji: answer.emoji } : {}),
        })),
        duration: input.duration_hours ?? 24,
        allowMultiselect,
      },
    });

    // Discord assigns answer ids server-side (1-based, in submission order).
    // Read them back from the created message; fall back to positional ids
    // if the gateway response omitted the poll payload.
    const answerIds = message.poll
      ? [...message.poll.answers.keys()]
      : input.answers.map((_, index) => index + 1);

    return toolResultJson({
      id: message.id,
      message_id: message.id,
      channel_id: message.channelId,
      question: input.question,
      answer_ids: answerIds,
      expires_at: message.poll?.expiresAt ? message.poll.expiresAt.toISOString() : null,
      allow_multiselect: allowMultiselect,
      ...(target.project ? { project: target.project } : {}),
    });
  },
});
