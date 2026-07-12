import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { fetchMessageOrError } from "../messaging/message-shape.js";
import {
  POLLS_CATEGORY,
  pollFromMessage,
  serializeAnswerWithVoters,
  serializePollSummary,
  type SerializedPollAnswer,
} from "./poll-shape.js";

const inputSchema = z.object({
  message_id: snowflakeId.describe("ID of the poll message (returned by send_poll)"),
  answer_id: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Only return this answer — required when paginating voters with after"),
  after: snowflakeId
    .optional()
    .describe(
      "Voter pagination cursor: return voters with a user ID after this one (use with answer_id)",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .describe("Max voters listed per answer (default 25, max 100)"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const getPollResults = defineTool({
  name: "get_poll_results",
  description:
    "Read the current state of a native Discord poll: per-answer vote counts plus WHO voted, " +
    "with bot flags so consensus tooling can weigh agent votes vs human votes. Works on live " +
    "and finished polls (finalized tells you which). Voters are capped at `limit` per answer; " +
    "when an answer's count exceeds its voters list, page through with answer_id + after " +
    "(last user ID of the previous page).",
  category: POLLS_CATEGORY,
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
    }

    if (input.after && input.answer_id === undefined) {
      return toolResult(
        "The after cursor paginates voters within a single answer — pass answer_id alongside it.",
        true,
      );
    }

    const channel = await ctx.discord.getChannel(target.channelId, target.token);
    const fetched = await fetchMessageOrError(channel, input.message_id, target.channelId);
    if ("error" in fetched) {
      return toolResult(fetched.error, true);
    }

    const extracted = pollFromMessage(fetched.message, input.message_id);
    if ("error" in extracted) {
      return toolResult(extracted.error, true);
    }
    const poll = extracted.poll;

    const limit = input.limit ?? 25;
    const answers: SerializedPollAnswer[] = [];

    if (input.answer_id !== undefined) {
      const answer = poll.answers.get(input.answer_id);
      if (!answer) {
        const validIds = [...poll.answers.keys()].join(", ");
        return toolResult(
          `Poll on message ${input.message_id} has no answer_id ${input.answer_id}. Valid answer_ids: ${validIds}`,
          true,
        );
      }
      answers.push(
        await serializeAnswerWithVoters(answer, {
          limit,
          ...(input.after ? { after: input.after } : {}),
        }),
      );
    } else {
      for (const answer of poll.answers.values()) {
        answers.push(await serializeAnswerWithVoters(answer, { limit }));
      }
    }

    return toolResultJson({
      message_id: input.message_id,
      channel_id: target.channelId,
      ...serializePollSummary(poll),
      answers,
    });
  },
});
