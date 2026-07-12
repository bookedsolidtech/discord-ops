import type { Message, PartialPollAnswer, Poll, PollAnswer } from "discord.js";
import type { ToolCategory } from "../types.js";

/**
 * Native Discord polls are a new tool category not yet present in the
 * ToolCategory union (src/tools/types.ts). The double cast keeps these tools
 * compilable until "polls" is added to the union during registration in
 * src/tools/index.ts — at which point the cast collapses to a no-op.
 */
export const POLLS_CATEGORY = "polls" as unknown as ToolCategory;

/** Answers arrive as full or partial structures; both carry what we serialize. */
type PollAnswerLike = PollAnswer | PartialPollAnswer;

export interface SerializedVoter {
  id: string;
  username: string;
  bot: boolean;
}

export interface SerializedPollAnswer {
  answer_id: number;
  text: string | null;
  emoji: string | null;
  count: number;
  voters?: SerializedVoter[];
}

/**
 * Extract the native poll from a message, or an agent-actionable error when
 * the message has no poll attached.
 */
export function pollFromMessage(
  message: Message,
  messageId: string,
): { poll: Poll } | { error: string } {
  if (!message.poll) {
    return {
      error: `Message ${messageId} does not contain a poll. Pass the message_id returned by send_poll.`,
    };
  }
  return { poll: message.poll };
}

/**
 * Poll-level fields shared by get_poll_results and end_poll.
 */
export function serializePollSummary(poll: Poll) {
  return {
    question: poll.question.text,
    expires_at: poll.expiresAt ? poll.expiresAt.toISOString() : null,
    finalized: poll.resultsFinalized,
    allow_multiselect: poll.allowMultiselect,
  };
}

/**
 * Tally-only answer shape (no voter fetch — zero extra API calls).
 * `emoji` is round-trippable: the bare char for unicode, <:name:id> for
 * custom emojis — same convention as get_reactions.
 */
export function serializeAnswer(answer: PollAnswerLike): SerializedPollAnswer {
  return {
    answer_id: answer.id,
    text: answer.text,
    emoji: answer.emoji ? answer.emoji.toString() : null,
    count: answer.voteCount,
  };
}

/**
 * Answer shape including WHO voted, with the bot flag so consensus tooling
 * can distinguish agent votes from human votes. Voter count per answer is
 * capped by `limit`; page with `after` (last user ID of the previous page).
 */
export async function serializeAnswerWithVoters(
  answer: PollAnswerLike,
  options: { limit: number; after?: string },
): Promise<SerializedPollAnswer> {
  const voters = await answer.voters.fetch({
    limit: options.limit,
    ...(options.after ? { after: options.after } : {}),
  });
  return {
    ...serializeAnswer(answer),
    voters: [...voters.values()].map((user) => ({
      id: user.id,
      username: user.username,
      bot: user.bot ?? false,
    })),
  };
}
