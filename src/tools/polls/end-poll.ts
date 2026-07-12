import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { fetchMessageOrError } from "../messaging/message-shape.js";
import {
  POLLS_CATEGORY,
  pollFromMessage,
  serializeAnswer,
  serializePollSummary,
} from "./poll-shape.js";

const inputSchema = z.object({
  message_id: snowflakeId.describe("ID of the poll message (returned by send_poll)"),
  channel_id: snowflakeId.optional().describe("Direct channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Channel alias within project"),
});

export const endPoll = defineTool({
  name: "end_poll",
  description:
    "Immediately close a native Discord poll before its scheduled expiry — use when consensus " +
    "is already reached or the decision window is over. Ending a poll is irreversible: no " +
    "further votes are accepted. Returns the final per-answer tallies (counts only); call " +
    "get_poll_results afterwards for voter-level detail. Idempotent — closing an " +
    "already-finalized poll returns its tallies with already_finalized: true instead of " +
    "erroring.",
  category: POLLS_CATEGORY,
  inputSchema,
  destructive: true,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return { content: [{ type: "text", text: target.error }], isError: true };
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

    // Discord rejects ending an already-expired poll — return the final
    // tallies instead so retries and racing agents converge on the same state.
    if (poll.resultsFinalized) {
      return toolResultJson({
        message_id: input.message_id,
        channel_id: target.channelId,
        ...serializePollSummary(poll),
        finalized: true,
        already_finalized: true,
        answers: [...poll.answers.values()].map(serializeAnswer),
      });
    }

    const endedMessage = await poll.end();
    // Prefer the post-end payload; fall back to the pre-end poll if the
    // response omitted it.
    const endedPoll = endedMessage.poll ?? poll;

    return toolResultJson({
      message_id: input.message_id,
      channel_id: target.channelId,
      ...serializePollSummary(endedPoll),
      finalized: true,
      answers: [...endedPoll.answers.values()].map(serializeAnswer),
    });
  },
});
