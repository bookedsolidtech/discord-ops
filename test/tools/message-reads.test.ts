import { describe, it, expect, vi } from "vitest";
import { getMessage } from "../../src/tools/messaging/get-message.js";
import { getReactions } from "../../src/tools/messaging/get-reactions.js";
import { getReplies } from "../../src/tools/messaging/get-replies.js";
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
    config: createMockConfig(),
  };
}

function createBrokenRoutingCtx(): ToolContext {
  const ctx = createCtx();
  ctx.config.global.default_project = undefined;
  ctx.config.global.projects = {};
  return ctx;
}

function createMockReaction(
  emojiName: string,
  users: Array<{ id: string; username: string; bot?: boolean }>,
) {
  return {
    emoji: { name: emojiName, toString: () => emojiName },
    count: users.length,
    users: {
      fetch: vi.fn().mockResolvedValue(new Map(users.map((u) => [u.id, u]))),
    },
  };
}

describe("get_message", () => {
  it("fetches a single message with reply, pin, edit, and thread metadata", async () => {
    const msg = createMockMessage({
      id: "111111111111111111",
      type: 19, // MessageType.Reply
      reference: { messageId: "110000000000000000" },
      pinned: true,
      editedAt: new Date("2026-01-02T00:00:00Z"),
      hasThread: true,
      thread: { id: "555555555555555555" },
      author: { tag: "PeerAgent#0001", id: "333333333333333333", bot: true },
    });
    const mockChannel = createMockChannel({
      messages: { fetch: vi.fn().mockResolvedValue(msg) },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getMessage.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.id).toBe("111111111111111111");
    expect(data.author).toBe("PeerAgent#0001");
    expect(data.author_bot).toBe(true);
    expect(data.reply_to).toBe("110000000000000000");
    expect(data.pinned).toBe(true);
    expect(data.edited_timestamp).toBe("2026-01-02T00:00:00.000Z");
    expect(data.has_thread).toBe(true);
    expect(data.thread_id).toBe("555555555555555555");
    expect(Array.isArray(data.attachments)).toBe(true);
    expect(Array.isArray(data.embeds)).toBe(true);
    expect(Array.isArray(data.reactions)).toBe(true);
  });

  it("returns null/false defaults for a plain unedited message", async () => {
    const ctx = createCtx();
    const result = await getMessage.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.reply_to).toBeNull();
    expect(data.pinned).toBe(false);
    expect(data.edited_timestamp).toBeNull();
    expect(data.has_thread).toBe(false);
    expect(data.thread_id).toBeNull();
    expect(data.author_bot).toBe(false);
  });

  it("returns an error when the message does not exist", async () => {
    const mockChannel = createMockChannel({
      messages: {
        fetch: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Unknown Message"), { code: 10008 })),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getMessage.handle(
      { message_id: "123456789012345678", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("surfaces non-not-found fetch failures instead of reporting not found", async () => {
    const mockChannel = createMockChannel({
      messages: {
        fetch: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Missing Access"), { code: 50001 })),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getMessage.handle(
      { message_id: "123456789012345678", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing Access");
    expect(result.content[0]!.text).not.toContain("not found");
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createBrokenRoutingCtx();
    const result = await getMessage.handle({ message_id: "111111111111111111" }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe("get_reactions", () => {
  it("returns who reacted with each emoji, including bot flags", async () => {
    const ack = createMockReaction("✅", [
      { id: "333333333333333333", username: "peer-agent", bot: true },
      { id: "334444444444444444", username: "human-dev", bot: false },
    ]);
    const claim = createMockReaction("\u{1F440}", [
      { id: "335555555555555555", username: "other-agent", bot: true },
    ]);
    const msg = createMockMessage({ reactions: { cache: [ack, claim] } });
    const mockChannel = createMockChannel({
      messages: { fetch: vi.fn().mockResolvedValue(msg) },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getReactions.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222", limit: 100 },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.message_id).toBe("111111111111111111");
    expect(data.reactions).toHaveLength(2);
    expect(data.reactions[0]).toEqual({
      emoji: "✅",
      emoji_name: "✅",
      count: 2,
      users: [
        { id: "333333333333333333", username: "peer-agent", bot: true },
        { id: "334444444444444444", username: "human-dev", bot: false },
      ],
    });
    expect(data.reactions[1].emoji).toBe("\u{1F440}");
    expect(data.reactions[1].users).toHaveLength(1);
  });

  it("filters to a single emoji when the emoji param is provided", async () => {
    const ack = createMockReaction("✅", [
      { id: "333333333333333333", username: "peer-agent", bot: true },
    ]);
    const block = createMockReaction("\u{1F6D1}", [
      { id: "334444444444444444", username: "blocker-agent", bot: true },
    ]);
    const msg = createMockMessage({ reactions: { cache: [ack, block] } });
    const mockChannel = createMockChannel({
      messages: { fetch: vi.fn().mockResolvedValue(msg) },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getReactions.handle(
      {
        message_id: "111111111111111111",
        channel_id: "222222222222222222",
        emoji: "\u{1F6D1}",
        limit: 100,
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.reactions).toHaveLength(1);
    expect(data.reactions[0].emoji).toBe("\u{1F6D1}");
    // The filtered-out reaction's users were never fetched
    expect(ack.users.fetch).not.toHaveBeenCalled();
  });

  it("forwards the limit to users.fetch", async () => {
    const ack = createMockReaction("✅", [
      { id: "333333333333333333", username: "peer-agent", bot: true },
    ]);
    const msg = createMockMessage({ reactions: { cache: [ack] } });
    const mockChannel = createMockChannel({
      messages: { fetch: vi.fn().mockResolvedValue(msg) },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getReactions.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222", limit: 5 },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(ack.users.fetch).toHaveBeenCalledWith({ limit: 5 });
  });

  it("returns a round-trippable identifier for custom emojis", async () => {
    const customReaction = {
      emoji: { name: "deploy", toString: () => "<:deploy:123456789012345678>" },
      count: 1,
      users: {
        fetch: vi
          .fn()
          .mockResolvedValue(new Map([["1", { id: "1", username: "ops-bot", bot: true }]])),
      },
    };
    const msg = createMockMessage({
      reactions: { cache: [customReaction] },
    });
    const mockChannel = createMockChannel({
      messages: { fetch: vi.fn().mockResolvedValue(msg) },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getReactions.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.reactions[0].emoji).toBe("<:deploy:123456789012345678>");
    expect(data.reactions[0].emoji_name).toBe("deploy");
  });

  it("returns an empty list for a message with no reactions", async () => {
    const ctx = createCtx();
    const result = await getReactions.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.reactions).toEqual([]);
  });

  it("returns an error when the message does not exist", async () => {
    const mockChannel = createMockChannel({
      messages: {
        fetch: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Unknown Message"), { code: 10008 })),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getReactions.handle(
      { message_id: "123456789012345678", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createBrokenRoutingCtx();
    const result = await getReactions.handle({ message_id: "111111111111111111" }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe("get_replies", () => {
  const targetId = "500000000000000000";

  function buildScanChannel() {
    // Newest-first, mirroring Discord API ordering.
    const scanned = new Map([
      [
        "500000000000000004",
        createMockMessage({
          id: "500000000000000004",
          content: "done, shipping it",
          type: 19, // MessageType.Reply
          reference: { messageId: targetId },
        }),
      ],
      [
        "500000000000000003",
        createMockMessage({
          id: "500000000000000003",
          content: "reply to something else",
          type: 19, // MessageType.Reply
          reference: { messageId: "499999999999999999" },
        }),
      ],
      [
        "500000000000000002",
        createMockMessage({ id: "500000000000000002", content: "unrelated chatter" }),
      ],
      [
        "500000000000000001",
        createMockMessage({
          id: "500000000000000001",
          content: "on it",
          type: 19, // MessageType.Reply
          reference: { messageId: targetId },
        }),
      ],
    ]);
    // fetch(id) resolves the anchor-existence probe; fetch({ after, limit })
    // resolves the scan window.
    const fetch = vi
      .fn()
      .mockImplementation((arg) =>
        typeof arg === "string"
          ? Promise.resolve(createMockMessage({ id: arg }))
          : Promise.resolve(scanned),
      );
    return { channel: createMockChannel({ messages: { fetch } }), fetch };
  }

  it("excludes system messages that reference the target (pins, thread starters)", async () => {
    const scanned = new Map([
      [
        "500000000000000005",
        createMockMessage({
          id: "500000000000000005",
          content: "",
          type: 6, // MessageType.ChannelPinnedMessage — references the pinned message
          reference: { messageId: targetId },
        }),
      ],
    ]);
    const fetch = vi
      .fn()
      .mockImplementation((arg) =>
        typeof arg === "string"
          ? Promise.resolve(createMockMessage({ id: arg }))
          : Promise.resolve(scanned),
      );
    const channel = createMockChannel({ messages: { fetch } });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getReplies.handle(
      { message_id: targetId, channel_id: "222222222222222222" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.scanned).toBe(1);
    expect(data.replies).toEqual([]);
  });

  it("finds only direct replies to the target message", async () => {
    const { channel, fetch } = buildScanChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getReplies.handle(
      { message_id: targetId, channel_id: "222222222222222222", limit: 50 },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith({ after: targetId, limit: 50 });

    const data = JSON.parse(result.content[0]!.text);
    expect(data.message_id).toBe(targetId);
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.scanned).toBe(4);
    expect(data.replies).toHaveLength(2);
    const replyIds = data.replies.map((r: { id: string }) => r.id);
    expect(replyIds).toContain("500000000000000001");
    expect(replyIds).toContain("500000000000000004");
    for (const reply of data.replies) {
      expect(reply.reply_to).toBe(targetId);
    }
  });

  it("returns pagination fields: scanned count and newest scanned id", async () => {
    const { channel } = buildScanChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getReplies.handle(
      { message_id: targetId, channel_id: "222222222222222222", limit: 50 },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.scanned).toBe(4);
    expect(data.last_scanned_id).toBe("500000000000000004");
  });

  it("resumes from the after cursor on follow-up scans", async () => {
    const { channel, fetch } = buildScanChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getReplies.handle(
      {
        message_id: targetId,
        channel_id: "222222222222222222",
        after: "500000000000000004",
        limit: 50,
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith({ after: "500000000000000004", limit: 50 });
  });

  it("handles an empty scan window", async () => {
    const fetch = vi
      .fn()
      .mockImplementation((arg) =>
        typeof arg === "string"
          ? Promise.resolve(createMockMessage({ id: arg }))
          : Promise.resolve(new Map()),
      );
    const channel = createMockChannel({ messages: { fetch } });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getReplies.handle(
      { message_id: targetId, channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.scanned).toBe(0);
    expect(data.replies).toEqual([]);
    expect(data.last_scanned_id).toBeNull();
    // limit defaults to 100 when not provided (handle bypasses Zod defaults)
    expect(fetch).toHaveBeenCalledWith({ after: targetId, limit: 100 });
  });

  it("returns an error when the anchor message does not exist", async () => {
    const fetch = vi
      .fn()
      .mockImplementation((arg) =>
        typeof arg === "string"
          ? Promise.reject(Object.assign(new Error("Unknown Message"), { code: 10008 }))
          : Promise.resolve(new Map()),
      );
    const channel = createMockChannel({ messages: { fetch } });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getReplies.handle(
      { message_id: targetId, channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
    // The scan must not run when the anchor is missing.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createBrokenRoutingCtx();
    const result = await getReplies.handle({ message_id: targetId }, ctx);
    expect(result.isError).toBe(true);
  });
});
