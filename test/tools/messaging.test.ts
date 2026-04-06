import { describe, it, expect, vi } from "vitest";
import { sendMessage } from "../../src/tools/messaging/send-message.js";
import { getMessages } from "../../src/tools/messaging/get-messages.js";
import { editMessage } from "../../src/tools/messaging/edit-message.js";
import { deleteMessage } from "../../src/tools/messaging/delete-message.js";
import { addReaction } from "../../src/tools/messaging/add-reaction.js";
import { searchMessages } from "../../src/tools/messaging/search.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockMessage,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

describe("send_message", () => {
  it("sends a message via project routing", async () => {
    const ctx = createCtx();
    const result = await sendMessage.handle(
      { content: "Hello world", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("222222222222222222", expect.anything());
  });

  it("sends a message via direct channel_id", async () => {
    const ctx = createCtx();
    const result = await sendMessage.handle(
      { content: "Direct", channel_id: "999999999999999999" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("999999999999999999", undefined);
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createCtx();
    ctx.config.global.default_project = undefined;
    ctx.config.global.projects = {};
    const result = await sendMessage.handle({ content: "Oops" }, ctx);
    expect(result.isError).toBe(true);
  });
});

describe("get_messages", () => {
  it("fetches messages from a channel", async () => {
    const ctx = createCtx();
    const result = await getMessages.handle({ channel_id: "222222222222222222", limit: 10 }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.channel_id).toBe("222222222222222222");
  });
});

describe("edit_message", () => {
  it("edits a message", async () => {
    const ctx = createCtx();
    const result = await editMessage.handle(
      { message_id: "111111111111111111", content: "Updated", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
  });
});

describe("delete_message", () => {
  it("deletes a message", async () => {
    const ctx = createCtx();
    const result = await deleteMessage.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Deleted");
  });
});

describe("add_reaction", () => {
  it("adds a reaction", async () => {
    const ctx = createCtx();
    const result = await addReaction.handle(
      { message_id: "111111111111111111", emoji: "\u{1F44D}", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Added reaction");
  });
});

describe("search_messages", () => {
  it("finds matching messages on page 1", async () => {
    const ctx = createCtx();
    // max_pages and limit must be passed explicitly since handle() bypasses Zod defaults.
    const result = await searchMessages.handle(
      { channel_id: "222222222222222222", query: "Test", max_pages: 1, limit: 25 },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.count).toBe(1);
    expect(data.messages[0].content).toContain("Test");
    expect(data.has_more).toBe(false);
  });

  it("returns nothing when query does not match", async () => {
    const ctx = createCtx();
    const result = await searchMessages.handle(
      { channel_id: "222222222222222222", query: "xyzzy-no-match", max_pages: 1, limit: 25 },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.count).toBe(0);
  });

  it("fetches page 2 when max_pages=2 and match is only in page 2", async () => {
    const ctx = createCtx();

    // Build 100 non-matching messages for page 1 using safe integer IDs
    // (base 500000000000 keeps us well within Number.MAX_SAFE_INTEGER).
    const page1Messages = new Map<string, ReturnType<typeof createMockMessage>>();
    for (let i = 0; i < 100; i++) {
      const id = String(500000000000 + i);
      page1Messages.set(id, createMockMessage({ id, content: "no match here" }));
    }
    // The last entry inserted is the oldest — its ID is the "before" cursor for page 2.
    const oldestPage1Id = String(500000000099);

    // Page-2 batch: a single matching message with an older (smaller) ID.
    const page2Match = createMockMessage({
      id: "400000000001",
      content: "found in page two",
    });
    const page2Messages = new Map([["400000000001", page2Match]]);

    const messagesFetch = vi
      .fn()
      .mockResolvedValueOnce(page1Messages)
      .mockResolvedValueOnce(page2Messages);

    const mockChannel = {
      id: "222222222222222222",
      isTextBased: () => true,
      messages: { fetch: messagesFetch },
    };
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await searchMessages.handle(
      { channel_id: "222222222222222222", query: "page two", max_pages: 2, limit: 25 },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.count).toBe(1);
    expect(data.messages[0].content).toBe("found in page two");
    // Page 2 returned fewer than 100 messages so no more history exists.
    expect(data.has_more).toBe(false);

    // Verify the second fetch used the correct "before" cursor.
    expect(messagesFetch).toHaveBeenCalledTimes(2);
    expect(messagesFetch).toHaveBeenNthCalledWith(2, { limit: 100, before: oldestPage1Id });
  });
});
