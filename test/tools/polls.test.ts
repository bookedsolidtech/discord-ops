import { describe, it, expect, vi } from "vitest";
import { sendPoll } from "../../src/tools/polls/send-poll.js";
import { getPollResults } from "../../src/tools/polls/get-poll-results.js";
import { endPoll } from "../../src/tools/polls/end-poll.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockMessage,
  createMockChannel,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig() as any,
  };
}

function createBrokenRoutingCtx(): ToolContext {
  const ctx = createCtx();
  (ctx.config as any).global.default_project = undefined;
  (ctx.config as any).global.projects = {};
  return ctx;
}

interface MockVoter {
  id: string;
  username: string;
  bot?: boolean;
}

function createMockPollAnswer(
  id: number,
  text: string,
  options: { emoji?: string; count?: number; voters?: MockVoter[] } = {},
) {
  return {
    id,
    text,
    emoji: options.emoji ? { toString: () => options.emoji } : null,
    voteCount: options.count ?? 0,
    voters: {
      fetch: vi
        .fn()
        .mockResolvedValue(new Map((options.voters ?? []).map((voter) => [voter.id, voter]))),
    },
  };
}

function createMockPoll(overrides: Record<string, unknown> = {}) {
  return {
    question: { text: "Ship the release?" },
    answers: new Map([
      [
        1,
        createMockPollAnswer(1, "Ship it", {
          emoji: "✅",
          count: 2,
          voters: [
            { id: "333333333333333333", username: "peer-agent", bot: true },
            { id: "334444444444444444", username: "human-dev", bot: false },
          ],
        }),
      ],
      [
        2,
        createMockPollAnswer(2, "Hold", {
          count: 1,
          voters: [{ id: "335555555555555555", username: "other-agent", bot: true }],
        }),
      ],
    ]),
    expiresAt: new Date("2026-01-02T00:00:00Z"),
    allowMultiselect: false,
    resultsFinalized: false,
    end: vi.fn(),
    ...overrides,
  };
}

function createPollCtx(poll: unknown) {
  const message = createMockMessage({ poll });
  const channel = createMockChannel({
    messages: { fetch: vi.fn().mockResolvedValue(message) },
  });
  const ctx = createCtx();
  (ctx.discord.getChannel as any).mockResolvedValue(channel);
  return { ctx, channel, message };
}

describe("send_poll", () => {
  it("sends a native poll and returns message id, question, and answer_ids", async () => {
    const sentPoll = createMockPoll();
    const sentMessage = createMockMessage({ id: "121212121212121212", poll: sentPoll });
    const channel = createMockChannel({ send: vi.fn().mockResolvedValue(sentMessage) });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await sendPoll.handle(
      {
        question: "Ship the release?",
        answers: [{ text: "Ship it" }, { text: "Hold" }],
        channel_id: "222222222222222222",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("121212121212121212");
    expect(data.message_id).toBe("121212121212121212");
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.question).toBe("Ship the release?");
    expect(data.answer_ids).toEqual([1, 2]);
    expect(data.expires_at).toBe("2026-01-02T00:00:00.000Z");
    expect(data.allow_multiselect).toBe(false);
  });

  it("applies duration and multiselect defaults in the send payload", async () => {
    const channel = createMockChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    await sendPoll.handle(
      {
        question: "Ship the release?",
        answers: [{ text: "Ship it" }, { text: "Hold" }],
        channel_id: "222222222222222222",
      },
      ctx,
    );

    expect(channel.send).toHaveBeenCalledWith({
      poll: {
        question: { text: "Ship the release?" },
        answers: [{ text: "Ship it" }, { text: "Hold" }],
        duration: 24,
        allowMultiselect: false,
      },
    });
  });

  it("passes emoji, custom duration, and multiselect through to the poll payload", async () => {
    const channel = createMockChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    await sendPoll.handle(
      {
        question: "Which milestones matter?",
        answers: [
          { text: "Auth", emoji: "🔐" },
          { text: "Billing", emoji: "<:stripe:123456789012345678>" },
          { text: "Docs" },
        ],
        duration_hours: 72,
        allow_multiselect: true,
        channel_id: "222222222222222222",
      },
      ctx,
    );

    expect(channel.send).toHaveBeenCalledWith({
      poll: {
        question: { text: "Which milestones matter?" },
        answers: [
          { text: "Auth", emoji: "🔐" },
          { text: "Billing", emoji: "<:stripe:123456789012345678>" },
          { text: "Docs" },
        ],
        duration: 72,
        allowMultiselect: true,
      },
    });
  });

  it("falls back to positional answer_ids when the response omits poll data", async () => {
    const sentMessage = createMockMessage({ id: "121212121212121212", poll: null });
    const channel = createMockChannel({ send: vi.fn().mockResolvedValue(sentMessage) });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await sendPoll.handle(
      {
        question: "Ship the release?",
        answers: [{ text: "Ship it" }, { text: "Hold" }, { text: "Defer" }],
        channel_id: "222222222222222222",
      },
      ctx,
    );

    const data = JSON.parse(result.content[0]!.text);
    expect(data.answer_ids).toEqual([1, 2, 3]);
    expect(data.expires_at).toBeNull();
  });

  it("validates answer count and duration bounds at the schema level", () => {
    const base = { question: "Q?", channel_id: "222222222222222222" };
    expect(() => sendPoll.inputSchema.parse({ ...base, answers: [{ text: "Only" }] })).toThrow();
    expect(() =>
      sendPoll.inputSchema.parse({
        ...base,
        answers: Array.from({ length: 11 }, (_, i) => ({ text: `Option ${i}` })),
      }),
    ).toThrow();
    expect(() =>
      sendPoll.inputSchema.parse({
        ...base,
        answers: [{ text: "A" }, { text: "B" }],
        duration_hours: 0,
      }),
    ).toThrow();
    expect(() =>
      sendPoll.inputSchema.parse({
        ...base,
        answers: [{ text: "A" }, { text: "B" }],
        duration_hours: 800,
      }),
    ).toThrow();

    const parsed = sendPoll.inputSchema.parse({
      ...base,
      answers: [{ text: "A" }, { text: "B" }],
    }) as { duration_hours: number; allow_multiselect: boolean };
    expect(parsed.duration_hours).toBe(24);
    expect(parsed.allow_multiselect).toBe(false);
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createBrokenRoutingCtx();
    const result = await sendPoll.handle(
      { question: "Q?", answers: [{ text: "A" }, { text: "B" }] },
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});

describe("get_poll_results", () => {
  it("returns counts and voters for every answer, including bot flags", async () => {
    const { ctx } = createPollCtx(createMockPoll());

    const result = await getPollResults.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.message_id).toBe("111111111111111111");
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.question).toBe("Ship the release?");
    expect(data.expires_at).toBe("2026-01-02T00:00:00.000Z");
    expect(data.finalized).toBe(false);
    expect(data.allow_multiselect).toBe(false);
    expect(data.answers).toHaveLength(2);

    const [ship, hold] = data.answers;
    expect(ship.answer_id).toBe(1);
    expect(ship.text).toBe("Ship it");
    expect(ship.emoji).toBe("✅");
    expect(ship.count).toBe(2);
    expect(ship.voters).toEqual([
      { id: "333333333333333333", username: "peer-agent", bot: true },
      { id: "334444444444444444", username: "human-dev", bot: false },
    ]);
    expect(hold.answer_id).toBe(2);
    expect(hold.emoji).toBeNull();
    expect(hold.voters).toEqual([{ id: "335555555555555555", username: "other-agent", bot: true }]);
  });

  it("caps voter fetches at the default limit of 25 per answer", async () => {
    const poll = createMockPoll();
    const { ctx } = createPollCtx(poll);

    await getPollResults.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );

    for (const answer of poll.answers.values()) {
      expect(answer.voters.fetch).toHaveBeenCalledWith({ limit: 25 });
    }
  });

  it("surfaces multiselect and finalized state from the poll", async () => {
    const poll = createMockPoll({ allowMultiselect: true, resultsFinalized: true });
    const { ctx } = createPollCtx(poll);

    const result = await getPollResults.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );

    const data = JSON.parse(result.content[0]!.text);
    expect(data.allow_multiselect).toBe(true);
    expect(data.finalized).toBe(true);
  });

  it("filters to a single answer and paginates voters with after and limit", async () => {
    const poll = createMockPoll();
    const { ctx } = createPollCtx(poll);

    const result = await getPollResults.handle(
      {
        message_id: "111111111111111111",
        channel_id: "222222222222222222",
        answer_id: 1,
        after: "333333333333333333",
        limit: 50,
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.answers).toHaveLength(1);
    expect(data.answers[0].answer_id).toBe(1);
    expect(poll.answers.get(1)!.voters.fetch).toHaveBeenCalledWith({
      limit: 50,
      after: "333333333333333333",
    });
    expect(poll.answers.get(2)!.voters.fetch).not.toHaveBeenCalled();
  });

  it("returns an error listing valid answer_ids for an unknown answer_id", async () => {
    const { ctx } = createPollCtx(createMockPoll());

    const result = await getPollResults.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222", answer_id: 9 },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no answer_id 9");
    expect(result.content[0]!.text).toContain("1, 2");
  });

  it("rejects the after cursor without an answer_id", async () => {
    const { ctx } = createPollCtx(createMockPoll());

    const result = await getPollResults.handle(
      {
        message_id: "111111111111111111",
        channel_id: "222222222222222222",
        after: "333333333333333333",
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("answer_id");
  });

  it("returns an error when the message has no poll", async () => {
    const { ctx } = createPollCtx(null);

    const result = await getPollResults.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("does not contain a poll");
  });

  it("returns an error when the poll message does not exist", async () => {
    const channel = createMockChannel({
      messages: {
        fetch: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Unknown Message"), { code: 10008 })),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getPollResults.handle(
      { message_id: "123456789012345678", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("surfaces permission failures instead of reporting not found", async () => {
    const channel = createMockChannel({
      messages: {
        fetch: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Missing Access"), { code: 50001 })),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getPollResults.handle(
      { message_id: "123456789012345678", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing Access");
    expect(result.content[0]!.text).not.toContain("not found");
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createBrokenRoutingCtx();
    const result = await getPollResults.handle({ message_id: "111111111111111111" }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe("end_poll", () => {
  it("ends an active poll and returns final tallies without voters", async () => {
    const endedPoll = createMockPoll({ resultsFinalized: true });
    const poll = createMockPoll({
      end: vi.fn().mockResolvedValue(createMockMessage({ poll: endedPoll })),
    });
    const { ctx } = createPollCtx(poll);

    const result = await endPoll.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(poll.end).toHaveBeenCalledOnce();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.message_id).toBe("111111111111111111");
    expect(data.finalized).toBe(true);
    expect(data.already_finalized).toBeUndefined();
    expect(data.answers).toEqual([
      { answer_id: 1, text: "Ship it", emoji: "✅", count: 2 },
      { answer_id: 2, text: "Hold", emoji: null, count: 1 },
    ]);
  });

  it("reports finalized: true even when the end response omits poll data", async () => {
    const poll = createMockPoll({
      end: vi.fn().mockResolvedValue(createMockMessage({ poll: null })),
    });
    const { ctx } = createPollCtx(poll);

    const result = await endPoll.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.finalized).toBe(true);
    expect(data.answers).toHaveLength(2);
  });

  it("does not call end() on an already-finalized poll and flags it", async () => {
    const poll = createMockPoll({ resultsFinalized: true });
    const { ctx } = createPollCtx(poll);

    const result = await endPoll.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(poll.end).not.toHaveBeenCalled();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.finalized).toBe(true);
    expect(data.already_finalized).toBe(true);
    expect(data.answers).toHaveLength(2);
  });

  it("returns an error when the message has no poll", async () => {
    const { ctx } = createPollCtx(null);

    const result = await endPoll.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("does not contain a poll");
  });

  it("returns an error when the poll message does not exist", async () => {
    const channel = createMockChannel({
      messages: {
        fetch: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Unknown Message"), { code: 10008 })),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await endPoll.handle(
      { message_id: "123456789012345678", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("is marked destructive", () => {
    expect(endPoll.destructive).toBe(true);
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createBrokenRoutingCtx();
    const result = await endPoll.handle({ message_id: "111111111111111111" }, ctx);
    expect(result.isError).toBe(true);
  });
});
